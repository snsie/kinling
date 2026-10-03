// Onboarding transitions: egg choice, creation-time customization, hatching, naming.
import { COLORS, EGGS, STARTER_COLORS } from './catalog';
import type { Outcome } from './outcome';
import { rejected } from './outcome';
import { activeKinling, draft, eggDefaults, hatchKinling, playerFeelingFromBond, recordEvent, recordMemory, LIMITS } from './state';
import { SHAPE_PRESETS, starterTraitsFor, TRAIT_BY_ID, withTrait } from './traits';
import type { Appearance, ColorId, EarId, EggType, OnboardingStep, PatternId, SaveData, TailId, TraitId } from './types';
import { EAR_IDS, PATTERN_IDS, TAIL_IDS } from './types';
import { clamp } from './util';

export interface CreationOptions {
  colors: ColorId[];
  ears: EarId[];
  tails: TailId[];
  patterns: PatternId[];
  glow: boolean;
}

/** What may be chosen before hatching: shared starters plus the egg's own extras. */
export function creationOptions(egg: EggType): CreationOptions {
  const starters = new Set(starterTraitsFor(egg));
  return {
    colors: [...new Set([...STARTER_COLORS, ...(Object.keys(COLORS) as ColorId[]).filter((c) => starters.has(`color.${c}`))])],
    ears: EAR_IDS.filter((e) => starters.has(`ears.${e}`)),
    tails: TAIL_IDS.filter((t) => starters.has(`tail.${t}`)),
    patterns: PATTERN_IDS.filter((p) => starters.has(`pattern.${p}`)),
    glow: starters.has('feature.glow'),
  };
}

/** Force an appearance into what this egg allows at creation time. */
export function normalizeCreationAppearance(egg: EggType, a: Appearance): Appearance {
  const opts = creationOptions(egg);
  const def = EGGS[egg].defaultAppearance;
  const allColors = Object.keys(COLORS) as ColorId[];
  const pickOr = <T>(value: T, allowed: readonly T[], fallback: T): T => (allowed.includes(value) ? value : fallback);
  return {
    bodyColor: pickOr(a.bodyColor, opts.colors, def.bodyColor),
    accentColor: pickOr(a.accentColor, allColors, def.accentColor),
    markingColor: pickOr(a.markingColor, allColors, def.markingColor),
    proportions: {
      plump: clamp(Number(a.proportions?.plump ?? 0.5), 0, 1),
      head: clamp(Number(a.proportions?.head ?? 0.5), 0, 1),
      height: clamp(Number(a.proportions?.height ?? 0.5), 0, 0.65),
    },
    pattern: pickOr(a.pattern, opts.patterns, def.pattern),
    glow: opts.glow ? a.glow === true : false,
    ears: pickOr(a.ears, opts.ears, def.ears),
    tail: pickOr(a.tail, opts.tails, def.tail),
    horns: false,
    fins: false,
    wings: false,
  };
}

export function setStep(save: SaveData, step: OnboardingStep): SaveData {
  const s = draft(save);
  s.onboarding.step = step;
  return s;
}

export function chooseEgg(save: SaveData, egg: EggType): SaveData {
  const s = draft(save);
  const sameEgg = s.onboarding.egg === egg && s.onboarding.draftAppearance;
  s.onboarding.egg = egg;
  if (!sameEgg) s.onboarding.draftAppearance = eggDefaults(egg);
  s.onboarding.step = 'customize';
  return s;
}

export function setDraftAppearance(save: SaveData, appearance: Appearance): SaveData {
  const egg = save.onboarding.egg;
  if (!egg) return save;
  const s = draft(save);
  s.onboarding.draftAppearance = normalizeCreationAppearance(egg, appearance);
  return s;
}

export function hatch(save: SaveData, now: number): Outcome {
  const egg = save.onboarding.egg;
  if (!egg || !save.onboarding.draftAppearance) return rejected(save, 'Choose an egg first.');
  if (save.kinlings.length) return rejected(save, 'Already hatched.');
  const s = draft(save);
  const def = EGGS[egg];
  const starters = starterTraitsFor(egg);
  const k = hatchKinling(s, egg, normalizeCreationAppearance(egg, s.onboarding.draftAppearance!), now);
  s.kinlings.push(k);
  s.activeKinlingId = k.id;
  s.feelings.push(playerFeelingFromBond(k.id, k.bond));
  s.unlocks = { traits: [...starters], owned: [...starters] };
  s.lastTickAt = now;
  s.onboarding.step = 'name';
  recordEvent(s, 'hatched', `A kinling hatched from a ${def.name.toLowerCase()}.`, now);
  recordMemory(k, { kind: 'milestone', text: `I hatched from a ${def.name.toLowerCase()} and saw my friend for the first time.`, tags: ['hatch', 'egg', egg, 'birthday', 'first'], importance: 3 }, now);
  return { save: s, feedback: { ok: true, animation: 'happy', sound: 'sparkle', line: '*blinks* ...Hi!' } };
}

export function sanitizeName(raw: string, max: number = LIMITS.nameLength): string {
  return raw
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} '\-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim();
}

export function nameCreature(save: SaveData, name: string, playerName: string, now: number): Outcome {
  if (!activeKinling(save)) return rejected(save, 'Hatch first.');
  const clean = sanitizeName(name);
  if (!clean) return rejected(save, 'Please choose a name using letters or numbers.');
  const s = draft(save);
  const k = activeKinling(s)!;
  k.name = clean;
  const pn = sanitizeName(playerName, 24);
  s.player.name = pn || null;
  s.onboarding.step = 'firstCare';
  recordEvent(s, 'hatched', `The new kinling was named ${clean}${pn ? ` by ${pn}` : ''}.`, now);
  recordMemory(k, { kind: 'milestone', text: `${pn || 'My friend'} named me ${clean}.`, tags: ['name', clean.toLowerCase(), 'first'], importance: 3 }, now);
  return { save: s, feedback: { ok: true, animation: 'happy', sound: 'chime', line: `${clean}! I love it. That's me!` } };
}

export function shapePresetFor(shape: keyof typeof SHAPE_PRESETS) {
  return { ...SHAPE_PRESETS[shape] };
}

export interface CreationRequestResult {
  appearance: Appearance;
  applied: string[];
  /** Requested features that can't be chosen at hatching (but may evolve later). */
  later: string[];
}

/** Apply a translated description to the pre-hatch draft, limited to creation options. */
export function applyCreationRequest(egg: EggType, base: Appearance, request: { changes: { trait: TraitId; remove?: boolean }[]; accentColor?: ColorId; markingColor?: ColorId }): CreationRequestResult {
  const allowed = new Set(starterTraitsFor(egg));
  let next: Appearance = { ...base, proportions: { ...base.proportions } };
  const applied: string[] = [];
  const later: string[] = [];
  for (const ch of request.changes.slice(0, 8)) {
    const def = TRAIT_BY_ID.get(ch.trait);
    if (!def) continue;
    if (ch.remove) {
      next = withTrait(next, def.id, true);
      continue;
    }
    if (!allowed.has(def.id) || def.id === 'shape.tall') {
      later.push(def.name);
      continue;
    }
    next = withTrait(next, def.id);
    applied.push(def.name);
  }
  if (request.accentColor) {
    next.accentColor = request.accentColor;
    applied.push(`${COLORS[request.accentColor].name} belly`);
  }
  if (request.markingColor) {
    next.markingColor = request.markingColor;
    applied.push(`${COLORS[request.markingColor].name} markings`);
  }
  return { appearance: normalizeCreationAppearance(egg, next), applied, later };
}
