import { google } from 'googleapis'
import { getSupabaseAdmin } from './supabase-admin'
import { sendEmail } from './resend-client'

async function getAuthedClient(stylistId) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: refreshToken, error } = await supabaseAdmin.rpc('decrypt_stylist_token', {
    p_stylist_id: stylistId,
    p_key: process.env.TOKEN_ENCRYPTION_KEY,
  })
  if (error || !refreshToken) return null

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return oauth2Client
}

// Google returns `invalid_grant` when a refresh token has been revoked,
// expired (7-day expiry for apps still in OAuth "Testing" status), or the
// user changed their Google password. This is a *permanent* failure — no
// amount of retrying fixes it, the salon owner has to reconnect. Anything
// else (network blip, rate limit) is transient and should NOT wipe the
// stored connection.
function isPermanentAuthError(err) {
  const code = err?.response?.data?.error || err?.errors?.[0]?.reason || ''
  return code === 'invalid_grant' || err?.message?.includes('invalid_grant')
}

// Called the moment we detect the stored token is dead. Clears it so the
// Settings page stops claiming "Connected" (the UI already knows how to
// show the "Connect Google Calendar" button whenever this field is empty —
// clearing it here is what flips that switch automatically), and emails
// the salon owner so they find out from us, not from a confused customer.
export async function disconnectAndNotify(stylistId) {
  const supabaseAdmin = getSupabaseAdmin()
  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('name, email').eq('id', stylistId).maybeSingle()

  await supabaseAdmin
    .from('stylists')
    .update({ google_cal_refresh_token_encrypted: null })
    .eq('id', stylistId)

  if (stylist?.email) {
    await sendEmail({
      to: stylist.email,
      subject: '⚠️ Your Google Calendar disconnected',
      html: `<p>Hi ${stylist.name || 'there'},</p>
        <p>Your Google Calendar connection has expired or been revoked. Your AI assistant can no longer check your real availability or add new bookings to your calendar until you reconnect it.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/settings">Reconnect your calendar</a> — it only takes a few seconds.</p>
        <p style="color:#888;font-size:12px;">In the meantime, appointment requests are still being collected and shown in your Settings page, they just won't be checked against your calendar automatically.</p>`,
    })
  }
}

// 查询未来一段时间的忙碌时段
export async function getFreeBusy(stylistId, timeMinISO, timeMaxISO) {
  const auth = await getAuthedClient(stylistId)
  if (!auth) return null
  try {
    const calendar = google.calendar({ version: 'v3', auth })
    const result = await calendar.freebusy.query({
      requestBody: { timeMin: timeMinISO, timeMax: timeMaxISO, items: [{ id: 'primary' }] },
    })
    return result.data.calendars?.primary?.busy || []
  } catch (err) {
    if (isPermanentAuthError(err)) {
      await disconnectAndNotify(stylistId)
      return null // fall back to "no calendar data" — same as never having connected
    }
    throw err // transient error — let the caller's existing error handling deal with it
  }
}

// 创建一个日历事件(预约)
export async function createCalendarEvent(stylistId, { summary, description, startISO, endISO, timeZone }) {
  const auth = await getAuthedClient(stylistId)
  if (!auth) throw new Error('未连接Google日历或授权已失效')
  try {
    const calendar = google.calendar({ version: 'v3', auth })
    const result = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: { dateTime: startISO, timeZone },
        end: { dateTime: endISO, timeZone },
      },
    })
    return result.data
  } catch (err) {
    if (isPermanentAuthError(err)) {
      await disconnectAndNotify(stylistId)
      throw new Error('未连接Google日历或授权已失效')
    }
    throw err
  }
}

// 判断某个时间段是否跟忙碌列表冲突
export function isSlotFree(busyList, startISO, endISO) {
  if (!busyList) return true // 没有日历数据(未连接)时不阻拦,交给人工判断
  const start = new Date(startISO).getTime()
  const end = new Date(endISO).getTime()
  return !busyList.some((b) => {
    const bStart = new Date(b.start).getTime()
    const bEnd = new Date(b.end).getTime()
    return start < bEnd && end > bStart
  })
}

// 把"某时区的某天某时刻"换算成UTC的ISO字符串,不依赖额外的时区库
// (用Intl API反推该时区在该时间点的偏移量,能正确处理夏令时)
export function zonedTimeToUtcISO(dateStr, timeStr, timeZone) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const asUTC = Date.UTC(y, m - 1, d, hh, mm)
  const tzDate = new Date(asUTC)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
  }).formatToParts(tzDate)
  const tzOffsetStr = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+0'
  const match = tzOffsetStr.match(/GMT([+-]\d+)(?::(\d+))?/)
  const offsetHours = match ? parseInt(match[1], 10) : 0
  const offsetMinutes = match && match[2] ? parseInt(match[2], 10) : 0
  const sign = offsetHours < 0 ? -1 : 1
  const offsetMillis = (offsetHours * 60 + sign * offsetMinutes) * 60000
  return new Date(asUTC - offsetMillis).toISOString()
}
