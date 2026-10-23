import { isQuotaExceeded } from './quota'

// The public AI chat runs on the salon's message quota (the same sms_used /
// sms_limit counter as the SMS assistant and the owner's Demo Chat), so it is
// open to every plan — free accounts get their small free allowance, paid
// plans get their plan's. When the quota is used up the booking page quietly
// falls back to the form + callback request.
export function isWebChatEnabled(stylist) {
  return !isQuotaExceeded(stylist, 'sms')
}
