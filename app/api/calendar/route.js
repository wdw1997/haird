import { google } from 'googleapis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'

export async function GET(req) {
  const supabaseAdmin = getSupabaseAdmin()

  // 1. 验证登录
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return Response.json({ error: '请先登录' }, { status: 401 })
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) {
    return Response.json({ error: '登录已过期，请重新登录' }, { status: 401 })
  }

  // 2. 找到对应的 stylist
  const { data: stylist } = await supabaseAdmin
    .from('stylists')
    .select('id, google_cal_refresh_token_encrypted')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()

  if (!stylist) {
    return Response.json({ error: '未找到账号信息' }, { status: 404 })
  }

  if (!stylist.google_cal_refresh_token_encrypted) {
    return Response.json({ error: '尚未连接 Google 日历，请先在首页点击连接' }, { status: 400 })
  }

  try {
    // 3. 解密拿到 refresh_token
    const { data: refreshToken, error: decryptError } = await supabaseAdmin.rpc('decrypt_stylist_token', {
      p_stylist_id: stylist.id,
      p_key: process.env.TOKEN_ENCRYPTION_KEY,
    })

    if (decryptError || !refreshToken) {
      console.error('解密 token 失败:', decryptError)
      return Response.json({ error: '读取授权信息失败，请重新连接 Google 日历' }, { status: 500 })
    }

    // 4. 用 refresh_token 换 access_token 并调用 Google Calendar API
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
      title: event.summary || '(无标题)',
      start: event.start?.dateTime || event.start?.date,
      end: event.end?.dateTime || event.end?.date,
    }))

    return Response.json({ events })
  } catch (err) {
    // refresh_token 失效（比如用户在 Google 账号权限里手动撤销了授权）时，
    // googleapis 通常会抛 invalid_grant 错误，这里单独识别出来给出更清楚的提示
    const message = err?.response?.data?.error === 'invalid_grant'
      ? '授权已失效，请重新连接 Google 日历'
      : '读取日历失败，请稍后重试'
    console.error('读取 Google 日历失败:', err)
    return Response.json({ error: message }, { status: 500 })
  }
}
