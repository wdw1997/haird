import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const VALID_PLANS = ['pro', 'team', 'addon']

// This used to be an unauthenticated GET that trusted a `stylist` id
// straight from the query string — anyone could build a checkout link for
// ANY stylist id (which is public, it's in the /book/[stylistId] URL) and
// send a business owner a link that, if paid, would upgrade a random
// stranger's account instead of their own, or just be used to probe/spam
// the Creem API on someone else's behalf. Now it requires a logged-in
// session and always builds the checkout for the caller's own account —
// the plan is the only thing the client gets to choose.
export async function POST(req) {
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

  let body
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 })
  }

  const plan = body.plan // 'pro' | 'team' | 'addon'
  if (!VALID_PLANS.includes(plan)) {
    return Response.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const stylistId = stylist.id

  let productId
  let metadata

  if (plan === 'addon') {
    productId = process.env.NEXT_PUBLIC_CREEM_CHECKOUT_ADDON
    metadata = { stylist_id: stylistId, type: 'addon' }
  } else {
    productId = plan === 'team'
      ? process.env.NEXT_PUBLIC_CREEM_CHECKOUT_TEAM
      : process.env.NEXT_PUBLIC_CREEM_CHECKOUT_PRO
    metadata = { stylist_id: stylistId, plan }
  }

  if (!productId) {
    console.error('No matching Creem Product ID configured, plan:', plan)
    return Response.json({ error: 'Plan configuration error — please contact support' }, { status: 500 })
  }

  try {
    const res = await fetch('https://api.creem.io/v1/checkouts', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.CREEM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        product_id: productId,
        request_id: `${stylistId}_${plan}_${Date.now()}`,
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/`,
        metadata,
      }),
    })

    const data = await res.json()

    if (!res.ok || !data.checkout_url) {
      console.error('Failed to create Creem checkout:', res.status, JSON.stringify(data))
      return Response.json(
        { error: `Failed to create payment link: ${data.message || data.error || 'Unknown error'}` },
        { status: 500 }
      )
    }

    return Response.json({ url: data.checkout_url })
  } catch (err) {
    console.error('Error calling Creem API:', err)
    return Response.json({ error: 'Failed to create payment link — please try again later' }, { status: 500 })
  }
}
