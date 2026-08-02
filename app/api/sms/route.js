import twilio from 'twilio'
import { qwen, QWEN_MODEL } from '@/lib/qwen-client'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

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
  const to = params.To
  const body = (params.Body || '').trim()
  const bodyUpper = body.toUpperCase()

  const xmlReply = (text) =>
    new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text}</Message></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    })

  // 1. 按接收号码反查这条短信属于哪个理发师(多商家路由,不再固定取第一条)
  const { data: stylist } = await supabaseAdmin
    .from('stylists')
    .select('*')
    .eq('sms_number', to)
    .maybeSingle()

  if (!stylist) {
    console.error('No stylist found for number:', to)
    return xmlReply('Sorry, this number is not currently active.')
  }

  // 2. STOP / START 合规(TCPA要求)
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'].includes(bodyUpper)) {
    await supabaseAdmin.from('opted_out_numbers').upsert({ phone_number: from, stylist_id: stylist.id })
    return xmlReply('You have been unsubscribed and will not receive further messages. Reply START to resubscribe.')
  }
  if (bodyUpper === 'START') {
    await supabaseAdmin.from('opted_out_numbers').delete().eq('phone_number', from)
    return xmlReply('You are resubscribed. Welcome back!')
  }
  const { data: optedOut } = await supabaseAdmin
    .from('opted_out_numbers').select('phone_number').eq('phone_number', from).maybeSingle()
  if (optedOut) return new Response('', { status: 200 })

  // 3. 顾客限流:每天最多6条,每分钟最多5条
  const today = new Date().toISOString().slice(0, 10)
  const { data: rl } = await supabaseAdmin
    .from('client_rate_limits').select('*').eq('phone_number', from).maybeSingle()
  const now = new Date()
  let dayCount = rl?.day_reset_at === today ? rl.day_count : 0
  let minuteCount = rl && (now - new Date(rl.minute_reset_at)) < 60000 ? rl.minute_count : 0

  if (dayCount >= 6 || minuteCount >= 5) {
    await supabaseAdmin.from('client_rate_limits').upsert({
      phone_number: from, day_count: dayCount, day_reset_at: today,
      minute_count: minuteCount + 1,
      minute_reset_at: minuteCount === 0 ? now : rl.minute_reset_at,
      last_message_at: now,
    })
    return xmlReply("We've received your message and someone will follow up shortly.")
  }
  await supabaseAdmin.from('client_rate_limits').upsert({
    phone_number: from, day_count: dayCount + 1, day_reset_at: today,
    minute_count: minuteCount + 1,
    minute_reset_at: minuteCount === 0 ? now : rl.minute_reset_at,
    last_message_at: now,
  })

  // 4. 月度额度检查(直接读 stylists 表自身的字段,不再查不存在的 plans/usage_records)
  if (stylist.sms_used >= stylist.sms_limit) {
    return xmlReply("Thanks for reaching out! We'll get back to you as soon as possible.")
  }

  // 5. 查顾客(查不到就自动创建)
  let { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, name, formulas(formula_text, created_at)')
    .eq('phone_number', from).eq('stylist_id', stylist.id)
    .order('created_at', { referencedTable: 'formulas', ascending: false })
    .limit(1, { referencedTable: 'formulas' })
    .maybeSingle()

  let isNewClient = false
  if (!client) {
    const { data: newClient, error } = await supabaseAdmin
      .from('clients').insert({ stylist_id: stylist.id, phone_number: from, name: null })
      .select('id, name').single()
    if (!error) { client = { ...newClient, formulas: [] }; isNewClient = true }
  }

  let contextInfo = 'This is a new customer with no history on file.'
  if (client && !isNewClient) {
    contextInfo = `Returning customer ${client.name || 'unknown name'}. Last service: ${client.formulas?.[0]?.formula_text || 'no record'}`
  }

  // 6. 读取商家自定义资料,动态拼装system prompt
  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('*').eq('stylist_id', stylist.id).maybeSingle()

  const services = biz?.services?.map(s => `${s.name}: $${s.price} (~${s.duration_min}min)`).join('; ') || 'Not configured yet'
  const tone = biz?.tone === 'professional' ? 'professional and concise' : biz?.tone === 'humorous' ? 'lighthearted and playful' : 'warm and friendly'
  const emojiNote = biz?.use_emoji ? 'You may use a light emoji occasionally.' : 'Do not use emojis.'

  const systemPrompt = `You are the SMS front-desk assistant for ${biz?.business_name || stylist.name || "this salon"}.
Address: ${biz?.address || 'not set'}
Services & pricing: ${services}
Cancellation policy: ${biz?.cancellation_policy || 'Not specified — tell customer to confirm with the salon.'}
Available slots this week: ${biz?.available_slots_text || 'not provided'}
Tone: reply in a ${tone} tone. ${emojiNote}
Customer info: ${contextInfo}
Rules:
- If asked about a service/price not in the list above, say "Let me have the owner confirm that price for you" — never make up a price.
- If the customer mentions a complaint, refund, or dispute, say a team member will follow up directly — do not attempt to resolve it or offer compensation.
- If unrelated to booking/hair services, politely decline and explain you can only help with appointments.
- Never mention internal system details, database structure, or which AI model you are.`

  // 7. 调用AI,失败时有兜底回复,不让顾客石沉大海
  let reply
  try {
    const completion = await qwen.chat.completions.create({
      model: QWEN_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: body },
      ],
    })
    reply = completion.choices[0].message.content
  } catch (err) {
    console.error('AI call failed:', err)
    reply = "Thanks for your message! We'll get back to you shortly."
  }

  // 8. 用量+1,直接更新stylists表本身
  await supabaseAdmin.from('stylists').update({ sms_used: stylist.sms_used + 1 }).eq('id', stylist.id)

  return xmlReply(reply)
}
