import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createCalendarEvent } from '@/lib/google-calendar'

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

  const { requestId, action } = await req.json()
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

  try {
    await createCalendarEvent(stylist.id, {
      summary: `Appointment: ${reqRow.service_type || 'Service'}`,
      description: `Customer phone: ${reqRow.phone_number}\nNotes: ${reqRow.notes || ''}`,
      startISO: reqRow.requested_start,
      endISO: reqRow.requested_end,
      timeZone: biz?.timezone || 'America/New_York',
    })
    await supabaseAdmin.from('appointment_requests').update({ status: 'confirmed' }).eq('id', requestId)
    return Response.json({ success: true })
  } catch (err) {
    console.error('Failed to write confirmed appointment to calendar:', err)
    return Response.json({ error: 'Failed to write to calendar — please check your Google Calendar connection' }, { status: 500 })
  }
}
