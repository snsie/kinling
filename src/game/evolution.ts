// Physical evolution: requests (from the editor, the offline parser or the AI)
// are planned against the real save, previewed, and only applied on request.
import { COLORS } from './catalog';
import { evolutionLine, revertLine } from './dialogue';
import type { Outcome } from './outcome';
import { rejected } from './outcome';
import { addBond, refreshProgress } from './progress';
import { canAfford, draft, LIMITS, missingFor, recordEvent, recordMemory, spend, sumCosts } from './state';
import type { TraitDef } from './traits';
import { describeRequirement, isTraitId, requirementMet, TRAIT_BY_ID, traitLabel, withTrait, wornTraits } from './traits';
import type { Appearance, ColorId, MaterialCost, Proportions, SaveData, TraitId, TraitSlot } from './types';
import { COLOR_IDS, TRAIT_SLOTS } from './types';
import { clamp } from './util';

export const KEEP_SLOTS = [...TRAIT_SLOTS, 'accentColor', 'markingColor'] as const;
export type KeepSlot = (typeof KEEP_SLOTS)[number];

export interface EvolutionChange {
  trait: TraitId;
  remove?: boolean;
}

export interface EvolutionRequest {
  changes: EvolutionChange[];
  keep?: KeepSlot[];
  accentColor?: ColorId;
  markingColor?: ColorId;
  /** Fine-tuning from the editor sliders. */
  proportions?: Proportions;
}

export type RejectCode = 'unknown' | 'locked' | 'incompatible' | 'kept' | 'duplicate' | 'not-removable';

export interface PlannedChange {
  trait: TraitId;
  remove: boolean;
  name: string;
  cost: MaterialCost;
  /** Already paid for once, so free now. */
  owned: boolean;
}

export interface RejectedChange {
  trait: string;
  name: string;
  code: RejectCode;
  reason: string;
}

export interface EvolutionPlan {
  base: Appearance;
  preview: Appearance;
  accepted: PlannedChange[];
  rejected: RejectedChange[];
  /** Requested traits the creature already has. */
  unchanged: string[];
  cost: MaterialCost;
  missing: MaterialCost;
  affordable: boolean;
  changed: boolean;
}

export const MAX_CHANGES = 8;
/** Without the tall build unlocked, sliders cannot stretch past this height. */
export const HEIGHT_LIMIT_LOCKED = 0.65;

export const KEEP_LABELS: Record<KeepSlot, string> = {
  bodyColor: 'fur color',
  proportions: 'body shape',
  pattern: 'markings',
  glow: 'glow',
  ears: 'ears',
  tail: 'tail',
  horns: 'horns',
  fins: 'fin',
  wings: 'wings',
  accentColor: 'belly color',
  markingColor: 'marking color',
};

export function slotOf(trait: TraitId): TraitSlot {
  return TRAIT_BY_ID.get(trait)!.slot;
}

function keepLabel(slot: KeepSlot, base: Appearance): string {
  switch (slot) {
    case 'bodyColor':
      return `its ${COLORS[base.bodyColor].name.toLowerCase()} fur`;
    case 'accentColor':
      return 'its accent color';
    case 'markingColor':
      return 'its marking color';
    case 'ears':
      return `its ${base.ears} ears`;
    case 'tail':
      return `its ${base.tail} tail`;
    case 'pattern':
      return base.pattern === 'none' ? 'its plain coat' : `its ${base.pattern}`;
    case 'proportions':
      return 'its body shape';
    case 'glow':
      return 'its markings';
    default:
      return `its ${slot}`;
  }
}

export function clampProportions(save: SaveData, p: Proportions): Proportions {
  const tall = save.unlocks.traits.includes('shape.tall');
  return {
    plump: clamp(Number(p.plump), 0, 1),
    head: clamp(Number(p.head), 0, 1),
    height: clamp(Number(p.height), 0, tall ? 1 : HEIGHT_LIMIT_LOCKED),
  };
}

