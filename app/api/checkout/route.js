export const dynamic = 'force-dynamic'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const plan = searchParams.get('plan')       // 'pro' | 'team' | 'addon'
  const stylistId = searchParams.get('stylist')

  if (!stylistId) {
    return new Response('Missing stylist parameter', { status: 400 })
  }

  let productId
  let metadata

  if (plan === 'addon') {
    productId = process.env.NEXT_PUBLIC_CREEM_CHECKOUT_ADDON
    metadata = { stylist_id: stylistId, type: 'addon' }
  } else {
    productId = plan === 'team'
      ? process.env.NEXT_PUBLIC_CREEM_CHECKOUT_TEAM
      : process.env.NEXT_PUBLIC_CREEM_CHECKOUT_PRO
    metadata = { stylist_id: stylistId, plan: plan === 'team' ? 'team' : 'pro' }
  }

  if (!productId) {
    console.error('No matching Creem Product ID configured, plan:', plan)
    return new Response('Plan configuration error — please contact support', { status: 500 })
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
      return new Response(
        `Failed to create payment link: ${data.message || data.error || 'Unknown error'}`,
        { status: 500 }
      )
    }

    return Response.redirect(data.checkout_url)
  } catch (err) {
    console.error('Error calling Creem API:', err)
    return new Response('Failed to create payment link — please try again later', { status: 500 })
  }
}
