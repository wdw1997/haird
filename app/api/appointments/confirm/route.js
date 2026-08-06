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
    .from('stylists').select('id').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!stylist) {
    return Response.json({ error: '未找到账号信息' }, { status: 404 })
  }

  const { requestId, action } = await req.json()
  if (!requestId || !['confirm', 'decline'].includes(action)) {
    return Response.json({ error: '参数错误' }, { status: 400 })
  }

  const { data: reqRow } = await supabaseAdmin
    .from('appointment_requests').select('*').eq('id', requestId).eq('stylist_id', stylist.id).maybeSingle()
  if (!reqRow) {
    return Response.json({ error: '未找到该预约请求' }, { status: 404 })
  }

  if (action === 'decline') {
    await supabaseAdmin.from('appointment_requests').update({ status: 'declined' }).eq('id', requestId)
    return Response.json({ success: true })
  }

  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('timezone').eq('stylist_id', stylist.id).maybeSingle()

  try {
    await createCalendarEvent(stylist.id, {
      summary: `预约: ${reqRow.service_type || '服务'}`,
      description: `顾客电话: ${reqRow.phone_number}\n备注: ${reqRow.notes || ''}`,
      startISO: reqRow.requested_start,
      endISO: reqRow.requested_end,
      timeZone: biz?.timezone || 'America/New_York',
    })
    await supabaseAdmin.from('appointment_requests').update({ status: 'confirmed' }).eq('id', requestId)
    return Response.json({ success: true })
  } catch (err) {
    console.error('确认预约写入日历失败:', err)
    return Response.json({ error: '写入日历失败，请检查Google日历连接状态' }, { status: 500 })
  }
}
