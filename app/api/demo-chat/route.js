import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isQuotaExceeded, checkAndNotifyQuota } from '@/lib/quota'
import { generateAssistantReply } from '@/lib/ai-reply'

export const dynamic = 'force-dynamic'
const CHANNEL = 'demo'

// Requires the stylist to be logged in — this is a back-office tool for the
// business owner to test their own AI setup, not a public endpoint.
//
// The comment above used to be a lie: this route never actually checked the
// Authorization header, it just trusted whatever `stylistId` the client sent
// in the JSON body. Since stylist ids aren't secret (they're public in the
// /book/[stylistId] URL), that meant ANYONE could burn a business's real
// paid SMS/AI quota for free by POSTing here with their stylistId — no
// login required. Fixed below to require a valid session and to derive the
// stylist from that session instead of trusting client input.
export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return Response.json({ error: 'Please log in first' }, { status: 401 })
  }

  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) {
    return Response.json({ error: 'Session expired, please log in again' }, { status: 401 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { sessionId, message } = body
  if (!sessionId || !message?.trim()) {
    return Response.json({ error: 'Missing sessionId or message' }, { status: 400 })
  }

  // Always resolve the stylist from the authenticated session — never from
  // a client-supplied id — so a logged-in user can only ever burn their own
  // quota, not someone else's.
  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('*').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Account not found' }, { status: 404 })
  }
  const stylistId = stylist.id

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
