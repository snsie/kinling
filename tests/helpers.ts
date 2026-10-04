import { chooseEgg, hatch, nameCreature } from '../src/game/onboarding';
import { firstMeeting } from '../src/game/feelings';
import { activeKinling, createSave, eggDefaults, hatchKinling, playerFeelingFromBond } from '../src/game/state';
import { starterTraitsFor } from '../src/game/traits';
import type { EggType, Kinling, SaveData } from '../src/game/types';

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

/** The selected kinling (tests always have one). */
export function kin(save: SaveData): Kinling {
  return activeKinling(save)!;
}

/** The same save in the single-creature v3 layout, for migration tests. */
export function legacyV3(save: SaveData): Record<string, unknown> {
  const { kinlings, activeKinlingId: _a, feelings: _f, conversations: _c, ...rest } = structuredClone(save);
  const k = kinlings[0];
  let creature: Record<string, unknown> | null = null;
  let extra: Record<string, unknown> = { memories: [], chat: [], chatSummary: null, appearanceHistory: [] };
  let daily: Record<string, unknown> = { day: '2026-03-01', personalityDelta: { curiosity: 0, confidence: 0, playfulness: 0 }, careLog: { feed: [], groom: [], rest: [], play: [] }, chatBond: 0 };
  if (k) {
    const { baseline: _b, memories, chat, chatSummary, appearanceHistory, careLog, socialDaily, appraisedThroughId: _ap, lastReflectionAt: _lr, ...c } = k;
    creature = c;
    extra = { memories: memories.map(({ withIds: _w, private: _p, valence: _v, influence: _i, ...m }) => m), chat, chatSummary, appearanceHistory };
    daily = { ...socialDaily, careLog };
  }
  return {
    ...rest,
    ...extra,
    creature,
    daily,
    player: { ...rest.player, facts: rest.player.facts.map(({ shareable: _s, ...f }) => f) },
    settings: { ...rest.settings, ai: { enabled: rest.settings.ai.enabled, modelId: rest.settings.ai.modelId, downloadConsent: rest.settings.ai.downloadConsent } },
    schemaVersion: 3,
  };
}

/** Up to four kinlings who have all met. */
export function family(n = 4): SaveData {
  const s = hatchedSave('woodland');
  const eggs: EggType[] = ['aquatic', 'celestial', 'woodland'];
  for (let i = 0; i < n - 1; i++) {
    const egg = eggs[i]!;
    const k = hatchKinling(s, egg, eggDefaults(egg), T0, { seed: i + 1 });
    k.name = ['Pip', 'Fig', 'Luma'][i]!;
    for (const o of s.kinlings) s.feelings.push(firstMeeting(k.id, o.id), firstMeeting(o.id, k.id));
    s.kinlings.push(k);
    s.feelings.push(playerFeelingFromBond(k.id, 0));
    for (const t of starterTraitsFor(egg)) {
      if (!s.unlocks.traits.includes(t)) s.unlocks.traits.push(t);
      if (!s.unlocks.owned.includes(t)) s.unlocks.owned.push(t);
    }
  }
  return s;
}
