// New eggs. Once every kinling in the hollow has reached level 10, a new egg
// arrives (up to four kinlings); each is hatched through the same egg → look
// → hatch → name steps as the first.
import { levelFor } from './stage';
import { draft, LIMITS } from './state';
import type { Kinling, SaveData } from './types';

/** Every kinling must reach this level before another egg arrives. */
export const EGG_LEVEL = 10;

/** True when there is at least one kinling and all of them are at least level 10. */
export function allReadyForEgg(kinlings: readonly Pick<Kinling, 'bond'>[]): boolean {
  return kinlings.length > 0 && kinlings.every((k) => levelFor(k.bond) >= EGG_LEVEL);
}

/** An egg has arrived and is waiting to be hatched. */
export function eggWaiting(save: SaveData): boolean {
  const n = save.kinlings.length;
  return n < LIMITS.kinlings && allReadyForEgg(save.kinlings);
}

/** Kinlings still below level 10, lowest first; empty when an egg is waiting or no more will come. */
export function kinlingsBelowEggLevel(save: SaveData): Kinling[] {
  if (save.kinlings.length >= LIMITS.kinlings) return [];
  return save.kinlings.filter((k) => levelFor(k.bond) < EGG_LEVEL).sort((a, b) => a.bond - b.bond);
}

/** Another kinling is being hatched (the save is back in the hatch steps). */
export function hatchingSibling(save: SaveData): boolean {
  return save.kinlings.length > 0 && save.onboarding.step !== 'done';
}

export function startSiblingHatch(save: SaveData): SaveData {
  if (!eggWaiting(save) || save.onboarding.step !== 'done') return save;
  const s = draft(save);
  s.onboarding = { step: 'egg', egg: null, draftAppearance: null };
  return s;
}

/** Leave the egg for later; it keeps waiting. */
export function cancelSiblingHatch(save: SaveData): SaveData {
  if (!hatchingSibling(save) || save.onboarding.step === 'name') return save;
  const s = draft(save);
  s.onboarding = { step: 'done', egg: null, draftAppearance: null };
  return s;
}
