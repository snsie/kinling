import { chooseEgg, hatch, nameCreature } from '../src/game/onboarding';
import { createSave } from '../src/game/state';
import type { EggType, SaveData } from '../src/game/types';

export const T0 = new Date('2026-03-01T10:00:00').getTime();
export const MIN = 60_000;
export const HOUR = 3_600_000;

export function hatchedSave(egg: EggType = 'woodland', now = T0): SaveData {
  let s = createSave(now);
  s = chooseEgg(s, egg);
  s = hatch(s, now).save;
  s = nameCreature(s, 'Mochi', 'Sam', now).save;
  s.onboarding.step = 'done';
  return s;
}
