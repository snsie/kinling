// What a chat message is asking for, and how long a reply it deserves.
// Rules handle clear cases (and everything when AI is off); messages the rules
// are unsure about can be classified by the model instead.
import { looksLikeAppearanceRequest, looksLikeCareInstruction } from './careProposals';

export const INTENTS = ['chat', 'care', 'evolve'] as const;
export type Intent = (typeof INTENTS)[number];

export interface RuleRoute {
  intent: Intent;
  /** False when the message is worth a second opinion from the model. */
  confident: boolean;
}

const CARE_WORDS = /\b(eat|eats|feed|snack|hungry|food|nap|sleep|sleepy|tired|rest|bath|wash|groom|brush|clean|messy|dirty|play|game|chase|explore|adventure|garden|pond|swim|walk|berry|berries|dewberry|plum|clover|cress|bun)\b/;
const LOOK_WORDS = /\b(ears?|tail|fur|coat|colou?r|spots|stripes|markings?|wings?|fins?|horns?|glow(ing)?|looks?|appearance|aquatic|woodland|celestial|evolve|evolution|shape|rounder|taller|pink|blue|green|purple)\b/;
const CLEAR_CARE = /^(please\s+)?(let'?s|go|time to|time for|you should|eat|have a|take a|nap|sleep|rest|play|explore|swim|bath|feed)\b/;
const CLEAR_EVOLVE = /^(please\s+)?(make|give|turn|change|evolve|grow|i want you to (have|be|look)|(can|could) you (make|give|turn|change|grow))\b/;

export function ruleIntent(raw: string): RuleRoute {
  const t = raw.trim().toLowerCase().replace(/[’']/g, "'");
  const evolve = looksLikeAppearanceRequest(t);
  const care = looksLikeCareInstruction(t);
  const question = /\?\s*$/.test(t);
  if (evolve && !care) return { intent: 'evolve', confident: CLEAR_EVOLVE.test(t) && !question };
  if (care && !evolve) return { intent: 'care', confident: CLEAR_CARE.test(t) && !question };
  if (evolve && care) return { intent: 'evolve', confident: false };
  return { intent: 'chat', confident: !CARE_WORDS.test(t) && !LOOK_WORDS.test(t) };
}

export interface ReplyBudget {
  maxTokens: number;
  sentences: number;
  maxChars: number;
  /** Word limit stated in the prompt. */
  words: number;
}

const ASKS = /^(what|why|how|who|where|when|which|tell me|do you|did you|can you|could you|would you|are you|is it|is there|explain|describe)\b/;

/** Questions and longer messages earn a longer reply; small talk stays short. */
export function replyBudget(text: string): ReplyBudget {
  const t = text.trim().toLowerCase();
  if (/\?\s*$/.test(t) || ASKS.test(t) || t.length > 120) return { maxTokens: 150, sentences: 3, maxChars: 400, words: 60 };
  return { maxTokens: 80, sentences: 2, maxChars: 260, words: 40 };
}
