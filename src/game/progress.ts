// Post-action bookkeeping: unlock newly earned traits, detect level-ups and
// stage-ups, and notice when a new egg arrives.
import { advanceAct, arcOnLevelUp } from './arc';
import { allReadyForEgg, eggWaiting } from './eggs';
import type { Kinling, LifeStage, SaveData, TraitId } from './types';
import { levelFor, lifeStageFor, STAGE_LABELS } from './stage';
import { newlyUnlockedTraits, traitLabel } from './traits';
import { recordEvent, recordMemory } from './state';

export function addBond(k: Kinling, amount: number): void {
  if (amount > 0) k.bond = Math.round((k.bond + amount) * 10) / 10;
}

export interface Progress {
  unlocked: TraitId[];
  stageUp?: LifeStage;
  /** The level kinling `c` just reached. */
  levelUp?: number;
  eggArrived?: boolean;
}

/** After kinling `c` made progress: record its level-up and stage-up, any shared unlocks it earned, and a new egg. */
export function refreshProgress(save: SaveData, c: Kinling, now: number, bondBefore: number): Progress {
  let stageUp: LifeStage | undefined;
  const level = levelFor(c.bond);
  const levelUp = level > levelFor(bondBefore) ? level : undefined;
  // The egg arrives when this progress brought the last kinling below level 10 up to it.
  const readyBefore = allReadyForEgg(save.kinlings.map((k) => (k.id === c.id ? { bond: bondBefore } : k)));
  const eggArrived = !readyBefore && eggWaiting(save);
  if (eggArrived) recordEvent(save, 'egg', 'A new egg appeared in the hollow!', now);
  const before = lifeStageFor(bondBefore);
  const after = lifeStageFor(c.bond);
  if (before !== after) {
    stageUp = after;
    recordEvent(save, 'stage', `${c.name} grew into the ${STAGE_LABELS[after]} stage.`, now);
    recordMemory(c, { kind: 'milestone', text: `I grew into a ${STAGE_LABELS[after].toLowerCase()}!`, tags: ['grow', 'stage', after], importance: 3 }, now);
  }
  if (levelUp) arcOnLevelUp(c, now);
  advanceAct(save, c, now);
  const unlocked = newlyUnlockedTraits(save);
  if (unlocked.length) {
    save.unlocks.traits.push(...unlocked);
    const names = unlocked.map(traitLabel).join(', ');
    recordEvent(save, 'unlock', `New evolution options unlocked: ${names}.`, now);
    recordMemory(c, { kind: 'evolution', text: `I felt something new stirring: I could grow ${names.toLowerCase()}.`, tags: ['unlock', 'evolution', ...unlocked.map((u) => u.split('.')[1]!)], importance: 2 }, now);
  }
  return { unlocked, stageUp, ...(levelUp ? { levelUp } : {}), ...(eggArrived ? { eggArrived } : {}) };
}
