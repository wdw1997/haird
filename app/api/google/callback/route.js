import { google } from 'googleapis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req) {
  const supabaseAdmin = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stylistId = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const redirectBase = process.env.NEXT_PUBLIC_APP_URL || 'https://www.veloceia.com'

  if (errorParam) {
    return Response.redirect(`${redirectBase}/?calendar=cancelled`)
  }
  if (!stylistId || !code) {
    return new Response('授权参数缺失，请重新从设置页发起授权', { status: 400 })
  }

  const { data: stylist } = await supabaseAdmin.from('stylists').select('id').eq('id', stylistId).maybeSingle()
  if (!stylist) {
    return new Response('未找到对应账号', { status: 404 })
  }

  try {
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI)
    const { tokens } = await oauth2Client.getToken(code)
    const refreshToken = tokens.refresh_token

    if (!refreshToken) {
      console.error('Google未返回refresh_token，stylist:', stylistId)
      return Response.redirect(`${redirectBase}/?calendar=no_refresh_token`)
    }

    const { error:
