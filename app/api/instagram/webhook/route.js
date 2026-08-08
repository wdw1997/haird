import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isQuotaExceeded, checkAndNotifyQuota } from '@/lib/quota'
import { matchSimpleQuestion } from '@/lib/templates'
import { checkRepeatSpam, notifyStylistOfSpam } from '@/lib/spam-detect'
import { generateAssistantReply } from '@/lib/ai-reply'
import { sendInstagramMessage } from '@/lib/instagram-client'

export const dynamic = 'force-dynamic'
const CHANNEL = 'instagram'

// Meta calls this once, at setup time, to verify you own the endpoint.
export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()
  const payload = await req.json()

  if (payload.object !== 'instagram') return new Response('OK', { status: 200 })

  for (const entry of payload.entry || []) {
    const igAccountId = entry.id
    for (const event of entry.messaging || []) {
      // Ignore echoes of our own outbound messages and non-text events (reactions, etc)
      if (event.message?.is_echo) continue
      const senderId = event.sender?.id
      const text = (event.message?.text || '').trim()
      if (!senderId || !text) continue

      await handleIncomingMessage(supabaseAdmin, igAccountId, senderId, text)
    }
  }

  return new Response('OK', { status: 200 })
}

async function handleIncomingMessage(supabaseAdmin, igAccountId, senderId, body) {
  const { data: conn } = await supabaseAdmin
    .from('instagram_connections').select('stylist_id, ig_user_id').eq('ig_user_id', igAccountId).maybeSingle()
  if (!conn) {
    console.error('No stylist connected for Instagram account:', igAccountId)
    return
  }

  const { data: stylist } = await supabaseAdmin.from('stylists').select('*').eq('id', conn.stylist_id).maybeSingle()
  if (!stylist) return

  const { data: tokenRow, error: decryptError } = await supabaseAdmin.rpc('decrypt_ig_token', {
    p_stylist_id: stylist.id, p_key: process.env.TOKEN_ENCRYPTION_KEY,
  })
  if (decryptError || !tokenRow) {
    console.error('Failed to decrypt Instagram token for stylist:', stylist.id)
    return
  }
  const accessToken = tokenRow

  let matchedClientId = null

  const reply = async (text) => {
    await supabaseAdmin.from('messages').insert({
      stylist_id: stylist.id, client_id: matchedClientId, phone_number: senderId, direction: 'outbound', body: text, channel: CHANNEL,
    })
    try {
      await sendInstagramMessage(conn.ig_user_id, accessToken, senderId, text)
    } catch (err) {
      console.error('Failed to send Instagram reply:', err)
    }
  }

  const { data: existingClient } = await supabaseAdmin
    .from('clients').select('id').eq('phone_number', senderId).eq('stylist_id', stylist.id).maybeSingle()
  if (existingClient) matchedClientId = existingClient.id

  await supabaseAdmin.from('messages').insert({
    stylist_id: stylist.id, client_id: matchedClientId, phone_number: senderId, direction: 'inbound', body, channel: CHANNEL,
  })

  const { data: optedOut } = await supabaseAdmin
    .from('opted_out_numbers').select('phone_number').eq('phone_number', senderId).maybeSingle()
  if (optedOut) return

  const today = new Date().toISOString().slice(0, 10)
  const { data: rl } = await supabaseAdmin
    .from('client_rate_limits').select('*').eq('phone_number', senderId).maybeSingle()
  const now = new Date()
  let dayCount = rl?.day_reset_at === today ? rl.day_count : 0
  let minuteCount = rl && (now - new Date(rl.minute_reset_at)) < 60000 ? rl.minute_count : 0

  if (dayCount >= 6 || minuteCount >= 5) {
    await supabaseAdmin.from('client_rate_limits').upsert({
      phone_number: senderId, day_count: dayCount, day_reset_at: today,
      minute_count: minuteCount + 1,
      minute_reset_at: minuteCount === 0 ? now : rl.minute_reset_at,
      last_message_at: now, channel: CHANNEL,
    })
    return reply("We've received your message and someone will follow up shortly.")
  }
  await supabaseAdmin.from('client_rate_limits').upsert({
    phone_number: senderId, day_count: dayCount + 1, day_reset_at: today,
    minute_count: minuteCount + 1,
    minute_reset_at: minuteCount === 0 ? now : rl.minute_reset_at,
    last_message_at: now, channel: CHANNEL,
  })

  const { isSpam, justTripped } = await checkRepeatSpam(supabaseAdmin, rl, senderId, body)
  if (isSpam) {
    if (justTripped) await notifyStylistOfSpam(stylist, senderId)
    return reply("We've received your message and someone will follow up shortly.")
  }

  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('*').eq('stylist_id', stylist.id).maybeSingle()

  const templateReply = matchSimpleQuestion(body, biz)
  if (templateReply) return reply(templateReply)

  if (isQuotaExceeded(stylist, 'sms')) {
    return reply("Thanks for reaching out! We'll get back to you as soon as possible.")
  }

  let { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, name, formulas(formula_text, created_at)')
    .eq('phone_number', senderId).eq('stylist_id', stylist.id)
    .order('created_at', { referencedTable: 'formulas', ascending: false })
    .limit(1, { referencedTable: 'formulas' })
    .maybeSingle()

  let isNewClient = false
  if (!client) {
    const { data: newClient, error } = await supabaseAdmin
      .from('clients').insert({ stylist_id: stylist.id, phone_number: senderId, name: null, channel: CHANNEL })
      .select('id, name').single()
    if (!error) { client = { ...newClient, formulas: [] }; isNewClient = true; matchedClientId = newClient.id }
  }

  const { reply: aiReply } = await generateAssistantReply({
    supabaseAdmin, stylist, biz, channel: CHANNEL, contactId: senderId, body,
    client, isNewClient, matchedClientId,
  })

  const newUsed = stylist.sms_used + 1
  await supabaseAdmin.from('stylists').update({ sms_used: newUsed }).eq('id', stylist.id)
  await checkAndNotifyQuota(supabaseAdmin, stylist, 'sms', newUsed)

  await reply(aiReply)
}
