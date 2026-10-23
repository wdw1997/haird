import { createHash } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { checkAndNotifyQuota } from '@/lib/quota'
import { generateAssistantReply } from '@/lib/ai-reply'
import { isWebChatEnabled } from '@/lib/web-chat'

export const dynamic = 'force-dynamic'
const CHANNEL = 'web'

// Limits for this public, unauthenticated endpoint. Every message costs an AI
// call that is billed against the salon's quota, so abuse protection matters.
const MAX_MESSAGE_CHARS = 500
const PER_SESSION_PER_HOUR = 25
const PER_IP_PER_HOUR = 40
const PER_SALON_PER_HOUR = 300

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isPlausiblePhone(phone) {
  const digits = (phone || '').replace(/[^\d]/g, '')
  return digits.length >= 10 && digits.length <= 15
}

function clientIp(req) {
  const fwd = req.headers.get('x-forwarded-for')
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || 'unknown').trim()
}

export async function POST(req, { params }) {
  const { stylistId } = await params
  const supabaseAdmin = getSupabaseAdmin()

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const sessionId = String(body.sessionId || '')
  const message = String(body.message || '').trim()
  const name = String(body.name || '').trim().slice(0, 100)
  const phone = String(body.phone || '').trim()
  const agreed = body.agreed === true

  if (!UUID_RE.test(sessionId) || !message) {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }
  if (message.length > MAX_MESSAGE_CHARS) {
    return Response.json({ error: `Please keep messages under ${MAX_MESSAGE_CHARS} characters.` }, { status: 400 })
  }
  if (!isPlausiblePhone(phone)) {
    return Response.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  }
  // Same opt-in as the booking form: the customer is texted when the owner
  // confirms, so consent has to be given before the conversation starts.
  if (!agreed) {
    return Response.json({ error: 'Please confirm you agree to receive text messages.' }, { status: 400 })
  }

  const { data: stylist } = await supabaseAdmin.from('stylists').select('*').eq('id', stylistId).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  if (!isWebChatEnabled(stylist)) {
    return Response.json({ error: 'chat_unavailable', message: 'This chat has reached its limit for now — please use the booking form or call us.' }, { status: 403 })
  }

  // Rate limits: per browser session, per IP, and per salon.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const ipHash = createHash('sha256').update(clientIp(req)).digest('hex').slice(0, 32)
  const historyKey = `web-${sessionId}`

  const [sessionHits, ipHits, salonHits] = await Promise.all([
    supabaseAdmin.from('messages').select('id', { count: 'exact', head: true })
      .eq('stylist_id', stylistId).eq('phone_number', historyKey).eq('direction', 'inbound').gte('created_at', hourAgo),
    supabaseAdmin.from('web_chat_hits').select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash).gte('created_at', hourAgo),
    supabaseAdmin.from('web_chat_hits').select('id', { count: 'exact', head: true })
      .eq('stylist_id', stylistId).gte('created_at', hourAgo),
  ])
  if ((sessionHits.count || 0) >= PER_SESSION_PER_HOUR
    || (ipHits.count || 0) >= PER_IP_PER_HOUR
    || (salonHits.count || 0) >= PER_SALON_PER_HOUR) {
    return Response.json({ error: 'rate_limited', message: 'Lots of messages in a short time — please try again a bit later, or use the booking form.' }, { status: 429 })
  }
  await supabaseAdmin.from('web_chat_hits').insert({ ip_hash: ipHash, stylist_id: stylistId })

  const { data: biz } = await supabaseAdmin.from('business_settings').select('*').eq('stylist_id', stylistId).maybeSingle()

  const digits = phone.replace(/[^\d]/g, '')
  const normalizedPhone = digits.length === 10 ? `+1${digits}` : `+${digits}`

  let matchedClientId = null
  const { data: existingClient } = await supabaseAdmin
    .from('clients').select('id').eq('phone_number', normalizedPhone).eq('stylist_id', stylistId).maybeSingle()
  if (existingClient) {
    matchedClientId = existingClient.id
  } else {
    const { data: newClient } = await supabaseAdmin
      .from('clients').insert({ stylist_id: stylistId, phone_number: normalizedPhone, name: name || null, channel: 'web' })
      .select('id').single()
    if (newClient) matchedClientId = newClient.id
  }

  await supabaseAdmin.from('messages').insert({
    stylist_id: stylistId, client_id: matchedClientId, phone_number: historyKey, channel: CHANNEL, direction: 'inbound', body: message,
  })

  // Anyone can type any phone number here, so the AI is deliberately given
  // NO stored client details (formulas, history) and a history scoped to this
  // browser session — a stranger can't use someone else's number to read
  // their data back out of the assistant.
  const { reply, booking } = await generateAssistantReply({
    supabaseAdmin, stylist, biz, channel: CHANNEL, contactId: historyKey, body: message,
    client: null, isNewClient: true, matchedClientId,
    historyKey, customerPhone: normalizedPhone, customerName: name || null, smsConsent: true,
  })

  await supabaseAdmin.from('messages').insert({
    stylist_id: stylistId, client_id: matchedClientId, phone_number: historyKey, channel: CHANNEL, direction: 'outbound', body: reply,
  })

  const newUsed = (stylist.sms_used || 0) + 1
  await supabaseAdmin.from('stylists').update({ sms_used: newUsed }).eq('id', stylistId)
  await checkAndNotifyQuota(supabaseAdmin, stylist, 'sms', newUsed)

  return Response.json({ reply, requested: !!booking })
}
