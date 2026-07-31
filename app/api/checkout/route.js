export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const plan = searchParams.get('plan')       // 'pro' 或 'team'
  const stylistId = searchParams.get('stylist')

  const productId = plan === 'team'
    ? process.env.CREEM_TEAM_PRODUCT_ID
    : process.env.CREEM_PRO_PRODUCT_ID

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
      metadata: { stylist_id: stylistId, plan },
    }),
  })
  const data = await res.json()
  return Response.redirect(data.checkout_url)
}
