import { google } from 'googleapis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { consumeOauthState } from '@/lib/oauth-state'

export async function GET(req) {
  const supabaseAdmin = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const rawState = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const redirectBase = process.env.NEXT_PUBLIC_APP_URL || 'https://www.veloceia.com'

  if (errorParam) {
    return Response.redirect(redirectBase + '/?calendar=cancelled')
  }
  if (!rawState || !code) {
    return new Response('授权参数缺失，请重新从设置页发起授权', { status: 400 })
  }

  // `state` must be redeemed through the one-time token we issued in
  // /api/google/auth — it is NOT the stylist id. This is what actually
  // proves the callback belongs to the logged-in user who started this
  // flow, instead of trusting a value an attacker could set themselves.
  const stylistId = await consumeOauthState(supabaseAdmin, rawState, 'google')
  if (!stylistId) {
    return new Response('授权已过期或无效，请重新从设置页发起授权', { status: 400 })
  }

  const stylistResult = await supabaseAdmin
    .from('stylists')
    .select('id')
    .eq('id', stylistId)
    .maybeSingle()
  const stylist = stylistResult.data

  if (!stylist) {
    return new Response('未找到对应账号', { status: 404 })
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )
    const tokenResult = await oauth2Client.getToken(code)
    const refreshToken = tokenResult.tokens.refresh_token

    if (!refreshToken) {
      console.error('Google未返回refresh_token，stylist:', stylistId)
      return Response.redirect(redirectBase + '/?calendar=no_refresh_token')
    }

    const rpcResult = await supabaseAdmin.rpc('encrypt_and_store_token', {
      p_stylist_id: stylist.id,
      p_token: refreshToken,
      p_key: process.env.TOKEN_ENCRYPTION_KEY,
    })

    if (rpcResult.error) {
      console.error('存储token失败:', rpcResult.error)
      return Response.redirect(redirectBase + '/?calendar=save_failed')
    }

    return Response.redirect(redirectBase + '/?calendar=connected')
  } catch (err) {
    console.error('Google OAuth callback失败:', err)
    return Response.redirect(redirectBase + '/?calendar=error')
  }
}
