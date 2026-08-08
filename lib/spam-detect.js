import { sendEmail } from './resend-client'

const REPEAT_THRESHOLD = 3 // 4th identical message in a row trips it

function normalize(body) {
  return (body || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// Detects a customer number sending the same message over and over (classic
// spam/harassment/bot pattern), as opposed to a normal fast back-and-forth
// conversation. Reads/writes the same client_rate_limits row the rate
// limiter uses. Returns { isSpam, repeatCount, justTripped }.
export async function checkRepeatSpam(supabaseAdmin, rl, phoneNumber, body) {
  const normalized = normalize(body)
  const lastBody = rl?.last_message_body ? normalize(rl.last_message_body) : null
  const repeatCount = lastBody && lastBody === normalized ? (rl?.repeat_count || 0) + 1 : 0
  const isSpam = repeatCount >= REPEAT_THRESHOLD
  const justTripped = isSpam && !rl?.spam_notified

  await supabaseAdmin.from('client_rate_limits')
    .update({ last_message_body: body, repeat_count: repeatCount, spam_notified: isSpam ? true : (repeatCount === 0 ? false : rl?.spam_notified) })
    .eq('phone_number', phoneNumber)

  return { isSpam, repeatCount, justTripped }
}

export async function notifyStylistOfSpam(stylist, phoneNumber) {
  const to = stylist.email || stylist.contact_email
  if (!to) return
  await sendEmail({
    to,
    subject: `⚠️ Possible spam/repeated messages from ${phoneNumber}`,
    html: `<p>Hi ${stylist.name || ''},</p>
      <p>The number <strong>${phoneNumber}</strong> has sent the same message several times in a row. Our system has paused AI auto-replies to this number and is showing a generic holding message instead.</p>
      <p>You may want to check the conversation in your Inbox and follow up manually if needed.</p>`,
  })
}
