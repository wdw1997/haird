import { whisperClient, STT_MODEL } from '@/lib/whisper-client'
import { qwen, QWEN_MODEL } from '@/lib/qwen-client'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'

export async function POST(req) {
  const supabaseAdmin = getSupabaseAdmin()

  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  let userId = null
  if (token) {
    const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    const { data: userData } = await supabaseAuth.auth.getUser(token)
    userId = userData?.user?.id
  }

  const formData = await req.formData()
  const audioFile = formData.get('audio')

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
      { role: 'system', content: `你是一个信息提取助手。从理发师的语音记录中提取以下字段,只返回 JSON:
      {"customer_name": "顾客名字", "service_type": "服务类型", "formula": "具体配方", "notes": "备注"}
      注意:语音记录内容通常是英文,请准确提取英文原文中的专有名词,不要翻译成中文。` },
      { role: 'user', content: text },
    ],
  })
  const extracted = JSON.parse(completion.choices[0].message.content)

  let saved = false
  if (userId) {
    const { data: stylist } = await supabaseAdmin.from('stylists').select('id').eq('auth_user_id', userId).maybeSingle()
    if (stylist) {
      const { error } = await supabaseAdmin.from('formulas').insert({
        formula_text: extracted.formula,
        service_type: extracted.service_type,
        notes: extracted.notes,
      })
      saved = !error
    }
  }

  return Response.json({ transcript: text, extracted, saved })
}
