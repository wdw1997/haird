import crypto from 'crypto'

// How long a state token is valid for. Should comfortably cover the time a
// user spends on the provider's consent screen, but stay short so a leaked/
// logged state can't be replayed later.
const STATE_TTL_MS = 15 * 60 * 1000 // 15 minutes

// Creates a one-time, unguessable state token for an OAuth authorize URL and
// stores it server-side, bound to the stylist who is actually logged in and
// to the provider it's for. This is what the `state` param SHOULD be — never
// a business/record id, since those can be public (e.g. the stylistId shows
// up in the public /book/[stylistId] URL).
export async function createOauthState(supabaseAdmin, stylistId, provider) {
  const state = crypto.randomBytes(32).toString('base64url')
  const { error } = await supabaseAdmin.from('oauth_states').insert({
    state, stylist_id: stylistId, provider,
  })
  if (error) throw new Error('Failed to create oauth state: ' + error.message)
  return state
}

// Validates and consumes a state token from a callback. Returns the
// stylist_id it was issued for, or null if the token is missing, unknown,
// already used, issued for a different provider, or expired. Always deletes
// the row so a given token can only ever be redeemed once (prevents replay).
export async function consumeOauthState(supabaseAdmin, state, provider) {
  if (!state) return null

  const { data: row } = await supabaseAdmin
    .from('oauth_states')
    .select('stylist_id, provider, created_at')
    .eq('state', state)
    .maybeSingle()

  // One-time use: delete immediately regardless of outcome below.
  await supabaseAdmin.from('oauth_states').delete().eq('state', state)

  if (!row) return null
  if (row.provider !== provider) return null

  const age = Date.now() - new Date(row.created_at).getTime()
  if (age > STATE_TTL_MS) return null

  return row.stylist_id
}
