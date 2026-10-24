import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createCalendarEvent, getFreeBusy, isSlotFree, zonedTimeToUtcISO } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

// For appointments the owner books themselves — a customer who phoned, or
// walked in. Same safeguards as confirming an online request:
//   - the time is read in the SALON's time zone (not the browser's),
//   - an overlap with the calendar is flagged first (the owner may override),
//   - the customer is saved to the client list when a phone number is given.
// No text is sent: the owner already agreed the time with them directly, and
// there is no text-message consent for this customer.
export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()

  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return Response.json({ error: 'Please log in first.' }, { status: 401 })

  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) {
    return Response.json({ error: 'Session expired, please log in again.' }, { status: 401 })
  }

  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('id, google_cal_refresh_token_encrypted').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!stylist) return Response.json({ error: 'Account not found.' }, { status: 404 })
  if (!stylist.google_cal_refresh_token_encrypted) {
    return Response.json({ error: 'Connect your Google Calendar first (Settings → Connections).' }, { status: 400 })
  }

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const clientName = String(body.clientName || '').trim().slice(0, 100)
  const phone = String(body.phone || '').trim()
  const service = String(body.service || '').trim().slice(0, 100)
  const notes = String(body.notes || '').trim().slice(0, 1000)
  const date = String(body.date || '').trim()
  const time = String(body.time || '').trim()
  const duration = Math.min(Math.max(Number(body.duration) || 60, 5), 600)
  const overrideConflict = body.overrideConflict === true

  if (!date || !time) return Response.json({ error: 'Please choose a date and time.' }, { status: 400 })

  // Phone is optional (a walk-in may not give one), but if it's there it has to look real.
  let normalizedPhone = null
  if (phone) {
    const digits = phone.replace(/[^\d]/g, '')
    if (digits.length < 10 || digits.length > 15) {
      return Response.json({ error: "That phone number doesn't look right." }, { status: 400 })
    }
    normalizedPhone = digits.length === 10 ? `+1${digits}` : `+${digits}`
  }

  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('timezone').eq('stylist_id', stylist.id).maybeSingle()
  const timeZone = biz?.timezone || 'America/New_York'

  let startISO, endISO
  try {
    startISO = zonedTimeToUtcISO(date, time, timeZone)
    endISO = new Date(new Date(startISO).getTime() + duration * 60000).toISOString()
  } catch {
    return Response.json({ error: 'That date/time looks invalid.' }, { status: 400 })
  }

  if (!overrideConflict) {
    try {
      const busy = await getFreeBusy(stylist.id, startISO, endISO)
      if (!isSlotFree(busy, startISO, endISO)) {
        return Response.json({
          error: 'This time overlaps with an existing appointment on your calendar.',
          hasConflict: true,
        }, { status: 409 })
      }
    } catch (err) {
      // Same choice as the confirm flow: a failed availability check doesn't block
      // the booking — a real connection problem will surface from the calendar write.
      console.error('Free/busy check failed, proceeding without it:', err)
    }
  }

  try {
    await createCalendarEvent(stylist.id, {
      summary: `Appointment: ${service || 'Service'} - ${clientName || 'Client'}`,
      description: [normalizedPhone && `Customer phone: ${normalizedPhone}`, notes && `Notes: ${notes}`, 'Added manually'].filter(Boolean).join('\n'),
      startISO, endISO, timeZone,
    })
  } catch (err) {
    console.error('Manual appointment: calendar write failed:', err)
    const message = err?.response?.data?.error === 'invalid_grant'
      ? 'Google Calendar access expired — please reconnect it in Settings.'
      : "Couldn't add the appointment. Please try again."
    return Response.json({ error: message }, { status: 500 })
  }

  // From here the calendar already has the appointment, so nothing below may
  // turn this into an error — the record-keeping is best-effort.
  let clientId = null
  try {
    if (normalizedPhone) {
      const { data: existing } = await supabaseAdmin
        .from('clients').select('id, name').eq('stylist_id', stylist.id).eq('phone_number', normalizedPhone).maybeSingle()
      if (existing) {
        clientId = existing.id
        if (!existing.name && clientName) {
          await supabaseAdmin.from('clients').update({ name: clientName }).eq('id', existing.id)
        }
      } else {
        const base = { stylist_id: stylist.id, phone_number: normalizedPhone, name: clientName || null }
        let { data: created, error: insertError } = await supabaseAdmin
          .from('clients').insert({ ...base, channel: 'phone' }).select('id').single()
        if (insertError) {
          // In case the channel column only accepts known values, retry without it.
          ;({ data: created } = await supabaseAdmin.from('clients').insert(base).select('id').single())
        }
        clientId = created?.id || null
      }
    }

    await supabaseAdmin.from('appointment_requests').insert({
      stylist_id: stylist.id,
      client_id: clientId,
      phone_number: normalizedPhone || '',
      service_type: service || null,
      notes: [clientName && `Client: ${clientName}`, notes].filter(Boolean).join('\n') || null,
      status: 'confirmed',
      requested_start: startISO,
      requested_end: endISO,
      source: 'phone',
      sms_consent: false,
    })
  } catch (err) {
    console.error('Manual appointment: record-keeping failed (calendar entry was created):', err)
  }

  return Response.json({ success: true, savedClient: !!clientId })
}
