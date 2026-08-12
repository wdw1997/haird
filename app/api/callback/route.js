import { google } from 'googleapis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { consumeOauthState } from '@/lib/oauth-state'

// NOTE: this route duplicates app/api/google/callback/route.js and appears
// to be leftover/unused (GOOGLE_REDIRECT_URI should point at
// /api/google/callback). Keeping the same state-token fix here defensively
// in case this URL is still registered in the Google OAuth client, but this
// route should be deleted once you've confirmed nothing points at it.
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
    return new Response('Missing authorization parameters — please restart authorization from the settings page', { status: 400 })
  }

  const stylistId = await consumeOauthState(supabaseAdmin, rawState, 'google')
  if (!stylistId) {
    return new Response('Authorization expired or invalid — please restart authorization from the settings page', { status: 400 })
  }

  const stylistResult = await supabaseAdmin
    .from('stylists')
    .select('id')
    .eq('id', stylistId)
    .maybeSingle()
  const stylist = stylistResult.data

  if (!stylist) {
    return new Response('Matching account not found', { status: 404 })
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
      console.error('Google did not return a refresh_token, stylist:', stylistId)
      return Response.redirect(redirectBase + '/?calendar=no_refresh_token')
    }

    const rpcResult = await supabaseAdmin.rpc('encrypt_and_store_token', {
      p_stylist_id: stylist.id,
      p_token: refreshToken,
      p_key: process.env.TOKEN_ENCRYPTION_KEY,
    })

    if (rpcResult.error) {
      console.error('Failed to store token:', rpcResult.error)
      return Response.redirect(redirectBase + '/?calendar=save_failed')
    }

    return Response.redirect(redirectBase + '/?calendar=connected')
  } catch (err) {
    console.error('Google OAuth callback failed:', err)
    return Response.redirect(redirectBase + '/?calendar=error')
  }
}
