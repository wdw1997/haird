import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getInstagramAuthUrl } from '@/lib/instagram-client'
import { createOauthState } from '@/lib/oauth-state'

export const dynamic = 'force-dynamic'

export async function GET(req) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return Response.json({ error: 'Please log in first' }, { status: 401 })
  }

  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) {
    return Response.json({ error: 'Session expired' }, { status: 401 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('id').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Account not found' }, { status: 404 })
  }

  // Same fix as Google: `state` must be a random one-time token bound to
  // this logged-in stylist, never the (public) stylist id — see comment in
  // app/api/google/auth/route.js for the full attack this closes off.
  const state = await createOauthState(supabaseAdmin, stylist.id, 'instagram')

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/instagram/callback`
  const url = getInstagramAuthUrl(redirectUri, state)
  return Response.json({ url })
}
