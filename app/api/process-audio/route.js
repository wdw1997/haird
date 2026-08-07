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
    return Response.json({ error: 'Please log in first' }, { status: 401 })
  }

  const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { data: userData, error: authError } = await supabaseAuth.auth.getUser(token)
  if (authError || !userData?.user) {
    return Response.json({ error: 'Session expired, please log in again' }, { status: 401 })
  }

  const { data: stylist } = await supabaseAdmin
    .from('stylists').select('*').eq('auth_user_id', userData.user.id).maybeSingle()
  if (!stylist) {
    return Response.json({ error: 'Account not found' }, { status: 404 })
  }

  if (isQuotaExceeded(stylist, 'voice')) {
    return Response.json({ error: 'Your monthly voice quota is used up — please buy a top-up pack or upgrade your plan' }, { status: 403 })
  }

  const formData = await req.formData()
  const audioFile = formData.get('audio')
  const clientId = formData.get('clientId') || null
  if (!audioFile) {
    return Response.json({ error: 'No audio file received' }, { status: 400 })
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
      { role: 'system', content: `You are a professional hairdressing assistant responsible for extracting hair color/formula information from a voice transcript and returning JSON:
      {"customer_name": "customer name", "service_type": "service type", "formula": "formula details", "notes": "notes"}
      Rules: only extract information explicitly mentioned in the text; leave fields not mentioned as an empty string; do not make anything up.` },
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
