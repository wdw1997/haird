import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

const PLAN_LIMITS = {
  free: { sms_limit: 3, voice_limit: 3 },
  pro: { sms_limit: 200, voice_limit: 300 },
  team: { sms_limit: 600, voice_limit: 1000 },
}

// $9.90 加油包一次性增加的额度
const ADDON_SMS = 100
const ADDON_VOICE = 100

function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret) return false
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const a = Buffer.from(computed)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()

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
      case 'checkout.completed': {
        const metadata = payload.object?.metadata || {}
        const stylistId = metadata.stylist_id

        if (!stylistId) {
          console.error('webhook缺少stylist_id:', metadata)
          break
        }

        if (metadata.type === 'addon') {
          // 加油包是一次性购买,只叠加额度,不影响套餐本身
          const { data: stylist } = await supabaseAdmin
            .from('stylists').select('bonus_sms, bonus_voice').eq('id', stylistId).maybeSingle()
          if (stylist) {
            await supabaseAdmin.from('stylists').update({
              bonus_sms: (stylist.bonus_sms || 0) + ADDON_SMS,
              bonus_voice: (stylist.bonus_voice || 0) + ADDON_VOICE,
              // 额度增加了,重新允许下次触发80%/100%预警
              sms_80_notified: false,
              sms_100_notified: false,
              voice_80_notified: false,
              voice_100_notified: false,
            }).eq('id', stylistId)
          }
          break
        }

        // 走到这里说明是订阅套餐首次开通
        const plan = metadata.plan
        if (!plan || !PLAN_LIMITS[plan]) {
          console.error('webhook缺少有效plan:', metadata)
          break
        }
        const limits = PLAN_LIMITS[plan]
        await supabaseAdmin.from('stylists').update({
          plan_type: plan,
          sms_limit: limits.sms_limit,
          voice_limit: limits.voice_limit,
          sms_used: 0,
          voice_used: 0,
          bonus_sms: 0,
          bonus_voice: 0,
          sms_80_notified: false,
          sms_100_notified: false,
          voice_80_notified: false,
          voice_100_notified: false,
        }).eq('id', stylistId)
        break
      }

      // 每期续费成功:刷新用量、清空上个周期的加油包和预警标记
      case 'subscription.paid': {
        const metadata = payload.object?.metadata || {}
        const stylistId = metadata.stylist_id
        const plan = metadata.plan

        if (!stylistId || !plan || !PLAN_LIMITS[plan]) {
          console.error('webhook缺少必要metadata:', metadata)
          break
        }

        const limits = PLAN_LIMITS[plan]
        await supabaseAdmin.from('stylists').update({
          plan_type: plan,
          sms_limit: limits.sms_limit,
          voice_limit: limits.voice_limit,
          sms_used: 0,
          voice_used: 0,
          bonus_sms: 0,
          bonus_voice: 0,
          sms_80_notified: false,
          sms_100_notified: false,
          voice_80_notified: false,
          voice_100_notified: false,
        }).eq('id', stylistId)
        break
      }

      case 'subscription.canceled':
      case 'subscription.expired': {
        const metadata = payload.object?.metadata || {}
        const stylistId = metadata.stylist_id

        if (!stylistId) {
          console.error('webhook缺少stylist_id,无法降级:', metadata)
          break
        }

        const limits = PLAN_LIMITS.free
        await supabaseAdmin.from('stylists').update({
          plan_type: 'free',
          sms_limit: limits.sms_limit,
          voice_limit: limits.voice_limit,
          bonus_sms: 0,
          bonus_voice: 0,
          sms_80_notified: false,
          sms_100_notified: false,
          voice_80_notified: false,
          voice_100_notified: false,
        }).eq('id', stylistId)
        break
      }

      case 'subscription.past_due': {
        console.warn('订阅续费失败,等待Creem自动重试:', payload.object?.id)
        break
      }

      default:
        break
    }

    await supabaseAdmin.from('creem_webhook_events').insert({ id: eventId, event_type: eventType })

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('处理 Creem webhook 出错:', err)
    return new Response('Internal error', { status: 500 })
  }
}
