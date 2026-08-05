import { google } from 'googleapis'

async function getAuthClientForStylist(supabaseAdmin, stylistId) {
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

function classifyGoogleError(err) {
  const code = err?.response?.data?.error
  if (code === 'invalid_grant') return 'invalid_grant' // token失效,需要重新连接
  if (err?.response?.status === 403) return 'insufficient_scope' // 权限不够(比如还是旧的只读token)
  return 'unknown'
}

// 查某个时间段是否空闲
export async function checkSlotAvailable(supabaseAdmin, stylistId, startLocal, endLocal, timeZone) {
  const auth = await getAuthClientForStylist(supabaseAdmin, stylistId)
  if (!auth) return { available: null, error: 'not_connected' }

  const calendar = google.calendar({ version: 'v3', auth })
  try {
    const res = await calendar.freebusy.query({
      requestBody: {
        timeMin: startLocal,
        timeMax: endLocal,
        timeZone,
        items: [{ id: 'primary' }],
      },
    })
    const busy = res.data.calendars?.primary?.busy || []
    return { available: busy.length === 0 }
  } catch (err) {
    console.error('查询日历空闲状态失败:', err)
    return { available: null, error: classifyGoogleError(err) }
  }
}

// 创建一个日历事件
export async function createCalendarEvent(supabaseAdmin, stylistId, { summary, description, startLocal, endLocal, timeZone }) {
  const auth = await getAuthClientForStylist(supabaseAdmin, stylistId)
  if (!auth) return { error: 'not_connected' }

  const calendar = google.calendar({ version: 'v3', auth })
  try {
    const res = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary,
        description,
        start: { dateTime: startLocal, timeZone },
        end: { dateTime: endLocal, timeZone },
      },
    })
    return { eventId: res.data.id }
  } catch (err) {
    console.error('创建日历事件失败:', err)
    return { error: classifyGoogleError(err) }
  }
}
