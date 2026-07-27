import { google } from 'googleapis'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  )

  const { tokens } = await oauth2Client.getToken(code)
  const refreshToken = tokens.refresh_token

  // 测试阶段:先假设只有一个理发师,实际项目里需要从登录状态获取 stylist_id
  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('id').limit(1).maybeSingle()

  if (stylist && refreshToken) {
    await supabaseAdmin.rpc('encrypt_and_store_token', {
      p_stylist_id: stylist.id,
      p_token: refreshToken,
      p_key: process.env.TOKEN_ENCRYPTION_KEY,
    })
  }

  return new Response('Google Calendar 授权成功!可以关闭这个页面了。')
}