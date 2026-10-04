// New eggs. Kinlings 2–4 arrive as eggs when the kinlings' bond, added
// together, passes a milestone; each is hatched through the same egg →
// look → hatch → name steps as the first.
import { draft, LIMITS } from './state';
import type { SaveData } from './types';

/** Total bond at which the 2nd, 3rd and 4th eggs arrive. */
export const EGG_MILESTONES = [60, 180, 360] as const;

export function totalBond(save: SaveData): number {
  return save.kinlings.reduce((sum, k) => sum + k.bond, 0);
}

export function eggsEarned(bond: number): number {
  return EGG_MILESTONES.filter((m) => bond >= m).length;
}

/** An egg has arrived and is waiting to be hatched. */
export function eggWaiting(save: SaveData): boolean {
  const n = save.kinlings.length;
  return n > 0 && n < LIMITS.kinlings && n - 1 < eggsEarned(totalBond(save));
}

/** Total bond needed for the next egg, or null when no more eggs will come. */
export function nextEggAt(save: SaveData): number | null {
  const n = save.kinlings.length;
  if (n === 0 || n >= LIMITS.kinlings) return null;
  return EGG_MILESTONES[n - 1] ?? null;
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