function sameAppearance(a: Appearance, b: Appearance): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function planEvolution(save: SaveData, request: EvolutionRequest): EvolutionPlan {
  const c = save.creature;
  if (!c) throw new Error('No creature');
  const base = c.appearance;
  let preview: Appearance = { ...base, proportions: { ...base.proportions } };
  const accepted: PlannedChange[] = [];
  const rejectedList: RejectedChange[] = [];
  const unchanged: string[] = [];
  const keep = new Set<KeepSlot>((request.keep ?? []).filter((k) => (KEEP_SLOTS as readonly string[]).includes(k)));
  const seenSlots = new Set<TraitSlot>();
  const unlocked = new Set(save.unlocks.traits);
  const owned = new Set(save.unlocks.owned);

  const changes = (request.changes ?? []).slice(0, MAX_CHANGES);
  // Removals first so "swap fins for wings" works in one request.
  const ordered = [...changes.filter((ch) => ch.remove), ...changes.filter((ch) => !ch.remove)];

  for (const ch of ordered) {
    const rawId = String(ch?.trait ?? '');
    if (!isTraitId(rawId)) {
      rejectedList.push({ trait: rawId.slice(0, 40), name: rawId.slice(0, 40) || 'Unknown', code: 'unknown', reason: 'That isn\'t a feature kinlings can grow.' });
      continue;
    }
    const def = TRAIT_BY_ID.get(rawId) as TraitDef;
    const remove = ch.remove === true;
    if (remove && !def.toggle) {
      rejectedList.push({ trait: def.id, name: def.name, code: 'not-removable', reason: `${def.name} can be swapped for another option, but not removed.` });
      continue;
    }
    if (seenSlots.has(def.slot)) {
      rejectedList.push({ trait: def.id, name: def.name, code: 'duplicate', reason: `Only one change to the ${def.slot} at a time.` });
      continue;
    }
    if (keep.has(def.slot)) {
      rejectedList.push({ trait: def.id, name: def.name, code: 'kept', reason: `Skipped so it keeps ${keepLabel(def.slot, base)}, as you asked.` });
      continue;
    }
    const wearing = wornTraits(preview).includes(def.id);
    if (remove ? !wearing : wearing) {
      unchanged.push(def.name);
      seenSlots.add(def.slot);
      continue;
    }
    if (!remove) {
      if (!unlocked.has(def.id)) {
        const needs = def.unlock.filter((r) => !requirementMet(save, r)).map((r) => describeRequirement(save, r));
        rejectedList.push({ trait: def.id, name: def.name, code: 'locked', reason: needs.length ? `Not unlocked yet: ${needs.join('; ')}.` : 'Not unlocked yet.' });
        continue;
      }
      const conflict = def.incompatible?.find((inc) => wornTraits(preview).includes(inc.trait));
      if (conflict) {
        rejectedList.push({ trait: def.id, name: def.name, code: 'incompatible', reason: `${conflict.reason} Remove ${traitLabel(conflict.trait).toLowerCase()} first.` });
        continue;
      }
    }
    seenSlots.add(def.slot);
    const isOwned = remove || owned.has(def.id);
    accepted.push({ trait: def.id, remove, name: def.name, cost: isOwned ? {} : { ...def.cost }, owned: isOwned });
    preview = withTrait(preview, def.id, remove);
  }

  if (request.accentColor && (COLOR_IDS as readonly string[]).includes(request.accentColor) && !keep.has('accentColor')) {
    preview.accentColor = request.accentColor;
  }
  if (request.markingColor && (COLOR_IDS as readonly string[]).includes(request.markingColor) && !keep.has('markingColor')) {
    preview.markingColor = request.markingColor;
  }
  if (request.proportions && !keep.has('proportions') && !seenSlots.has('proportions')) {
    preview.proportions = clampProportions(save, request.proportions);
  }

  const cost = sumCosts(accepted.map((a) => a.cost));
  return {
    base,
    preview,
    accepted,
    rejected: rejectedList,
    unchanged,
    cost,
    missing: missingFor(save.inventory, cost),
    affordable: canAfford(save.inventory, cost),
    changed: !sameAppearance(base, preview),
  };
}

