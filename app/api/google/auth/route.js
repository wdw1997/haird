import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req) {
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

  const supabaseAdmin = getSupabaseAdmin()
  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('id').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!stylist) {
    return Response.json({ error: '未找到账号信息' }, { status: 404 })
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.readonly'],
    prompt: 'consent',
    state: stylist.id, // 关键：回调时靠这个认出是哪个账号
  })

  return Response.json({ url })
}
