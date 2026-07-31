export const dynamic = 'force-dynamic'
import { whisperClient, STT_MODEL } from '@/lib/whisper-client'
import { qwen, QWEN_MODEL } from '@/lib/qwen-client'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createClient } from '@supabase/supabase-js'

export async function POST(req) {
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')
  
  if (!token) {
    return Response.json({ error: '未授权访问' }, { status: 401 })
  }

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
  const { data: userData } = await supabaseAuth.auth.getUser(token)
  const userId = userData?.user?.id

  if (!userId) {
    return Response.json({ error: '无效的 Token' }, { status: 401 })
  }

  // 1. 获取理发师信息及额度
  const { data: stylist } = await supabaseAdmin
    .from('stylists')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle()

  if (!stylist) {
    return Response.json({ error: '找不到理发师资料' }, { status: 404 })
  }

  // 2. 检查额度是否超限
  if (stylist.voice_used >= stylist.voice_limit) {
    return Response.json({ 
      error: 'quota_exceeded',
      extracted: null, 
      saved: false,
      message: '您的语音配方额度已用完，请升级套餐以继续使用。' 
    }, { status: 403 })
  }

  const formData = await req.formData()
  const audioFile = formData.get('audio')

  try {
    // 3. AI 处理逻辑 (保持不变)
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
        {
          role: 'system',
          content: `你是一个信息提取助手。从理发师的语音记录中提取以下字段,只返回 JSON:
          {
            "customer_name": "顾客名字",
            "service_type": "服务类型",
            "formula": "具体配方",
            "notes": "备注"
          }
          注意:语音记录通常是英文,请准确提取专有名词,不要翻译。`,
        },
        { role: 'user', content: text },
      ],
    })
    const extracted = JSON.parse(completion.choices[0].message.content)

    // 4. 保存配方并扣除额度 (使用刚创建的 RPC 函数)
    const { error: insertError } = await supabaseAdmin.from('formulas').insert({
      formula_text: extracted.formula,
      service_type: extracted.service_type,
      notes: extracted.notes,
      // 真实项目中这里最好也要绑定 client_id 和 stylist_id
    })

    if (!insertError) {
      await supabaseAdmin.rpc('increment_voice_usage', { stylist_id: stylist.id })
    }

    return Response.json({ transcript: text, extracted, saved: !insertError })

  } catch (error) {
    console.error('处理失败:', error)
    return Response.json({ error: 'AI 处理失败' }, { status: 500 })
  }
}
