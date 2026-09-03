import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { buyNumberIntoPool } from '@/lib/provision-number'

export const dynamic = 'force-dynamic'

async function requireAdmin(req) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return { error: 'Please log in first', status: 401 }

  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) return { error: 'Session expired', status: 401 }

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  if (!adminEmails.includes((userData.user.email || '').toLowerCase())) {
    return { error: 'Not authorized', status: 403 }
  }
  return { ok: true }
}

export async function GET(req) {
  const auth = await requireAdmin(req)
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

  const supabaseAdmin = getSupabaseAdmin()
  const { data: pool, error } = await supabaseAdmin
    .from('phone_number_pool')
    .select('phone_number, status, assigned_to, assigned_at, created_at')
    .order('created_at', { ascending: true })

  if (error) return Response.json({ error: 'Failed to load pool' }, { status: 500 })

  const available = pool.filter(p => p.status === 'available').length
  const assigned = pool.filter(p => p.status === 'assigned').length

  const { data: waiting } = await supabaseAdmin
    .from('stylists').select('id, name, email').eq('needs_number_provisioning', true)

  return Response.json({ available, assigned, total: pool.length, pool, waitingStylists: waiting || [] })
}

// Buys `count` new numbers into the pool. Slow on purpose (one at a time,
// sequential) — this hits Twilio's real purchase API, so a tight loop isn't
// something you want to fire off carelessly. Meant to be called a few
// numbers at a time from the admin dashboard, not for bulk-buying hundreds.
export async function POST(req) {
  const auth = await requireAdmin(req)
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status })

  let body
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const count = Math.min(Math.max(Number(body.count) || 1, 1), 10)
  const tollFree = body.tollFree !== false

  const bought = []
  const failed = []
  for (let i = 0; i < count; i++) {
    const number = await buyNumberIntoPool({ tollFree })
    if (number) bought.push(number)
    else failed.push(i + 1)
  }

  return Response.json({ bought, failedCount: failed.length })
}
