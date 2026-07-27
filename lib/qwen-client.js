import OpenAI from 'openai'

// 使用美国弗吉尼亚节点,离美国用户更近、延迟更低
export const qwen = new OpenAI({
  apiKey: process.env.DASHSCOPE_API_KEY,
  baseURL: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
})

export const QWEN_MODEL = 'qwen-plus' // 需要更强的推理能力可以换成 qwen-max