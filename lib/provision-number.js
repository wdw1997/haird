import twilio from 'twilio'

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

// Buys a real SMS-capable number and points it at our webhook. Only ever
// called once a paid checkout completes — trial users never reach this path,
// which is the whole point (no number = no monthly rental cost for them).
//
// Returns the purchased E.164 number on success, or null on failure (the
// caller is expected to fall back to a manual-provisioning flag + admin alert
// rather than surface a raw error to the paying customer).
export async function provisionPhoneNumber({ areaCode } = {}) {
  try {
    const searchParams = { smsEnabled: true, voiceEnabled: false, limit: 5 }
    if (areaCode) searchParams.areaCode = areaCode

    let available = await client.availablePhoneNumbers('US').local.list(searchParams)
    if (available.length === 0 && areaCode) {
      // Fall back to any US number if nothing is free in the requested area code
      available = await client.availablePhoneNumbers('US').local.list({ smsEnabled: true, voiceEnabled: false, limit: 5 })
    }
    if (available.length === 0) {
      console.error('No available Twilio numbers found to purchase')
      return null
    }

    const purchased = await client.incomingPhoneNumbers.create({
      phoneNumber: available[0].phoneNumber,
      smsUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/sms`,
      smsMethod: 'POST',
    })

    return purchased.phoneNumber
  } catch (err) {
    console.error('Failed to provision Twilio number:', err)
    return null
  }
}
