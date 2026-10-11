// Where a conversation stands: what was said just before the current message,
// whether the player is answering the kinling's question, and whether they
// are repeating themselves because it missed their answer. Small models lose
// track of this, so code works it out and the prompt says it plainly.
import { isPersuasionMemory } from './persuasion';
import type { ChatMessage, Memory } from './types';

export interface PriorExchange {
  /** The kinling's latest reply before this message. */
  reply: string | null;
  /** The player's message before this one. */
  player: string | null;
}

/** The chat before the current message (which may or may not be stored yet). */
export function chatBefore(chat: readonly ChatMessage[], playerText: string): ChatMessage[] {
  const last = chat.at(-1);
  return last?.role === 'player' && last.text === playerText ? chat.slice(0, -1) : [...chat];
}

export function priorExchange(chat: readonly ChatMessage[], playerText: string): PriorExchange {
  const before = chatBefore(chat, playerText);
  const reply = before.findLast((m) => m.role === 'creature')?.text ?? null;
  const player = before.findLast((m) => m.role === 'player')?.text ?? null;
  return { reply, player };
}

export function isQuestion(text: string): boolean {
  return /\?["”')\s]*$/.test(text.trim());
}

// "I said" only counts at the start and before a restated answer ("I said because…", "no, I said the
// big pond"); "I said hi to my neighbour" or "she said…" is just a story.
const REPAIR = /\b(i just (told|said)|i already (told|said)|like i (said|told you)|i told you already|you (already )?asked (me )?that|you asked that already)\b|^\s*(no,?\s*|but\s*)?i said(,|\s+(because|it|that|so|the|a|no|yes)\b)/i;

/** "I just told you…": the player thinks the kinling missed what they said. */
export function isRepair(text: string): boolean {
  return REPAIR.test(text.replace(/[’']/g, "'"));
}

/** The kinling asked something last, and this message answers rather than asks. */
export function answersQuestion(prior: PriorExchange, playerText: string): boolean {
  return !!prior.reply && isQuestion(prior.reply) && !isQuestion(playerText);
}

/** A memory taken from one of the player's messages: what they said, or what they tried to talk the kinling into. */
export function madeFromMessage(m: Pick<Memory, 'kind' | 'tags'>): boolean {
  return m.kind === 'player-chat' || isPersuasionMemory(m);
}

/**
 * True for a memory of a player message that is still in the chat sent word
 * for word. Recalling it beside the next message pulls the reply back to the
 * old topic. Memories are made after the message they come from, so anything
 * made since the oldest player message in view belongs to the visible chat.
 */
export function inVisibleChat(m: Pick<Memory, 'kind' | 'tags' | 'at'>, history: readonly ChatMessage[]): boolean {
  const oldest = history.find((x) => x.role === 'player');
  return !!oldest && madeFromMessage(m) && m.at >= oldest.at;
}

/** Normalised for comparing replies: case, spacing and closing punctuation do not count. */
function normalized(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[\s.!?…"”']+$/, '').trim();
}

/** True when a reply is word for word one of the recent replies. */
export function isExactRepeat(reply: string, recent: readonly string[]): boolean {
  const r = normalized(reply);
  return r.length > 0 && recent.some((x) => normalized(x) === r);
}

/** The kinling's last few replies, newest last. */
export function recentReplies(chat: readonly ChatMessage[], n = 3): string[] {
  return chat.filter((m) => m.role === 'creature').slice(-n).map((m) => m.text);
}
