import twilio from 'twilio'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isQuotaExceeded, checkAndNotifyQuota } from '@/lib/quota'
import { matchSimpleQuestion } from '@/lib/templates'
import { checkRepeatSpam, notifyStylistOfSpam } from '@/lib/spam-detect'
import { generateAssistantReply } from '@/lib/ai-reply'

export const dynamic = 'force-dynamic'
const CHANNEL = 'sms'

export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()
  const formData = await req.formData()
  const params = Object.fromEntries(formData)

  const signature = req.headers.get('x-twilio-signature')
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/sms`
  if (!twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, params)) {
    return new Response('Forbidden', { status: 403 })
  }

  const from = params.From
  const to = params.To
  const body = (params.Body || '').trim()
  const bodyUpper = body.toUpperCase()

  const { data: stylist } = await supabaseAdmin
    .from('stylists')
    .select('*')
    .eq('twilio_number', to)
    .maybeSingle()

  if (!stylist) {
    console.error('No stylist found for number:', to)
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, this number is not currently active.</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }

  let matchedClientId = null
  const { data: existingClientForLog } = await supabaseAdmin
    .from('clients').select('id').eq('phone_number', from).eq('stylist_id', stylist.id).maybeSingle()
  if (existingClientForLog) matchedClientId = existingClientForLog.id

  await supabaseAdmin.from('messages').insert({
    stylist_id: stylist.id, client_id: matchedClientId, phone_number: from, direction: 'inbound', body, channel: CHANNEL,
  })

  const xmlReply = async (text) => {
    await supabaseAdmin.from('messages').insert({
      stylist_id: stylist.id, client_id: matchedClientId, phone_number: from, direction: 'outbound', body: text, channel: CHANNEL,
    })
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text}</Message></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(bodyUpper)) {
    await supabaseAdmin.from('opted_out_numbers').upsert({ phone_number: from, stylist_id: stylist.id })
    return xmlReply('You have been unsubscribed and will not receive further messages. Reply START to resubscribe.')
  }
  if (bodyUpper === 'START') {
    await supabaseAdmin.from('opted_out_numbers').delete().eq('phone_number', from)
    return xmlReply('You are resubscribed. Welcome back!')
  }
  const { data: optedOut } = await supabaseAdmin
    .from('opted_out_numbers').select('phone_number').eq('phone_number', from).maybeSingle()
  if (optedOut) return new Response('', { status: 200 })

  const today = new Date().toISOString().slice(0, 10)
  const { data: rl } = await supabaseAdmin
    .from('client_rate_limits').select('*').eq('phone_number', from).maybeSingle()
  const now = new Date()
  let dayCount = rl?.day_reset_at === today ? rl.day_count : 0
  let minuteCount = rl && (now - new Date(rl.minute_reset_at)) < 60000 ? rl.minute_count : 0

  if (dayCount >= 6 || minuteCount >= 5) {
    await supabaseAdmin.from('client_rate_limits').upsert({
      phone_number: from, day_count: dayCount, day_reset_at: today,
      minute_count: minuteCount + 1,
      minute_reset_at: minuteCount === 0 ? now : rl.minute_reset_at,
      last_message_at: now,
    })
    return xmlReply("We've received your message and someone will follow up shortly.")
  }
  await supabaseAdmin.from('client_rate_limits').upsert({
    phone_number: from, day_count: dayCount + 1, day_reset_at: today,
    minute_count: minuteCount + 1,
    minute_reset_at: minuteCount === 0 ? now : rl.minute_reset_at,
    last_message_at: now,
  })

  // Anomaly detection: same message sent over and over in a row = likely
  // spam/harassment rather than a normal conversation. Doesn't touch AI quota.
  const { isSpam, justTripped } = await checkRepeatSpam(supabaseAdmin, rl, from, body)
  if (isSpam) {
    if (justTripped) await notifyStylistOfSpam(stylist, from)
    return xmlReply("We've received your message and someone will follow up shortly.")
  }

  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('*').eq('stylist_id', stylist.id).maybeSingle()

  // Cheap rule-based answer for very common questions — skips the AI call
  // entirely (and doesn't consume the customer's AI reply quota).
  const templateReply = matchSimpleQuestion(body, biz)
  if (templateReply) {
    return xmlReply(templateReply)
  }

  if (isQuotaExceeded(stylist, 'sms')) {
    return xmlReply("Thanks for reaching out! We'll get back to you as soon as possible.")
  }

  let { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, name, formulas(formula_text, created_at)')
    .eq('phone_number', from).eq('stylist_id', stylist.id)
    .order('created_at', { referencedTable: 'formulas', ascending: false })
    .limit(1, { referencedTable: 'formulas' })
    .maybeSingle()

  let isNewClient = false
  if (!client) {
    const { data: newClient, error } = await supabaseAdmin
      .from('clients').insert({ stylist_id: stylist.id, phone_number: from, name: null })
      .select('id, name').single()
    if (!error) { client = { ...newClient, formulas: [] }; isNewClient = true; matchedClientId = newClient.id }
  }

  const { reply: aiReply } = await generateAssistantReply({
    supabaseAdmin, stylist, biz, channel: CHANNEL, contactId: from, body,
    client, isNewClient, matchedClientId,
  })

  const newUsed = stylist.sms_used + 1
  await supabaseAdmin.from('stylists').update({ sms_used: newUsed }).eq('id', stylist.id)
  await checkAndNotifyQuota(supabaseAdmin, stylist, 'sms', newUsed)

  return xmlReply(aiReply)
}
