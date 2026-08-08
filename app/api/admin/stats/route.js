import { createClient } from '@supabase/supabase-js'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Rough estimated MRR per plan — for a dashboard number, not for accounting.
// Doesn't account for proration, top-up pack revenue, refunds, etc.
const PLAN_MRR = { free: 0, pro: 30, team: 60 }

export async function GET(req) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) return Response.json({ error: 'Please log in first' }, { status: 401 })

  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) return Response.json({ error: 'Session expired' }, { status: 401 })

  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  if (!adminEmails.includes((userData.user.email || '').toLowerCase())) {
    return Response.json({ error: 'Not authorized' }, { status: 403 })
  }

  const supabaseAdmin = getSupabaseAdmin()
  const { data: stylists, error } = await supabaseAdmin
    .from('stylists')
    .select('id, name, email, plan_type, sms_used, sms_limit, bonus_sms, voice_used, voice_limit, bonus_voice, created_at, twilio_number')
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: 'Failed to load stylists' }, { status: 500 })

  const list = stylists || []
  const totalStylists = list.length
  const byPlan = list.reduce((acc, s) => {
    const plan = s.plan_type || 'free'
    acc[plan] = (acc[plan] || 0) + 1
    return acc
  }, {})
  const estimatedMrr = list.reduce((sum, s) => sum + (PLAN_MRR[s.plan_type] || 0), 0)
  const totalSmsUsed = list.reduce((sum, s) => sum + (s.sms_used || 0), 0)
  const totalVoiceUsed = list.reduce((sum, s) => sum + (s.voice_used || 0), 0)

  const nearingLimit = list.filter(s => {
    const smsLimit = (s.sms_limit || 0) + (s.bonus_sms || 0)
    const voiceLimit = (s.voice_limit || 0) + (s.bonus_voice || 0)
    const smsPct = smsLimit > 0 ? (s.sms_used || 0) / smsLimit : 0
    const voicePct = voiceLimit > 0 ? (s.voice_used || 0) / voiceLimit : 0
    return Math.max(smsPct, voicePct) >= 0.8
  }).map(s => ({
    id: s.id, name: s.name, email: s.email, plan_type: s.plan_type,
    sms_used: s.sms_used, sms_limit: (s.sms_limit || 0) + (s.bonus_sms || 0),
    voice_used: s.voice_used, voice_limit: (s.voice_limit || 0) + (s.bonus_voice || 0),
  }))

  return Response.json({
    totalStylists, byPlan, estimatedMrr, totalSmsUsed, totalVoiceUsed, nearingLimit,
    stylists: list.map(s => ({
      id: s.id, name: s.name, email: s.email, plan_type: s.plan_type || 'free',
      sms_used: s.sms_used || 0, sms_limit: (s.sms_limit || 0) + (s.bonus_sms || 0),
      voice_used: s.voice_used || 0, voice_limit: (s.voice_limit || 0) + (s.bonus_voice || 0),
      created_at: s.created_at, has_number: !!s.twilio_number,
    })),
  })
}
