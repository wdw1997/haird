import { isQuotaExceeded } from './quota'

// The public AI chat spends the owner's message quota, and a customer can
// only be texted back once the owner has a real number — so it's limited to
// paid plans that still have quota left. Otherwise the booking page quietly
// falls back to the form + callback request.
export function isWebChatEnabled(stylist) {
  const paid = !!stylist.plan_type && stylist.plan_type !== 'free'
  return paid && !isQuotaExceeded(stylist, 'sms')
}
