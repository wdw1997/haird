import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

export async function generateAssistantReply(phoneNumber, userMessage, context) {
  // 这里写你调用 AI 的逻辑
  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      prompt: userMessage,
      system: "You are a helpful assistant for a hair salon..."
    });
    return text;
  } catch (error) {
    console.error("AI Reply Error:", error);
    return "Sorry, I am having trouble connecting to my brain right now.";
  }
}
