import { google } from 'googleapis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'

export async function GET(req) {
  const supabaseAdmin = getSupabaseAdmin()

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return Response.json({ error: 'Please log in first' }, { status: 401 })
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) {
    return Response.json({ error: 'Session expired, please log in again' }, { status: 401 })
  }

  const { data: stylist } = await supabaseAdmin
    .from('stylists')
    .select('id, google_cal_refresh_token_encrypted')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()

  if (!stylist) {
    return Response.json({ error: 'Account not found' }, { status: 404 })
  }

  if (!stylist.google_cal_refresh_token_encrypted) {
    return Response.json({ error: 'Google Calendar is not connected yet — please connect it from the home page first' }, { status: 400 })
  }

  try {
    const { data: refreshToken, error: decryptError } = await supabaseAdmin.rpc('decrypt_stylist_token', {
      p_stylist_id: stylist.id,
      p_key: process.env.TOKEN_ENCRYPTION_KEY,
    })

    if (decryptError || !refreshToken) {
      console.error('Failed to decrypt token:', decryptError)
      return Response.json({ error: 'Failed to read authorization info — please reconnect Google Calendar' }, { status: 500 })
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    oauth2Client.setCredentials({ refresh_token: refreshToken })

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const now = new Date()
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

    const result = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: sevenDaysLater.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    })

    const events = (result.data.items || []).map((event) => ({
      id: event.id,
      title: event.summary || '(No title)',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
    }))

    return Response.json({ events })
  } catch (err) {
    const message = err?.response?.data?.error === 'invalid_grant'
      ? 'Authorization has expired — please reconnect Google Calendar'
      : 'Failed to load calendar — please try again later'
    console.error('Failed to load Google Calendar:', err)
    return Response.json({ error: message }, { status: 500 })
  }
}
