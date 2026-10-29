// US / Canada phone numbers only (the toll-free / A2P registration covers the
// +1 region). Accepts "(555) 123-4567", "555-123-4567", "+1 555 123 4567", ...
// Returns E.164 ("+15551234567") or null when it isn't a plausible NANP number.
export function normalizeUsPhone(input) {
  let digits = String(input || '').replace(/[^\d]/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  // NANP: area code and exchange can't start with 0 or 1.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null
  return `+1${digits}`
}
