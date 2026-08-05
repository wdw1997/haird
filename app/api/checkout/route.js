export const dynamic = 'force-dynamic'

export async function GET(req) {
  const { searchParams } = new URL(req.url)
  const plan = searchParams.get('plan')       // 'pro' | 'team' | 'addon'
  const stylistId = searchParams.get('stylist')

  if (!stylistId) {
    return new Response('缺少 stylist 参数', { status: 400 })
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
    console.error('未配置对应的 Creem Product ID, plan:', plan)
    return new Response('套餐配置错误，请联系客服', { status: 500 })
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
      console.error('Creem checkout 创建失败:', res.status, JSON.stringify(data))
      return new Response(
        `创建支付链接失败：${data.message || data.error || '未知错误'}`,
        { status: 500 }
      )
    }

    return Response.redirect(data.checkout_url)
  } catch (err) {
    console.error('调用 Creem API 出错:', err)
    return new Response('创建支付链接失败，请稍后重试', { status: 500 })
  }
}
