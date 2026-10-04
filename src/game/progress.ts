// Post-action bookkeeping: unlock newly earned traits and detect stage-ups.
import { EGG_MILESTONES, eggsEarned, totalBond } from './eggs';
import type { Kinling, LifeStage, SaveData, TraitId } from './types';
import { lifeStageFor, STAGE_LABELS } from './stage';
import { newlyUnlockedTraits, traitLabel } from './traits';
import { recordEvent, recordMemory } from './state';

export function addBond(k: Kinling, amount: number): void {
  if (amount > 0) k.bond = Math.round((k.bond + amount) * 10) / 10;
}

/** After kinling `c` made progress: record its stage-up, any shared unlocks it earned, and a new egg. */
export function refreshProgress(save: SaveData, c: Kinling, now: number, bondBefore: number): { unlocked: TraitId[]; stageUp?: LifeStage; eggArrived?: boolean } {
  let stageUp: LifeStage | undefined;
  const total = totalBond(save);
  const eggArrived = save.kinlings.length < EGG_MILESTONES.length + 1 && eggsEarned(total) > eggsEarned(total - (c.bond - bondBefore));
  if (eggArrived) recordEvent(save, 'egg', 'A new egg appeared in the hollow!', now);
  const before = lifeStageFor(bondBefore);
  const after = lifeStageFor(c.bond);
  if (before !== after) {
    stageUp = after;
    recordEvent(save, 'stage', `${c.name} grew into the ${STAGE_LABELS[after]} stage.`, now);
    recordMemory(c, { kind: 'milestone', text: `I grew into a ${STAGE_LABELS[after].toLowerCase()}!`, tags: ['grow', 'stage', after], importance: 3 }, now);
  }
  const unlocked = newlyUnlockedTraits(save);
  if (unlocked.length) {
    save.unlocks.traits.push(...unlocked);
    const names = unlocked.map(traitLabel).join(', ');
    recordEvent(save, 'unlock', `New evolution options unlocked: ${names}.`, now);
    recordMemory(c, { kind: 'evolution', text: `I felt something new stirring: I could grow ${names.toLowerCase()}.`, tags: ['unlock', 'evolution', ...unlocked.map((u) => u.split('.')[1]!)], importance: 2 }, now);
  }
  return eggArrived ? { unlocked, stageUp, eggArrived } : { unlocked, stageUp };
}
