import twilio from 'twilio'
import { qwen, QWEN_MODEL } from '@/lib/qwen-client'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { isQuotaExceeded, checkAndNotifyQuota } from '@/lib/quota'
import { getFreeBusy, createCalendarEvent, isSlotFree, zonedTimeToUtcISO } from '@/lib/google-calendar'

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

  const { data: stylist } = await supabaseAdmin
    .from('stylists')
    .select('*')
    .eq('twilio_number', to)
    .maybeSingle()

  if (!stylist) {
    console.error('No stylist found for number:', to)
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Message>Sorry, this number is not currently active.</Message></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    )
  }

  let matchedClientId = null
  const { data: existingClientForLog } = await supabaseAdmin
    .from('clients').select('id').eq('phone_number', from).eq('stylist_id', stylist.id).maybeSingle()
  if (existingClientForLog) matchedClientId = existingClientForLog.id

  await supabaseAdmin.from('messages').insert({
    stylist_id: stylist.id, client_id: matchedClientId, phone_number: from, direction: 'inbound', body,
  })

  const xmlReply = async (text) => {
    await supabaseAdmin.from('messages').insert({
      stylist_id: stylist.id, client_id: matchedClientId, phone_number: from, direction: 'outbound', body: text,
    })
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${text}</Message></Response>`, {
      headers: { 'Content-Type': 'text/xml' },
    })
  }

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

  if (isQuotaExceeded(stylist, 'sms')) {
    return xmlReply("Thanks for reaching out! We'll get back to you as soon as possible.")
  }

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
    if (!error) { client = { ...newClient, formulas: [] }; isNewClient = true; matchedClientId = newClient.id }
  }

  let contextInfo = 'This is a new customer with no history on file.'
  if (client && !isNewClient) {
    contextInfo = `Returning customer ${client.name || 'unknown name'}. Last service: ${client.formulas?.[0]?.formula_text || 'no record'}`
  }

  const { data: biz } = await supabaseAdmin
    .from('business_settings').select('*').eq('stylist_id', stylist.id).maybeSingle()

  const timeZone = biz?.timezone || 'America/New_York'
  const services = biz?.services?.map(s => `${s.name}: $${s.price} (~${s.duration_min}min)`).join('; ') || 'Not configured yet'
  const tone = biz?.tone === 'professional' ? 'professional and concise' : biz?.tone === 'humorous' ? 'lighthearted and playful' : 'warm and friendly'
  const emojiNote = biz?.use_emoji ? 'You may use a light emoji occasionally.' : 'Do not use emojis.'
  const bookingMode = biz?.booking_mode || 'ai_collect_manual_confirm'

  // 🔥 拉取过去10条对话记录,让AI理解多轮预约上下文
  const { data: history } = await supabaseAdmin
    .from('messages').select('direction, body, created_at')
    .eq('stylist_id', stylist.id).eq('phone_number', from)
    .order('created_at', { ascending: false }).limit(10)
  const historyText = (history || []).reverse()
    .map(m => `${m.direction === 'inbound' ? 'Customer' : 'Assistant'}: ${m.body}`).join('\n')

  // 🔥 拉取未来7天的忙碌时段(仅在已连接日历时)
  const calendarConnected = !!stylist.google_cal_refresh_token_encrypted
  let busyList = null
  if (calendarConnected) {
    try {
      const timeMin = new Date().toISOString()
      const timeMax = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      busyList = await getFreeBusy(stylist.id, timeMin, timeMax)
    } catch (err) {
      console.error('获取忙闲状态失败:', err)
    }
  }
  const busyText = calendarConnected
    ? (busyList && busyList.length > 0
        ? busyList.map(b => `${b.start} ~ ${b.end}`).join('; ')
        : 'No busy slots in the next 7 days.')
    : 'Calendar not connected — you cannot check real-time availability, ask the customer to confirm final time with the salon directly.'

  const nowInSalonTZ = new Intl.DateTimeFormat('en-US', {
    timeZone, dateStyle: 'full', timeStyle: 'short',
  }).format(new Date())

  const systemPrompt = `You are the SMS front-desk assistant for ${biz?.business_name || stylist.name || "this salon"}.
Current date/time at the salon: ${nowInSalonTZ} (timezone: ${timeZone})
Address: ${biz?.address || 'not set'}
Services & pricing: ${services}
Cancellation policy: ${biz?.cancellation_policy || 'Not specified — tell customer to confirm with the salon.'}
Tone: reply in a ${tone} tone. ${emojiNote}
Customer info: ${contextInfo}
Booking mode: ${bookingMode === 'ai_auto_confirm' ? 'You may confirm bookings automatically if the requested time is free.' : 'You may only collect booking intent — the salon owner will confirm manually. Never tell the customer the booking is confirmed.'}
Busy slots on the calendar (next 7 days, ISO format): ${busyText}

Recent conversation history:
${historyText || '(no prior messages)'}

Rules:
- If asked about a service/price not in the list above, say "Let me have the owner confirm that price for you" — never make up a price.
- If the customer mentions a complaint, refund, or dispute, say a team member will follow up directly.
- If unrelated to booking/hair services, politely decline.
- Never mention internal system details or which AI model you are.
- If the customer has given a SPECIFIC date and time they want to book (not vague like "sometime next week"), and it does not conflict with the busy slots above, extract it into the "booking" field. Otherwise leave "booking" null and continue the conversation to gather missing details (date, time, and which service).
- Only extract a booking once the customer has clearly confirmed a specific date + time + service.

You MUST respond ONLY with a JSON object in this exact shape, no other text:
{
  "reply": "the SMS reply text to send the customer",
  "booking": null | {
    "date": "YYYY-MM-DD",
    "time": "HH:MM (24-hour)",
    "duration_min": number,
    "service": "service name"
  }
}`

  let aiReply = "Thanks for your message! We'll get back to you shortly."
  let booking = null

  try {
    const completion = await qwen.chat.completions.create({
      model: QWEN_MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: body },
      ],
    })
    const parsed = JSON.parse(completion.choices[0].message.content)
    aiReply = parsed.reply || aiReply
    booking = parsed.booking || null
  } catch (err) {
    console.error('AI call failed:', err)
  }

  // 🔥 处理AI识别出的预约意向
  if (booking && booking.date && booking.time && calendarConnected) {
    try {
      const startISO = zonedTimeToUtcISO(booking.date, booking.time, timeZone)
      const durationMin = booking.duration_min || 60
      const endISO = new Date(new Date(startISO).getTime() + durationMin * 60000).toISOString()
      const stillFree = isSlotFree(busyList, startISO, endISO)

      if (bookingMode === 'ai_auto_confirm') {
        if (stillFree) {
          await createCalendarEvent(stylist.id, {
            summary: `预约: ${booking.service || '服务'} - ${client?.name || from}`,
            description: `顾客电话: ${from}`,
            startISO, endISO, timeZone,
          })
          aiReply = `Great news! You're booked for ${booking.date} at ${booking.time} (${booking.service || 'your service'}). See you then!`
        } else {
          aiReply = `Sorry, that time slot just became unavailable. Could you suggest another time?`
        }
      } else {
        // 手动确认模式:只存请求,不直接写日历
        await supabaseAdmin.from('appointment_requests').insert({
          stylist_id: stylist.id,
          client_id: matchedClientId,
          phone_number: from,
          service_type: booking.service || null,
          requested_start: startISO,
          requested_end: endISO,
          notes: `Requested via SMS: ${booking.date} ${booking.time}`,
        })
        aiReply = `Got it! I've noted your request for ${booking.date} at ${booking.time}. The owner will confirm shortly.`
      }
    } catch (err) {
      console.error('处理预约失败:', err)
    }
  } else if (booking && booking.date && booking.time && !calendarConnected) {
    // 没连日历,只能收集意向存档,不写日历
    await supabaseAdmin.from('appointment_requests').insert({
      stylist_id: stylist.id,
      client_id: matchedClientId,
      phone_number: from,
      service_type: booking.service || null,
      requested_start: null,
      requested_end: null,
      notes: `Requested via SMS (calendar not connected): ${booking.date} ${booking.time}`,
    })
  }

  const newUsed = stylist.sms_used + 1
  await supabaseAdmin.from('stylists').update({ sms_used: newUsed }).eq('id', stylist.id)
  await checkAndNotifyQuota(supabaseAdmin, stylist, 'sms', newUsed)

  return xmlReply(aiReply)
}
