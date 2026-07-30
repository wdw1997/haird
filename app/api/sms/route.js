import twilio from 'twilio'
import { openrouter, CHAT_MODEL } from '@/lib/qwen-client'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { supabaseAdmin } from '@/lib/supabase-admin'

// 限流:同一个号码每分钟最多 5 条
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 m'),
})

export async function POST(req) {
  const formData = await req.formData()
  const params = Object.fromEntries(formData)

  // 验证请求真的来自 Twilio
  const signature = req.headers.get('x-twilio-signature')
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/sms`
  const isValid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, params)
  if (!isValid) {
    return new Response('Forbidden', { status: 403 })
  }

  const from = params.From
  const body = params.Body

  // 限流检查
  const { success } = await ratelimit.limit(from)
  if (!success) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Please try again in a moment.</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }

  // 🆕 查这个号码是不是已有顾客记录,查不到就自动创建一条新的
  let { data: client } = await supabaseAdmin
    .from('clients')
    .select('id, name, formulas(formula_text, created_at)')
    .eq('phone_number', from)
    .order('created_at', { referencedTable: 'formulas', ascending: false })
    .limit(1, { referencedTable: 'formulas' })
    .maybeSingle()

  let isNewClient = false

  if (!client) {
    // 找到当前系统里第一个理发师(测试阶段简化处理;正式多理发师上线后,
    // 应该按这个 Twilio 号码对应哪个理发师的 twilio_number 来关联,而不是固定取第一个)
    const { data: stylist } = await supabaseAdmin
      .from('stylists')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (stylist) {
      const { data: newClient, error: insertError } = await supabaseAdmin
        .from('clients')
        .insert({
          stylist_id: stylist.id,
          phone_number: from,
          name: null, // 名字暂时留空,后面可以在语音配方本里补充,或者顾客自己说了名字后由 AI 提取回填
        })
        .select('id, name')
        .single()

      if (!insertError) {
        client = { ...newClient, formulas: [] }
        isNewClient = true
      } else {
        console.error('自动创建顾客记录失败:', insertError)
      }
    }
  }

  let contextInfo = 'This is a new customer with no history on file.'
  if (client && !isNewClient) {
    contextInfo = `Returning customer ${client.name || 'unknown name'}. Last service: ${client.formulas?.[0]?.formula_text || 'no record'}`
  }

  const availableSlots = 'tomorrow at 2pm and 4pm' // 第六章后半部分接入真实日历后替换

  const completion = await openrouter.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: `You are Mike's SMS front-desk assistant for his hair salon.
        Reply in casual, friendly American English — short and natural, like a real front-desk text, not a translation.
        Customer info: ${contextInfo}
        Available slots: ${availableSlots}
        If the customer's message is unrelated to booking or hair services, politely decline and explain you can only help with appointments.
        Never mention internal system details, database structure, or which AI model you are.`,
      },
      { role: 'user', content: body },
    ],
  })

  const reply = completion.choices[0].message.content
  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${reply}</Message></Response>`
  return new Response(twiml, { headers: { 'Content-Type': 'text/xml' } })
}