/** Apply a request. The plan is always recomputed here; a caller-supplied preview is never trusted. */
export function applyEvolution(save: SaveData, request: EvolutionRequest, now: number): Outcome {
  if (!save.creature) return rejected(save, 'There is no creature yet.');
  const plan = planEvolution(save, request);
  if (!plan.changed) return rejected(save, 'Nothing would change.');
  if (!plan.affordable) return rejected(save, 'Not enough materials for this change yet.');

  const s = draft(save);
  const c = s.creature!;
  const bondBefore = c.bond;
  spend(s.inventory, plan.cost);
  s.appearanceHistory.push(c.appearance);
  if (s.appearanceHistory.length > LIMITS.appearanceHistory) s.appearanceHistory.splice(0, s.appearanceHistory.length - LIMITS.appearanceHistory);
  c.appearance = plan.preview;

  const firstTimeTraits = plan.accepted.filter((a) => !a.remove && !a.owned).map((a) => a.trait);
  for (const t of plan.accepted) if (!t.remove && !s.unlocks.owned.includes(t.trait)) s.unlocks.owned.push(t.trait);
  s.stats.evolutions += 1;
  // Rewards only for adopting a trait for the very first time, so reverting and
  // re-applying can never be farmed.
  if (firstTimeTraits.length) {
    c.needs.happiness = clamp(c.needs.happiness + 6, 0, 100);
    addBond(s, 2 * firstTimeTraits.length);
  }

  const parts = plan.accepted.map((a) => (a.remove ? `let go of ${a.name.toLowerCase()}` : `grew ${a.name.toLowerCase()}`));
  if (plan.preview.accentColor !== plan.base.accentColor) parts.push(`changed accent color to ${COLORS[plan.preview.accentColor].name.toLowerCase()}`);
  if (plan.preview.markingColor !== plan.base.markingColor) parts.push(`changed marking color to ${COLORS[plan.preview.markingColor].name.toLowerCase()}`);
  if (JSON.stringify(plan.preview.proportions) !== JSON.stringify(plan.base.proportions) && !plan.accepted.some((a) => a.trait.startsWith('shape.'))) {
    parts.push('adjusted its proportions');
  }
  const desc = `${c.name} ${parts.join(', ') || 'changed its look'}.`;
  recordEvent(s, 'evolved', desc, now);
  if (firstTimeTraits.length) {
    recordMemory(
      s,
      {
        kind: 'evolution',
        text: `I changed! I ${parts.join(' and ')}.`,
        tags: ['evolution', 'look', ...firstTimeTraits.flatMap((t) => t.split('.'))],
        importance: 2,
      },
      now,
    );
  }
  const progress = refreshProgress(s, now, bondBefore);
  return {
    save: s,
    feedback: {
      ok: true,
      line: evolutionLine(firstTimeTraits.length > 0),
      animation: 'happy',
      sound: 'sparkle',
      aiEvent: desc,
      toast: plan.accepted.length ? `${c.name} evolved!` : `${c.name}'s look was updated.`,
      ...progress,
    },
  };
}

/** Undo the last appearance change. Nothing is refunded and nothing is re-awarded. */
export function revertAppearance(save: SaveData, now: number): Outcome {
  if (!save.creature) return rejected(save, 'There is no creature yet.');
  if (save.appearanceHistory.length === 0) return rejected(save, 'There is no earlier look to return to.');
  const s = draft(save);
  const c = s.creature!;
  const previous = s.appearanceHistory.pop()!;
  c.appearance = previous;
  const desc = `${c.name} went back to an earlier look.`;
  recordEvent(s, 'reverted', desc, now);
  return { save: s, feedback: { ok: true, line: revertLine(), animation: 'happy', sound: 'pop', aiEvent: desc, toast: 'Appearance reverted.' } };
}
