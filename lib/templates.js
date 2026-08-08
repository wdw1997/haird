// Cheap rule-based answers for very common questions, so we don't spend an
// AI call (and the customer's AI-reply quota) on things that are a direct
// lookup against business_settings. Only handles unambiguous, low-risk
// cases — anything involving scheduling, pricing edge cases, or multi-turn
// context still goes to the AI.

function isMatch(bodyLower, keywords) {
  return keywords.some((k) => bodyLower.includes(k))
}

const HOURS_KEYWORDS = ['hours', 'what time', 'when are you open', 'when do you open', 'when do you close', 'still open', 'are you open']
const ADDRESS_KEYWORDS = ['address', 'where are you located', 'where are you', 'location', 'directions']
const PHONE_KEYWORDS = ['phone number', 'call you', 'your number']

// Returns a reply string if the message can be answered directly from
// business_settings, or null if it should fall through to the AI.
export function matchSimpleQuestion(body, biz) {
  const bodyLower = body.toLowerCase().trim()
  if (!bodyLower || bodyLower.length > 120) return null // long messages are never a simple lookup

  if (isMatch(bodyLower, HOURS_KEYWORDS)) {
    const hours = biz?.business_hours?.text
    if (hours) return `Our hours: ${hours}`
    return null // not configured — let the AI handle it / say it doesn't know
  }

  if (isMatch(bodyLower, ADDRESS_KEYWORDS)) {
    if (biz?.address) return `We're located at ${biz.address}`
    return null
  }

  if (isMatch(bodyLower, PHONE_KEYWORDS)) {
    if (biz?.contact_phone) return `You can reach us directly at ${biz.contact_phone}`
    return null
  }

  return null
}
