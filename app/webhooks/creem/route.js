import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// 各套餐对应的额度(升级/续费成功时写入,取消/过期时降回free档)
const PLAN_LIMITS = {
  free: { sms_limit: 3, voice_limit: 3 },
  pro: { sms_limit: 200, voice_limit: 300 },
  team: { sms_limit: 600, voice_limit: 1000 },
}

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(computed)
  const b = Buffer.from(signature)
  // 长度不一致时不能直接用 timingSafeEqual(会抛错),先判断长度
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()

  // 必须用原始body字符串做签名验证,不能先JSON.parse再验证
  const rawBody = await req.text()
  const signature = req.headers.get('creem-signature')

  if (!verifySignature(rawBody, signature, process.env.CREEM_WEBHOOK_SECRET)) {
    console.error('Creem webhook 签名验证失败')
    return new Response('Invalid signature', { status: 401 })
  }

  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch (err) {
    return new Response('Invalid JSON', { status: 400 })
  }

  const eventId = payload.id
  const eventType = payload.eventType

  if (!eventId || !eventType) {
    return new Response('Missing event id/type', { status: 400 })
  }

  // 幂等处理:Creem在没收到200时会按 30秒/1分钟/5分钟/1小时 重试,
  // 同一个事件可能收到多次,靠 eventId 去重,避免重复发放/扣减额度
  const { data: existing } = await supabaseAdmin
    .from('creem_webhook_events')
    .select('id')
    .eq('id', eventId)
    .maybeSingle()

  if (existing) {
    return new Response('Already processed', { status: 200 })
  }

  try {
    switch (eventType) {
      // 首次订阅完成 + 每期续费成功,都走"发放/刷新额度"这条逻辑
      case 'checkout.completed':
      case 'subscription.paid': {
        const metadata = payload.object?.metadata || {}
        const stylistId = metadata.stylist_id
        const plan = metadata.plan

        if (!stylistId || !plan || !PLAN_LIMITS[plan]) {
          console.error('webhook缺少必要metadata,无法定位stylist或plan:', metadata)
          break
        }

        const limits = PLAN_LIMITS[plan]
        const { error } = await supabaseAdmin.from('stylists').update({
          plan_type: plan,
          sms_limit: limits.sms_limit,
          voice_limit: limits.voice_limit,
          sms_used: 0,
          voice_used: 0,
        }).eq('id', stylistId)

        if (error) console.error('更新stylist套餐失败:', error)
        break
      }

      // 取消订阅 或 到期未续费成功,统一降回免费版额度
      case 'subscription.canceled':
      case 'subscription.expired': {
        const metadata = payload.object?.metadata || {}
        const stylistId = metadata.stylist_id

        if (!stylistId) {
          console.error('webhook缺少stylist_id,无法降级:', metadata)
          break
        }

        const limits = PLAN_LIMITS.free
        const { error } = await supabaseAdmin.from('stylists').update({
          plan_type: 'free',
          sms_limit: limits.sms_limit,
          voice_limit: limits.voice_limit,
        }).eq('id', stylistId)

        if (error) console.error('降级stylist套餐失败:', error)
        break
      }

      // 续费失败(卡被拒等),Creem会自动重试,这里先只记录日志,不立即降级
      case 'subscription.past_due': {
        console.warn('订阅续费失败,等待Creem自动重试:', payload.object?.id)
        break
      }

      default:
        // 其他事件(如 refund.created, dispute.created)暂不处理,后续按需接入
        break
    }

    await supabaseAdmin.from('creem_webhook_events').insert({ id: eventId, event_type: eventType })

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('处理 Creem webhook 出错:', err)
    return new Response('Internal error', { status: 500 })
  }
}
