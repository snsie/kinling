// The literal text Qwen3 reads: its ChatML chat template, with the empty
// thinking block that `enable_thinking: false` adds before the reply.
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';

export function messageText(m: ChatCompletionMessageParam): string {
  const c = m.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((part) => ('text' in part ? part.text : '')).join('');
  return '';
}

export function toChatML(messages: ChatCompletionMessageParam[]): string {
  const turns = messages.map((m) => `<|im_start|>${m.role}\n${messageText(m)}<|im_end|>\n`).join('');
  return `${turns}<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}
