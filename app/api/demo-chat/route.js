import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isQuotaExceeded, checkAndNotifyQuota } from '@/lib/quota'
import { generateAssistantReply } from '@/lib/ai-reply'

export const dynamic = 'force-dynamic'
const CHANNEL = 'demo'

// Requires the stylist to be logged in — this is a back-office tool for the
// business owner to test their own AI setup, not a public endpoint.
export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { stylistId, sessionId, message } = body
  if (!stylistId || !sessionId || !message?.trim()) {
    return Response.json({ error: 'Missing stylistId, sessionId, or message' }, { status: 400 })
  }

  const { data: stylist } = await supabaseAdmin.from('stylists').select('*').eq('id', stylistId).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Demo messages spend the SAME trial quota as real SMS — this IS the "3
  // free tries" a trial account gets, just without needing a real phone
  // number to deliver them through.
  if (isQuotaExceeded(stylist, 'sms')) {
    return Response.json({
      error: 'quota_exceeded',
      message: "You've used all your free demo messages. Upgrade to a paid plan to keep testing and get your own dedicated number.",
    }, { status: 402 })
  }

  const { data: biz } = await supabaseAdmin.from('business_settings').select('*').eq('stylist_id', stylistId).maybeSingle()

  // contactId is scoped to this demo session only — never a real phone
  // number — so it never collides with a real customer's message history.
  const contactId = `demo-${sessionId}`

  await supabaseAdmin.from('messages').insert({
    stylist_id: stylistId, phone_number: contactId, channel: CHANNEL, direction: 'inbound', body: message.trim(),
  })

  const { reply } = await generateAssistantReply({
    supabaseAdmin, stylist, biz, channel: CHANNEL, contactId, body: message.trim(),
    client: null, isNewClient: true, matchedClientId: null,
  })

  await supabaseAdmin.from('messages').insert({
    stylist_id: stylistId, phone_number: contactId, channel: CHANNEL, direction: 'outbound', body: reply,
  })

  const newUsed = (stylist.sms_used || 0) + 1
  await supabaseAdmin.from('stylists').update({ sms_used: newUsed }).eq('id', stylistId)
  await checkAndNotifyQuota(supabaseAdmin, stylist, 'sms', newUsed)

  const remaining = Math.max(0, (stylist.sms_limit || 0) + (stylist.bonus_sms || 0) - newUsed)
  return Response.json({ reply, remaining })
}
