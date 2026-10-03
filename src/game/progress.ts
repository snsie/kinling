// Post-action bookkeeping: unlock newly earned traits and detect stage-ups.
import type { LifeStage, SaveData, TraitId } from './types';
import { lifeStageFor, STAGE_LABELS } from './stage';
import { newlyUnlockedTraits, traitLabel } from './traits';
import { recordEvent, recordMemory } from './state';

export function addBond(save: SaveData, amount: number): void {
  if (save.creature && amount > 0) save.creature.bond = Math.round((save.creature.bond + amount) * 10) / 10;
}

export function refreshProgress(save: SaveData, now: number, bondBefore: number): { unlocked: TraitId[]; stageUp?: LifeStage } {
  const c = save.creature;
  if (!c) return { unlocked: [] };
  let stageUp: LifeStage | undefined;
  const before = lifeStageFor(bondBefore);
  const after = lifeStageFor(c.bond);
  if (before !== after) {
    stageUp = after;
    recordEvent(save, 'stage', `${c.name} grew into the ${STAGE_LABELS[after]} stage.`, now);
    recordMemory(save, { kind: 'milestone', text: `I grew into a ${STAGE_LABELS[after].toLowerCase()}!`, tags: ['grow', 'stage', after], importance: 3 }, now);
  }
  const unlocked = newlyUnlockedTraits(save);
  if (unlocked.length) {
    save.unlocks.traits.push(...unlocked);
    const names = unlocked.map(traitLabel).join(', ');
    recordEvent(save, 'unlock', `New evolution options unlocked: ${names}.`, now);
    recordMemory(save, { kind: 'evolution', text: `I felt something new stirring: I could grow ${names.toLowerCase()}.`, tags: ['unlock', 'evolution', ...unlocked.map((u) => u.split('.')[1]!)], importance: 2 }, now);
  }
  return { unlocked, stageUp };
}
