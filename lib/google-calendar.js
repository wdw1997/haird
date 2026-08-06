import { google } from 'googleapis'
import { getSupabaseAdmin } from './supabase-admin'

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

// 查询未来一段时间的忙碌时段
export async function getFreeBusy(stylistId, timeMinISO, timeMaxISO) {
  const auth = await getAuthedClient(stylistId)
  if (!auth) return null
  const calendar = google.calendar({ version: 'v3', auth })
  const result = await calendar.freebusy.query({
    requestBody: { timeMin: timeMinISO, timeMax: timeMaxISO, items: [{ id: 'primary' }] },
  })
  return result.data.calendars?.primary?.busy || []
}

// 创建一个日历事件(预约)
export async function createCalendarEvent(stylistId, { summary, description, startISO, endISO, timeZone }) {
  const auth = await getAuthedClient(stylistId)
  if (!auth) throw new Error('未连接Google日历或授权已失效')
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
