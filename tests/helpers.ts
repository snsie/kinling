import { chooseEgg, hatch, nameCreature } from '../src/game/onboarding';
import { activeKinling, createSave } from '../src/game/state';
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
    const { baseline: _b, memories, chat, chatSummary, appearanceHistory, careLog, socialDaily, ...c } = k;
    creature = c;
    extra = { memories: memories.map(({ withIds: _w, private: _p, ...m }) => m), chat, chatSummary, appearanceHistory };
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
