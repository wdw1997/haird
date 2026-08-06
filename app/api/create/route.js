import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createCalendarEvent } from '@/lib/google-calendar'

export const dynamic = 'force-dynamic'

export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return Response.json({ error: '请先登录' }, { status: 401 })
  }

  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) {
    return Response.json({ error: '登录已过期' }, { status: 401 })
  }

  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('id, google_cal_refresh_token_encrypted').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!stylist) {
    return Response.json({ error: '未找到账号信息' }, { status: 404 })
  }
  if (!stylist.google_cal_refresh_token_encrypted) {
    return Response.json({ error: '尚未连接Google日历' }, { status: 400 })
  }

  const body = await req.json()
  const { summary, description, startISO, endISO, timeZone } = body

  if (!summary || !startISO || !endISO) {
    return Response.json({ error: '缺少必要字段(summary/startISO/endISO)' }, { status: 400 })
  }

  try {
    const event = await createCalendarEvent(stylist.id, {
      summary, description, startISO, endISO, timeZone: timeZone || 'America/New_York',
    })
    return Response.json({ success: true, event })
  } catch (err) {
    console.error('创建日历事件失败:', err)
    const message = err?.response?.data?.error === 'invalid_grant'
      ? '授权已失效，请重新连接Google日历'
      : '创建预约失败，请稍后重试'
    return Response.json({ error: message }, { status: 500 })
  }
}
