import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createCalendarEvent, getFreeBusy, isSlotFree, zonedTimeToUtcISO } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

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
    return Response.json({ error: 'Session expired' }, { status: 401 })
  }

  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('id').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Account not found' }, { status: 404 })
  }

  // manualDate/manualTime/manualDurationMin are only used when the request
  // was created before the calendar was connected (requested_start/end are
  // null) — the Settings page prompts the owner for a time and sends it here.
  const { requestId, action, manualDate, manualTime, manualDurationMin, overrideConflict } = await req.json()
  if (!requestId || !['confirm', 'decline'].includes(action)) {
    return Response.json({ error: 'Invalid parameters' }, { status: 400 })
  }

  const { data: reqRow } = await supabaseAdmin
    .from('appointment_requests').select('*').eq('id', requestId).eq('stylist_id', stylist.id).maybeSingle()
  if (!reqRow) {
    return Response.json({ error: 'Appointment request not found' }, { status: 404 })
  }

  if (action === 'decline') {
    await supabaseAdmin.from('appointment_requests').update({ status: 'declined' }).eq('id', requestId)
    return Response.json({ success: true })
  }

  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('timezone').eq('stylist_id', stylist.id).maybeSingle()
  const timeZone = biz?.timezone || 'America/New_York'

  // This request came in while the calendar wasn't connected, so it has no
  // requested_start/end — we need a time from the owner before we can write
  // anything to the calendar. Ask for one instead of failing with a
  // misleading "check your calendar connection" error.
  let startISO = reqRow.requested_start
  let endISO = reqRow.requested_end
  if (!startISO || !endISO) {
    if (!manualDate || !manualTime) {
      return Response.json({
        error: 'This request has no time on file — please enter a date and time to confirm it.',
        needsManualTime: true,
      }, { status: 400 })
    }
    startISO = zonedTimeToUtcISO(manualDate, manualTime, timeZone)
    endISO = new Date(new Date(startISO).getTime() + (manualDurationMin || 60) * 60000).toISOString()
  }

  // Check for a real conflict before committing to the calendar. Without
  // this, two customers can be confirmed into the exact same slot — the
  // manual-confirm path previously wrote straight to the calendar with no
  // availability check at all.
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
      // A failed availability check shouldn't silently block a confirmation —
      // fall through and let createCalendarEvent below surface a real error
      // (e.g. auth failure) if the connection itself is the problem.
      console.error('Free/busy check failed, proceeding without it:', err)
    }
  }

  try {
    await createCalendarEvent(stylist.id, {
      summary: `Appointment: ${reqRow.service_type || 'Service'}`,
      description: `Customer phone: ${reqRow.phone_number}\nNotes: ${reqRow.notes || ''}`,
      startISO,
      endISO,
      timeZone,
    })
    await supabaseAdmin.from('appointment_requests')
      .update({ status: 'confirmed', requested_start: startISO, requested_end: endISO })
      .eq('id', requestId)
    return Response.json({ success: true })
  } catch (err) {
    console.error('Failed to write confirmed appointment to calendar:', err)
    return Response.json({ error: 'Failed to write to calendar — please check your Google Calendar connection' }, { status: 500 })
  }
}
