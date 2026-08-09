import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/resend-client'

export const dynamic = 'force-dynamic'

// Only these fields are safe to expose on a public, unauthenticated page.
// Never return stylist.email, twilio_number, tokens, etc. here.
function publicBusinessView(biz, stylistName) {
  return {
    business_name: biz?.business_name || stylistName || 'Book an appointment',
    address: biz?.address || null,
    contact_phone: biz?.contact_phone || null,
    services: Array.isArray(biz?.services) ? biz.services : [],
  }
}

// Very light phone validation — just enough to reject obvious junk.
// Real formatting/validation happens once it's a real conversation.
function isPlausiblePhone(phone) {
  const digits = (phone || '').replace(/[^\d]/g, '')
  return digits.length >= 10 && digits.length <= 15
}

export async function GET(req, { params }) {
  const { stylistId } = params
  const supabaseAdmin = getSupabaseAdmin()

  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('id, name').eq('id', stylistId).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('*').eq('stylist_id', stylistId).maybeSingle()

  return Response.json(publicBusinessView(biz, stylist.name))
}

export async function POST(req, { params }) {
  const { stylistId } = params
  const supabaseAdmin = getSupabaseAdmin()

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const phone = (body.phone || '').trim()
  const name = (body.name || '').trim().slice(0, 100)
  const message = (body.message || '').trim().slice(0, 500)
  const service = (body.service || '').trim().slice(0, 100)
  const agreed = body.agreed === true

  if (!isPlausiblePhone(phone)) {
    return Response.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  }
  // The opt-in checkbox/language is what makes this page valid for carrier
  // toll-free verification — a submission without explicit consent doesn't
  // get treated as consent to text this number.
  if (!agreed) {
    return Response.json({ error: 'Please confirm you agree to receive text messages.' }, { status: 400 })
  }

  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('id, name, email').eq('id', stylistId).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  // Normalize to E.164-ish so this lines up with how numbers arrive via SMS
  // (from Twilio/Telnyx) and can be matched against the same clients row later.
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

  const { data: request, error } = await supabaseAdmin
    .from('appointment_requests')
    .insert({
      stylist_id: stylistId,
      client_id: matchedClientId,
      phone_number: normalizedPhone,
      service_type: service || null,
      notes: message || null,
      status: 'new',
    })
    .select('id').single()

  if (error) {
    console.error('Failed to save booking request:', error)
    return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  // Best-effort notification — the request is already saved even if the email fails.
  if (stylist.email) {
    await sendEmail({
      to: stylist.email,
      subject: `New booking request from ${name || normalizedPhone}`,
      html: `<p>You have a new request from your booking page.</p>
        <p><strong>Name:</strong> ${name || 'Not provided'}<br/>
        <strong>Phone:</strong> ${normalizedPhone}<br/>
        <strong>Service:</strong> ${service || 'Not specified'}</p>
        ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings">View in your dashboard</a></p>`,
    })
  }

  return Response.json({ success: true, id: request.id })
}
