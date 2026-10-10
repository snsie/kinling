// Parsing model output for structured proposals. Model text is untrusted:
// it is length-limited, parsed defensively and validated with Zod. Unknown
// ids are dropped here; the game rules then validate unlocks and costs.
import { z } from 'zod';
import { FEELINGS, type ModelAppraisal } from '../game/appraisal';
import type { EvolutionRequest, KeepSlot } from '../game/evolution';
import { KEEP_SLOTS } from '../game/evolution';
import type { ProposedAction } from '../game/careProposals';
import { coerceActions } from '../game/careProposals';
import { INTENTS, type Intent } from '../game/intent';
import { sanitizeText } from '../game/social';
import { LIMITS } from '../game/state';
import { isTraitId } from '../game/traits';
import { TACTICS, type Tactic, type TraitId } from '../game/types';
import { cleanReply } from './prompts';

const MAX_RAW = 4000;

/** Pull the first balanced JSON object out of text and parse it. */
export function extractJson(raw: string): unknown {
  if (typeof raw !== 'string') return null;
  const text = raw.slice(0, MAX_RAW).replace(/<think>[\s\S]*?<\/think>/gi, '');
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

const ChangeSchema = z.object({
  trait: z.string().max(40),
  remove: z.boolean().optional().default(false),
});

export const EvolutionProposalSchema = z.object({
  reply: z.string().max(400).optional().default(''),
  changes: z.array(z.unknown()).max(12).optional().default([]),
  keep: z.array(z.string().max(30)).max(12).optional().default([]),
});

export interface EvolutionProposal {
  request: EvolutionRequest;
  reply: string;
  /** Ids the model produced that are not in the catalog (dropped). */
  invalid: string[];
}

export function parseEvolutionProposal(raw: string): EvolutionProposal | null {
  const parsed = EvolutionProposalSchema.safeParse(extractJson(raw));
  if (!parsed.success) return null;
  const invalid: string[] = [];
  const changes: { trait: TraitId; remove?: boolean }[] = [];
  for (const item of parsed.data.changes) {
    const ch = ChangeSchema.safeParse(item);
    if (!ch.success) {
      invalid.push('(malformed)');
      continue;
    }
    if (!isTraitId(ch.data.trait)) {
      invalid.push(ch.data.trait.slice(0, 40));
      continue;
    }
    changes.push(ch.data.remove ? { trait: ch.data.trait, remove: true } : { trait: ch.data.trait });
  }
  const keep = parsed.data.keep.filter((k): k is KeepSlot => (KEEP_SLOTS as readonly string[]).includes(k));
  return { request: { changes, keep }, reply: cleanReply(parsed.data.reply, 1, 160), invalid };
}

export const CareProposalSchema = z.object({
  reply: z.string().max(400).optional().default(''),
  actions: z
    .array(
      z.object({
        type: z.string().max(20),
        food: z.string().max(20).optional(),
        route: z.string().max(30).optional(),
      }),
    )
    .max(6)
    .optional()
    .default([]),
});

export interface CareProposal {
  actions: ProposedAction[];
  reply: string;
}

export function parseCareProposal(raw: string): CareProposal | null {
  const parsed = CareProposalSchema.safeParse(extractJson(raw));
  if (!parsed.success) return null;
  return { actions: coerceActions(parsed.data.actions), reply: cleanReply(parsed.data.reply, 2) };
}

export function parseIntent(raw: string): Intent | null {
  const parsed = z.object({ intent: z.enum(INTENTS) }).safeParse(extractJson(raw));
  return parsed.success ? parsed.data.intent : null;
}

/** The tactic the model saw in a message; null for none or unreadable output. */
export function parseTactic(raw: string): Tactic | null {
  const parsed = z.object({ tactic: z.enum([...TACTICS, 'none']) }).safeParse(extractJson(raw));
  return parsed.success && parsed.data.tactic !== 'none' ? parsed.data.tactic : null;
}

/** A suggested fact, cleaned. Null when the model found none. */
export function parseFactProposal(raw: string): string | null {
  const parsed = z.object({ fact: z.string().max(400) }).safeParse(extractJson(raw));
  if (!parsed.success) return null;
  const fact = sanitizeText(parsed.data.fact.replace(/^["“'\s]+|["”'\s.!]+$/g, ''), LIMITS.factLength);
  return fact.length >= 3 ? fact : null;
}

const AppraisalSchema = z.object({
  memory: z.string().max(400).optional().default(''),
  importance: z.enum(['small', 'meaningful', 'big']).catch('small'),
  feeling: z.enum(FEELINGS).catch('neutral'),
});

/** A proposed memory of one moment, cleaned. Null when the output is unusable. */
export function parseAppraisal(raw: string): ModelAppraisal | null {
  const parsed = AppraisalSchema.safeParse(extractJson(raw));
  if (!parsed.success) return null;
  const memory = sanitizeText(cleanReply(parsed.data.memory, 2, 200).replace(/^["“'\s]+|["”'\s]+$/g, ''), 200);
  return { ...parsed.data, memory };
}

/**
 * Combine "keep" constraints from the model and the offline parser. The
 * parser's keeps always count; the model's count unless the player explicitly
 * asked to change that part (small models sometimes "keep" what was requested).
 */
export function mergeKeep(modelKeep: KeepSlot[] = [], parserKeep: KeepSlot[] = [], explicitlyChanged: Iterable<string> = []): KeepSlot[] {
  const changed = new Set(explicitlyChanged);
  return [...new Set([...modelKeep.filter((k) => !changed.has(k)), ...parserKeep])];
}
