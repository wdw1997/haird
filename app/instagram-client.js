// Instagram API with Instagram Login (no Facebook Page required).
// Docs: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login

const IG_GRAPH_BASE = 'https://graph.instagram.com/v21.0'

export function getInstagramAuthUrl(redirectUri, state) {
  const params = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'instagram_business_basic,instagram_business_manage_messages',
    state,
  })
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`
}

// Step 1: exchange the ?code= for a short-lived (1hr) access token
export async function exchangeCodeForShortLivedToken(code, redirectUri) {
  const body = new URLSearchParams({
    client_id: process.env.INSTAGRAM_APP_ID,
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code,
  })
  const res = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_message || 'Failed to exchange code')
  return data // { access_token, user_id, permissions }
}

// Step 2: exchange the short-lived token for a long-lived one (valid 60 days,
// must be refreshed before it expires — see refreshLongLivedToken below)
export async function exchangeForLongLivedToken(shortLivedToken) {
  const params = new URLSearchParams({
    grant_type: 'ig_exchange_token',
    client_secret: process.env.INSTAGRAM_APP_SECRET,
    access_token: shortLivedToken,
  })
  const res = await fetch(`https://graph.instagram.com/access_token?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to get long-lived token')
  return data // { access_token, token_type, expires_in }
}

// Call this periodically (e.g. a weekly cron) for every connected account,
// well before the 60-day expiry, to keep the connection alive.
export async function refreshLongLivedToken(currentToken) {
  const params = new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: currentToken })
  const res = await fetch(`https://graph.instagram.com/refresh_access_token?${params.toString()}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to refresh token')
  return data // { access_token, token_type, expires_in }
}

export async function getInstagramProfile(accessToken) {
  const res = await fetch(`${IG_GRAPH_BASE}/me?fields=user_id,username&access_token=${accessToken}`)
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to fetch Instagram profile')
  return data // { user_id, username }
}

export async function sendInstagramMessage(igUserId, accessToken, recipientId, text) {
  const res = await fetch(`${IG_GRAPH_BASE}/${igUserId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Failed to send Instagram message')
  return data
}
