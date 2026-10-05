import { BOND_STAGES } from './catalog';
import type { LifeStage } from './types';

export function lifeStageFor(bond: number): LifeStage {
  let stage: LifeStage = 'hatchling';
  for (const s of BOND_STAGES) if (bond >= s.minBond) stage = s.stage;
  return stage;
}

/** Bond needed for the next stage, or null when fully grown. */
export function nextStageAt(bond: number): { stage: LifeStage; bond: number } | null {
  const next = BOND_STAGES.find((s) => s.minBond > bond);
  return next ? { stage: next.stage, bond: next.minBond } : null;
}

export const STAGE_LABELS: Record<LifeStage, string> = {
  hatchling: 'Hatchling',
  sprout: 'Sprout',
  grown: 'Grown',
};

/** Levels never go past this. */
export const MAX_LEVEL = 30;

/**
 * Bond needed to reach a level: ⅔·L·(L−1), rounded up. Early levels come
 * quickly (level 2 at bond 2) and level 10 arrives at bond 60, together with
 * the Sprout stage.
 */
export function bondForLevel(level: number): number {
  const l = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return Math.ceil((2 * l * (l - 1)) / 3);
}

/** A kinling's level, from its bond (which never decreases, so neither does the level). */
export function levelFor(bond: number): number {
  let level = 1;
  while (level < MAX_LEVEL && bond >= bondForLevel(level + 1)) level++;
  return level;
}
