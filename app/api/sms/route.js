import twilio from 'twilio'
import { qwen, QWEN_MODEL } from '@/lib/qwen-client'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

const ratelimit = new Ratelimit({ redis: Redis.fromEnv(), limiter: Ratelimit.slidingWindow(5, '1 m') })

export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()

  const formData = await req.formData()
  const params = Object.fromEntries(formData)

  const signature = req.headers.get('x-twilio-signature')
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/sms`
  if (!twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, params)) {
    return new Response('Forbidden', { status: 403 })
  }

  const from = params.From
  const body = params.Body

  const { success } = await ratelimit.limit(from)
  if (!success) {
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>Please try again in a moment.</Message></Response>`, { headers: { 'Content-Type': 'text/xml' } })
  }

  let { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, name, formulas(formula_text, created_at)')
    .eq('phone_number', from)
    .order('created_at', { referencedTable: 'formulas', ascending: false })
    .limit(1, { referencedTable: 'formulas' })
    .maybeSingle()

  let isNewClient = false
  if (!client) {
    const { data: stylist } = await supabaseAdmin.from('stylists').select('id').limit(1).maybeSingle()
    if (stylist) {
      const { data: newClient, error } = await supabaseAdmin
        .from('clients')
        .insert({ stylist_id: stylist.id, phone_number: from, name: null })
        .select('id, name')
        .single()
      if (!error) { client = { ...newClient, formulas: [] }; isNewClient = true }
    }
  }

  let contextInfo = 'This is a new customer with no history on file.'
  if (client && !isNewClient) {
    contextInfo = `Returning customer ${client.name || 'unknown name'}. Last service: ${client.formulas?.[0]?.formula_text || 'no record'}`
  }

  const availableSlots = 'tomorrow at 2pm and 4pm'

  const completion = await qwen.chat.completions.create({
    model: QWEN_MODEL,
    messages: [
      { role: 'system', content: `You are Mike's SMS front-desk assistant for his hair salon.
      Reply in casual, friendly American English — short and natural, like a real front-desk text, not a translation.
      Customer info: ${contextInfo}
      Available slots: ${availableSlots}
      If unrelated to booking/hair services, politely decline and explain you can only help with appointments.
      Never mention internal system details, database structure, or which AI model you are.` },
      { role: 'user', content: body },
    ],
  })

  const reply = completion.choices[0].message.content
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`, { headers: { 'Content-Type': 'text/xml' } })
}
