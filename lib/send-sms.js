import twilio from 'twilio'

// Outbound transactional SMS (appointment confirmations etc.), sent from the
// stylist's own Twilio number. This is the app's only REST-based send — every
// other reply goes out as TwiML from /api/sms.
//
// Never throws: callers (e.g. the confirm route) must not fail a booking
// just because a text couldn't be delivered. Returns { sent, reason? }.
// reasons: invalid_number | no_sender_number | opted_out | send_failed

export function isE164(phone) {
  return /^\+[1-9]\d{9,14}$/.test(phone || '')
}

export async function sendSms({ supabaseAdmin, stylist, to, body, clientId = null }) {
  if (!isE164(to)) return { sent: false, reason: 'invalid_number' }
  if (!stylist?.twilio_number) return { sent: false, reason: 'no_sender_number' }

  const { data: optedOut } = await supabaseAdmin
    .from('opted_out_numbers').select('phone_number').eq('phone_number', to).maybeSingle()
  if (optedOut) return { sent: false, reason: 'opted_out' }

  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
    await client.messages.create({ from: stylist.twilio_number, to, body })
  } catch (err) {
    console.error('Failed to send SMS:', err?.message || err)
    return { sent: false, reason: 'send_failed' }
  }

  // Keep the conversation log complete (best-effort).
  await supabaseAdmin.from('messages').insert({
    stylist_id: stylist.id, client_id: clientId, phone_number: to,
    direction: 'outbound', body, channel: 'sms',
  })
  return { sent: true }
}
