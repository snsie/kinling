// LLM trait deltas: the model proposes how each trait should move after a
// conversation; code bounds the proposal before it touches the kinling.
import { z } from 'zod';
import { extractJson } from '../ai/proposals';
import { clamp } from '../game/util';
import { PERSONALITY_KEYS, type Personality, type PersonalityKey } from '../game/types';
import type { EvolveConfig } from './types';

export interface TraitProposal {
  deltas: Partial<Personality>;
  reason: string;
}

export function evolveSchema(range: number): string {
  const values = Array.from({ length: range * 2 + 1 }, (_, i) => i - range);
  const trait = { type: 'integer', enum: values };
  return JSON.stringify({
    type: 'object',
    properties: { ...Object.fromEntries(PERSONALITY_KEYS.map((k) => [k, trait])), reason: { type: 'string' } },
    required: [...PERSONALITY_KEYS, 'reason'],
  });
}

const ProposalSchema = z.object({
  ...(Object.fromEntries(PERSONALITY_KEYS.map((k) => [k, z.coerce.number().optional()])) as Record<PersonalityKey, z.ZodOptional<z.ZodCoercedNumber>>),
  reason: z.string().max(400).optional().default(''),
});

export function parseTraitProposal(raw: string, range: number): TraitProposal | null {
  const parsed = ProposalSchema.safeParse(extractJson(raw));
  if (!parsed.success) return null;
  const deltas: Partial<Personality> = {};
  for (const key of PERSONALITY_KEYS) {
    const v = parsed.data[key];
    if (typeof v === 'number' && Number.isFinite(v)) deltas[key] = clamp(Math.round(v), -range, range);
  }
  return { deltas, reason: parsed.data.reason.trim() };
}

/** Bound each proposed change by the step cap, the drift limit and 0–100. */
export function applyDeltas(
  personality: Personality,
  baseline: Personality,
  proposed: Partial<Personality>,
  limits: Pick<EvolveConfig, 'maxStep' | 'driftLimit'>,
): { after: Personality; applied: Partial<Personality> } {
  const after = { ...personality };
  const applied: Partial<Personality> = {};
  for (const key of PERSONALITY_KEYS) {
    const want = clamp(proposed[key] ?? 0, -limits.maxStep, limits.maxStep);
    if (!want) continue;
    const lo = Math.max(0, baseline[key] - limits.driftLimit);
    const hi = Math.min(100, baseline[key] + limits.driftLimit);
    const before = personality[key];
    // Never push further out of bounds, but a trait already outside may move back.
    const next = clamp(before + want, Math.min(lo, before), Math.max(hi, before));
    if (next === before) continue;
    after[key] = next;
    applied[key] = next - before;
  }
  return { after, applied };
}
