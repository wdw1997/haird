import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/resend-client'
import { zonedTimeToUtcISO } from '@/lib/google-calendar'
import { isWebChatEnabled } from '@/lib/web-chat'
import { normalizeUsPhone } from '@/lib/phone'

export const dynamic = 'force-dynamic'

// Only these fields are safe to expose on a public, unauthenticated page.
// Never return stylist.email, twilio_number, tokens, etc. here.
function publicBusinessView(biz, stylistName, chatEnabled, canText) {
  return {
    business_name: biz?.business_name || stylistName || 'Book an appointment',
    address: biz?.address || null,
    contact_phone: biz?.contact_phone || null,
    services: Array.isArray(biz?.services) ? biz.services : [],
    chat_enabled: chatEnabled,
    // Only true once the salon has its own number; free trials can't send texts yet.
    can_text: canText,
  }
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export async function GET(req, { params }) {
  const { stylistId } = await params
  const supabaseAdmin = getSupabaseAdmin()

  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('*').eq('id', stylistId).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('*').eq('stylist_id', stylistId).maybeSingle()

  return Response.json(publicBusinessView(biz, stylist.name, isWebChatEnabled(stylist), !!stylist.twilio_number))
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

  // Two kinds of request share this endpoint: the regular form booking, and
  // a "call me back" request (no time picked, no text-message consent needed —
  // the owner phones the customer).
  const isCallback = body.type === 'callback'

  const phone = (body.phone || '').trim()
  const name = (body.name || '').trim().slice(0, 100)
  const message = (body.message || '').trim().slice(0, 500)
  const service = (body.service || '').trim().slice(0, 100)
  const date = (body.date || '').trim()
  const time = (body.time || '').trim()
  const callWindow = (body.callWindow || '').trim().slice(0, 100)
  const durationMin = Number(body.duration) || 60
  const agreed = body.agreed === true

  // US / Canada numbers only — that's what the text-message registration covers.
  const normalizedPhone = normalizeUsPhone(phone)
  if (!normalizedPhone) {
    return Response.json({ error: 'Please enter a valid US phone number.' }, { status: 400 })
  }
  if (!isCallback) {
    // The customer picks a preferred time up front now, instead of leaving
    // requested_start/end null until the owner manually sets one later —
    // that's what let old requests reach "Confirm" with no time on file.
    if (!date || !time) {
      return Response.json({ error: 'Please choose a preferred date and time.' }, { status: 400 })
    }
    // The opt-in checkbox/language is what makes this page valid for carrier
    // toll-free verification — a submission without explicit consent doesn't
    // get treated as consent to text this number.
    if (!agreed) {
      return Response.json({ error: 'Please confirm you agree to receive text messages.' }, { status: 400 })
    }
  }

  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('id, name, email').eq('id', stylistId).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // normalizedPhone (E.164) lines up with how numbers arrive via SMS, so it can
  // be matched against the same clients row later.

  // Basic abuse protection for a public endpoint: each request emails the
  // owner, so cap how many one number / one page can create per hour.
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const [{ count: fromThisPhone }, { count: forThisStylist }] = await Promise.all([
    supabaseAdmin.from('appointment_requests').select('id', { count: 'exact', head: true })
      .eq('stylist_id', stylistId).eq('phone_number', normalizedPhone).gte('created_at', hourAgo),
    supabaseAdmin.from('appointment_requests').select('id', { count: 'exact', head: true })
      .eq('stylist_id', stylistId).gte('created_at', hourAgo),
  ])
  if ((fromThisPhone || 0) >= 3 || (forThisStylist || 0) >= 40) {
    return Response.json({ error: 'Too many requests right now — please try again a little later or call us.' }, { status: 429 })
  }

  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('timezone').eq('stylist_id', stylistId).maybeSingle()
  const timeZone = biz?.timezone || 'America/New_York'

  let requestedStartISO = null
  let requestedEndISO = null
  if (!isCallback) {
    try {
      requestedStartISO = zonedTimeToUtcISO(date, time, timeZone)
      requestedEndISO = new Date(new Date(requestedStartISO).getTime() + durationMin * 60000).toISOString()
    } catch {
      return Response.json({ error: 'That date/time looks invalid — please try again.' }, { status: 400 })
    }
    if (new Date(requestedStartISO).getTime() < Date.now()) {
      return Response.json({ error: 'Please choose a date and time in the future.' }, { status: 400 })
    }
  }

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

  const notes = isCallback
    ? `Callback request${callWindow ? ` — best time to call: ${callWindow}` : ''}${message ? `\n${message}` : ''}`
    : (message || null)

  const { data: request, error } = await supabaseAdmin
    .from('appointment_requests')
    .insert({
      stylist_id: stylistId,
      client_id: matchedClientId,
      phone_number: normalizedPhone,
      service_type: service || null,
      notes,
      status: 'pending',
      requested_start: requestedStartISO,
      requested_end: requestedEndISO,
      source: isCallback ? 'callback' : 'form',
      // Only the form's checkbox is consent to be texted.
      sms_consent: !isCallback && agreed,
    })
    .select('id').single()

  if (error) {
    console.error('Failed to save booking request:', error)
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  // Best-effort notification — the request is already saved even if the email fails.
  if (stylist.email) {
    const safe = { name: escapeHtml(name || 'Not provided'), phone: escapeHtml(normalizedPhone), message: escapeHtml(message) }
    await sendEmail({
      to: stylist.email,
      subject: isCallback
        ? `Callback request from ${name || normalizedPhone}`
        : `New booking request from ${name || normalizedPhone}`,
      html: isCallback
        ? `<p>A customer asked you to call them back.</p>
          <p><strong>Name:</strong> ${safe.name}<br/>
          <strong>Phone:</strong> ${safe.phone}<br/>
          <strong>Best time to call:</strong> ${escapeHtml(callWindow || 'Not specified')}</p>
          ${message ? `<p><strong>Message:</strong> ${safe.message}</p>` : ''}
          <p>After you've agreed a time on the phone, enter it and confirm in <a href="${process.env.NEXT_PUBLIC_APP_URL}/settings">your dashboard</a>.</p>`
        : `<p>You have a new request from your booking page.</p>
          <p><strong>Name:</strong> ${safe.name}<br/>
          <strong>Phone:</strong> ${safe.phone}<br/>
          <strong>Service:</strong> ${escapeHtml(service || 'Not specified')}<br/>
          <strong>Requested time:</strong> ${escapeHtml(date)} ${escapeHtml(time)} (${escapeHtml(timeZone)})</p>
          ${message ? `<p><strong>Message:</strong> ${safe.message}</p>` : ''}
          <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings">View in your dashboard</a></p>`,
    })
  }

  return Response.json({ success: true, id: request.id })
}
