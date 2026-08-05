import { whisperClient, STT_MODEL } from '@/lib/whisper-client'
import { qwen, QWEN_MODEL } from '@/lib/qwen-client'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'
import { isQuotaExceeded, checkAndNotifyQuota } from '@/lib/quota'

export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    return Response.json({ error: '请先登录' }, { status: 401 })
  }

  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) {
    return Response.json({ error: '登录已过期，请重新登录' }, { status: 401 })
  }

  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('*').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!stylist) {
    return Response.json({ error: '未找到账号信息' }, { status: 404 })
  }

  if (isQuotaExceeded(stylist, 'voice')) {
    return Response.json({ error: '本月语音额度已用完，请购买加油包或升级套餐' }, { status: 403 })
  }

  const formData = await req.formData()
  const audioFile = formData.get('audio')
  const clientId = formData.get('clientId') || null
  if (!audioFile) {
    return Response.json({ error: '未收到音频文件' }, { status: 400 })
  }

  const transcription = await whisperClient.audio.transcriptions.create({
    file: audioFile,
    model: STT_MODEL,
    prompt: "This is a hair salon voice memo about hair coloring formulas. Common terms include: gloss, toner, volume (like 20 volume, 30 volume), highlights, balayage, bleach, developer, foils.",
  })
  const text = transcription.text

  const completion = await qwen.chat.completions.create({
    model: QWEN_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `你是一个专业的美发助理，负责从语音转写文本中提取染发/美发配方信息，返回JSON:
      {"customer_name": "客户姓名", "service_type": "服务类型", "formula": "配方细节", "notes": "备注"}
      规则：只提取原文中明确提到的信息，没提到的字段留空字符串，不要编造内容。` },
      { role: 'user', content: text },
    ],
  })

  let extracted
  try {
    extracted = JSON.parse(completion.choices[0].message.content)
  } catch (e) {
    console.error('AI extraction parse failed:', e)
    extracted = { customer_name: '', service_type: '', formula: '', notes: text }
  }

  let resolvedClientId = null
  if (clientId) {
    const { data: client } = await supabaseAdmin
      .from('clients').select('id').eq('id', clientId).eq('stylist_id', stylist.id).maybeSingle()
    if (client) resolvedClientId = client.id
  } else if (extracted.customer_name) {
    const { data: match } = await supabaseAdmin
      .from('clients').select('id').eq('stylist_id', stylist.id)
      .ilike('name', extracted.customer_name).maybeSingle()
    if (match) resolvedClientId = match.id
  }

  let saved = false
  if (resolvedClientId) {
    const { error } = await supabaseAdmin.from('formulas').insert({
      client_id: resolvedClientId,
      formula_text: extracted.formula,
      service_type: extracted.service_type,
      notes: extracted.notes,
    })
    saved = !error
  }

  const newUsed = stylist.voice_used + 1
  await supabaseAdmin.from('stylists').update({ voice_used: newUsed }).eq('id', stylist.id)
  await checkAndNotifyQuota(supabaseAdmin, stylist, 'voice', newUsed)

  return Response.json({ transcript: text, extracted, saved, needsClientLink: !resolvedClientId })
}
