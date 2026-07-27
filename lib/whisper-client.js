import OpenAI from 'openai'

// 只用来做语音转文字,和千问的对话客户端是分开的两个东西
export const whisperClient = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
})

export const STT_MODEL = 'openai/whisper-large-v3'