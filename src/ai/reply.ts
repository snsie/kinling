// What happens to a chat reply between the model and the conversation, shared
// by the game and the Personality Lab. Small models drift into repeating their
// own last replies, parroting the player or copying a style example. A sentence
// that only echoes the player is dropped; a reply that still repeats is
// regenerated once with less history in view, then replaced by authored text.
// A reply that is word for word a recent one (or the player's message) is never
// kept: stored, it would be copied again next turn and the loop would grow.
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { isExactRepeat, priorExchange, recentReplies } from '../game/conversation';
import { offlineChatReply } from '../game/dialogue';
import type { ReplyBudget } from '../game/intent';
import { activeKinling } from '../game/state';
import type { SaveData } from '../game/types';
import { chatMessages, cleanReply, dropParrot, dropRepeatedTail, exampleReplies, repeatsRecent, toneIsSafe, type RecallVectors } from './prompts';

/** The retry is hotter, so it does not land on the same words again. */
export const RETRY_TEMPERATURE = 0.9;
/**
 * Chat messages the retry keeps. With the player's message already stored these
 * are the last reply and the message itself, and since history must start with
 * the player, no earlier reply is left in view to copy.
 */
export const RETRY_HISTORY = 2;

export interface HandledReply {
  text: string;
  source: 'ai' | 'authored';
}

export interface ReplyOptions {
  budget: Pick<ReplyBudget, 'sentences' | 'words'>;
  vectors?: RecallVectors | null;
  /** Temperature of the first attempt. */
  temperature?: number;
  /** One model call; `retry` is true for the second attempt. Errors propagate to the caller. */
  generate: (messages: ChatCompletionMessageParam[], temperature: number, retry: boolean) => Promise<string>;
  /** Cleaning applied to the model's text. */
  clean: (text: string) => string;
}

export function usable(text: string): boolean {
  return text.length >= 2 && toneIsSafe(text);
}

/** An authored reply that is not a word-for-word repeat of a recent one. */
export function authoredReply(save: SaveData, playerText: string, now: number, rand: () => number = Math.random): string {
  const recent = recentReplies(activeKinling(save)?.chat ?? []);
  for (let i = 0; i < 6; i++) {
    const text = offlineChatReply(save, playerText, rand, now);
    if (!isExactRepeat(text, recent)) return text;
  }
  return isExactRepeat('…', recent) ? 'Mm.' : '…';
}

export async function handledReply(save: SaveData, playerText: string, now: number, opts: ReplyOptions): Promise<HandledReply> {
  const fallback = (): HandledReply => ({ text: authoredReply(save, playerText, now), source: 'authored' });
  const chat = activeKinling(save)?.chat ?? [];
  const recent = recentReplies(chat);
  // What the player said, now and just before: "I just told you…" invites echoing the earlier message.
  const said = [playerText, priorExchange(chat, playerText).player].filter((x): x is string => !!x);
  // Echoes are found in tidied text (no thinking block or "Sam's answer:" label), before sentences are capped.
  const clean = (t: string) => opts.clean(dropParrot(cleanReply(t, 20, 4000), said));
  let text = clean(await opts.generate(chatMessages(save, playerText, now, opts.budget, opts.vectors), opts.temperature ?? 0.7, false));
  const avoid = [...recent, ...said, ...exampleReplies(save)];
  if (repeatsRecent(text, avoid)) {
    const again = clean(await opts.generate(chatMessages(save, playerText, now, opts.budget, opts.vectors, RETRY_HISTORY), RETRY_TEMPERATURE, true));
    // Still a repeat, a parrot or a copied style example: authored words are better than that.
    if (!usable(again) || repeatsRecent(again, avoid)) return fallback();
    text = again;
  }
  text = dropRepeatedTail(text, recent);
  return usable(text) && !isExactRepeat(text, [...recent, ...said]) ? { text, source: 'ai' } : fallback();
}
