import crypto from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { provisionPhoneNumber } from '@/lib/provision-number'
import { sendEmail } from '@/lib/resend-client'

export const dynamic = 'force-dynamic'

const PLAN_LIMITS = {
  free: { sms_limit: 3, voice_limit: 3 },
  pro: { sms_limit: 200, voice_limit: 300 },
  team: { sms_limit: 600, voice_limit: 1000 },
}

// Quota granted by the one-time $9.90 top-up pack
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
    console.error('Creem webhook signature verification failed')
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
          console.error('Webhook missing stylist_id:', metadata)
          break
        }

        if (metadata.type === 'addon') {
          // Top-up pack is a one-time purchase — only adds bonus quota, doesn't change the plan itself
          const { data: stylist } = await supabaseAdmin
            .from('stylists').select('bonus_sms, bonus_voice').eq('id', stylistId).maybeSingle()
          if (stylist) {
            await supabaseAdmin.from('stylists').update({
              bonus_sms: (stylist.bonus_sms || 0) + ADDON_SMS,
              bonus_voice: (stylist.bonus_voice || 0) + ADDON_VOICE,
              // Quota went up — allow the 80%/100% warnings to fire again next time
              sms_80_notified: false,
              sms_100_notified: false,
              voice_80_notified: false,
              voice_100_notified: false,
            }).eq('id', stylistId)
          }
          break
        }

        // Otherwise this is a subscription plan being activated for the first time
        const plan = metadata.plan
        if (!plan || !PLAN_LIMITS[plan]) {
          console.error('Webhook missing a valid plan:', metadata)
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

        // Trial users never get a real number (see lib/provision-number.js) —
        // this is the one moment a number actually gets bought and billed.
        // Only do this once: a stylist who already has a number (e.g.
        // re-subscribing after a downgrade) keeps the one they had.
        const { data: freshStylist } = await supabaseAdmin
          .from('stylists').select('twilio_number, name, email').eq('id', stylistId).maybeSingle()

        if (freshStylist && !freshStylist.twilio_number) {
          const purchasedNumber = await provisionPhoneNumber({})
          if (purchasedNumber) {
            await supabaseAdmin.from('stylists').update({ twilio_number: purchasedNumber }).eq('id', stylistId)
          } else {
            // Don't block the paid activation on this — flag it and alert an
            // admin to provision the number manually instead.
            await supabaseAdmin.from('stylists').update({ needs_number_provisioning: true }).eq('id', stylistId)
            if (process.env.ADMIN_ALERT_EMAIL) {
              await sendEmail({
                to: process.env.ADMIN_ALERT_EMAIL,
                subject: `⚠️ Number provisioning failed for stylist ${stylistId}`,
                html: `<p>Automatic number purchase failed for ${freshStylist.name || stylistId} (${freshStylist.email || 'no email'}) after a successful checkout. Please provision a number manually in Twilio and set it in Supabase (stylists.twilio_number).</p>`,
              })
            }
          }
        }
        break
      }

      // Each successful renewal: reset usage, clear last cycle's top-up pack and warning flags
      case 'subscription.paid': {
        const metadata = payload.object?.metadata || {}
        const stylistId = metadata.stylist_id
        const plan = metadata.plan

        if (!stylistId || !plan || !PLAN_LIMITS[plan]) {
          console.error('Webhook missing required metadata:', metadata)
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
          console.error('Webhook missing stylist_id, cannot downgrade:', metadata)
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
        console.warn('Subscription renewal failed, waiting for Creem to auto-retry:', payload.object?.id)
        break
      }

      default:
        break
    }

    await supabaseAdmin.from('creem_webhook_events').insert({ id: eventId, event_type: eventType })

    return new Response('OK', { status: 200 })
  } catch (err) {
    console.error('Error processing Creem webhook:', err)
    return new Response('Internal error', { status: 500 })
  }
}
