import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { exchangeCodeForShortLivedToken, exchangeForLongLivedToken, getInstagramProfile } from '@/lib/instagram-client'

export async function GET(req) {
  const supabaseAdmin = getSupabaseAdmin()
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const stylistId = searchParams.get('state')
  const errorParam = searchParams.get('error')
  const redirectBase = process.env.NEXT_PUBLIC_APP_URL || 'https://www.veloceia.com'

  if (errorParam) {
    return Response.redirect(redirectBase + '/settings?instagram=cancelled')
  }
  if (!stylistId || !code) {
    return new Response('Missing authorization parameters — please restart authorization from the settings page', { status: 400 })
  }

  const { data: stylist } = await supabaseAdmin.from('stylists').select('id').eq('id', stylistId).maybeSingle()
  if (!stylist) {
    return new Response('Matching account not found', { status: 404 })
  }

  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`
    const shortLived = await exchangeCodeForShortLivedToken(code, redirectUri)
    const longLived = await exchangeForLongLivedToken(shortLived.access_token)
    const profile = await getInstagramProfile(longLived.access_token)

    const { error: rpcError } = await supabaseAdmin.rpc('encrypt_and_store_ig_token', {
      p_stylist_id: stylist.id,
      p_token: longLived.access_token,
      p_key: process.env.TOKEN_ENCRYPTION_KEY,
      p_ig_user_id: String(profile.user_id),
      p_ig_username: profile.username || null,
    })

    if (rpcError) {
      console.error('Failed to store Instagram token:', rpcError)
      return Response.redirect(redirectBase + '/settings?instagram=save_failed')
    }

    return Response.redirect(redirectBase + '/settings?instagram=connected')
  } catch (err) {
    console.error('Instagram OAuth callback failed:', err)
    return Response.redirect(redirectBase + '/settings?instagram=error')
  }
}
