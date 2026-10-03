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
