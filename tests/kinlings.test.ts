import { describe, expect, it } from 'vitest';
import { EGGS } from '../src/game/catalog';
import { performCare } from '../src/game/care';
import { addChatMessage } from '../src/game/social';
import { activeKinling, eggDefaults, hatchKinling, kinlingById, playerFeelingFromBond } from '../src/game/state';
import { starterTraitsFor } from '../src/game/traits';
import type { EggType, SaveData } from '../src/game/types';
import { PERSONALITY_KEYS, PLAYER_ID } from '../src/game/types';
import { exportSave, parseImport } from '../src/persistence/exportImport';
import { migrateSave } from '../src/persistence/migrations';
import { validateSave } from '../src/persistence/schema';
import { hatchedSave, kin, legacyV3, T0 } from './helpers';

/** Hatch and name another kinling into the save (eggs arriving in play come later). */
function addKinling(save: SaveData, egg: EggType, name: string, seed: number): SaveData {
  const s = structuredClone(save);
  const k = hatchKinling(s, egg, eggDefaults(egg), T0, { seed });
  k.name = name;
  s.kinlings.push(k);
  s.feelings.push(playerFeelingFromBond(k.id, 0));
  for (const t of starterTraitsFor(egg)) {
    if (!s.unlocks.traits.includes(t)) s.unlocks.traits.push(t);
    if (!s.unlocks.owned.includes(t)) s.unlocks.owned.push(t);
  }
  return s;
}

function fourKinlings(): SaveData {
  let s = hatchedSave('woodland');
  s = addKinling(s, 'woodland', 'Pip', 1);
  s = addKinling(s, 'aquatic', 'Fig', 2);
  s = addKinling(s, 'celestial', 'Luma', 3);
  return s;
}

describe('hatching siblings', () => {
  it('the first kinling is exactly its egg, with its baseline recorded', () => {
    const k = kin(hatchedSave('aquatic'));
    expect(k.personality).toEqual(EGGS.aquatic.personality);
    expect(k.baseline).toEqual(k.personality);
    expect(k.preferences.favoriteFood).toBe(EGGS.aquatic.preferences.favoriteFood);
  });

  it('siblings from the same egg differ within ±8 and are reproducible from a seed', () => {
    const s = hatchedSave('woodland');
    const traits = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const k = hatchKinling(s, 'woodland', eggDefaults('woodland'), T0, { seed });
      for (const key of PERSONALITY_KEYS) expect(Math.abs(k.personality[key] - EGGS.woodland.personality[key])).toBeLessThanOrEqual(8);
      expect(k.baseline).toEqual(k.personality);
      expect(k.preferences.favoriteFood).not.toBe(k.preferences.dislikedFood);
      expect(EGGS.woodland.preferencePool.favoriteFood).toContain(k.preferences.favoriteFood);
      traits.add(JSON.stringify([k.personality, k.preferences.favoriteFood]));
    }
    expect(traits.size).toBeGreaterThan(10);
    const again = hatchKinling(s, 'woodland', eggDefaults('woodland'), T0, { seed: 7 });
    expect(again.personality).toEqual(hatchKinling(s, 'woodland', eggDefaults('woodland'), T0, { seed: 7 }).personality);
  });
});

describe('per-kinling state', () => {
  it('care, chat and memories land on the chosen kinling only', () => {
    let s = fourKinlings();
    const [mochi, pip] = s.kinlings;
    s.kinlings[1]!.needs.hunger = 30;
    s = performCare(s, pip!.id, 'feed', T0, { food: 'dewberry' }).save;
    s = addChatMessage(s, pip!.id, 'player', 'hello Pip', 'player', T0);
    expect(kinlingById(s, pip!.id)!.needs.hunger).toBeGreaterThan(30);
    expect(kinlingById(s, pip!.id)!.chat).toHaveLength(1);
    expect(kinlingById(s, mochi!.id)!.chat).toHaveLength(0);
    expect(kinlingById(s, mochi!.id)!.careLog.feed).toHaveLength(0);
    expect(activeKinling(s)!.id).toBe(mochi!.id);
    expect(validateSave(s).ok).toBe(true);
  });

  it('starts every kinling with feelings toward the player', () => {
    const s = fourKinlings();
    for (const k of s.kinlings) expect(s.feelings.find((f) => f.from === k.id && f.to === PLAYER_ID)).toBeTruthy();
  });
});

describe('save format v4', () => {
  it('migrates a v3 save into the first kinling', () => {
    let played = hatchedSave();
    played = performCare(played, kin(played).id, 'feed', T0, { food: 'dewberry' }).save;
    played = addChatMessage(played, kin(played).id, 'player', 'hi', 'player', T0);
    kin(played).bond = 120;
    played.player.facts.push({ id: 'fact_1', at: T0, text: 'I love rain', shareable: true });
    const v3 = legacyV3(played);
    const { save, migratedFrom } = migrateSave(v3);
    expect(migratedFrom).toBe(3);
    expect(save.kinlings).toHaveLength(1);
    const k = save.kinlings[0]!;
    expect(save.activeKinlingId).toBe(k.id);
    expect(k.baseline).toEqual(k.personality);
    expect(k.memories.length).toBe((v3.memories as unknown[]).length);
    expect(k.memories.every((m) => m.private === false && m.withIds.length === 0)).toBe(true);
    expect(k.chat.map((m) => m.text)).toEqual(['hi']);
    expect(k.careLog.feed).toEqual([T0]);
    expect(save.feelings).toEqual([{ from: k.id, to: PLAYER_ID, warmth: 50, trust: 50, familiarity: 60 }]);
    expect(save.conversations).toEqual([]);
    expect(save.player.facts.every((f) => f.shareable === false)).toBe(true);
    expect(save.settings.ai.memorySearch).toBe(false);
  });

  it('caps migrated warmth toward the player at 60', () => {
    const s = hatchedSave();
    kin(s).bond = 900;
    expect(migrateSave(legacyV3(s)).save.feelings[0]!.warmth).toBe(60);
  });

  it('migrates a v3 save that is still in onboarding', () => {
    const v3 = legacyV3(hatchedSave());
    v3.creature = null;
    (v3.onboarding as { step: string }).step = 'egg';
    const { save } = migrateSave(v3);
    expect(save.kinlings).toEqual([]);
    expect(save.activeKinlingId).toBeNull();
    expect(save.feelings).toEqual([]);
  });

  it('round-trips four kinlings through export and import', () => {
    const s = fourKinlings();
    const r = parseImport(exportSave(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.save).toEqual(s);
    expect(exportSave(s).length).toBeLessThan(2 * 1024 * 1024);
  });

  it('rejects broken kinling references', () => {
    const base = fourKinlings();
    const [a, b] = base.kinlings;
    const cases: [string, (s: SaveData) => void][] = [
      ['feeling about a missing kinling', (s) => s.feelings.push({ from: a!.id, to: 'kin_ghost', warmth: 0, trust: 0, familiarity: 0 })],
      ['feeling from a missing kinling', (s) => s.feelings.push({ from: 'kin_ghost', to: PLAYER_ID, warmth: 0, trust: 0, familiarity: 0 })],
      ['feeling about itself', (s) => s.feelings.push({ from: a!.id, to: a!.id, warmth: 0, trust: 0, familiarity: 0 })],
      ['duplicate feeling', (s) => s.feelings.push({ ...s.feelings[0]! })],
      ['negative warmth toward the player', (s) => (s.feelings[0]!.warmth = -5)],
      ['warmth out of range', (s) => s.feelings.push({ from: a!.id, to: b!.id, warmth: 140, trust: 0, familiarity: 0 })],
      ['missing active kinling', (s) => (s.activeKinlingId = 'kin_ghost')],
      ['duplicate kinling id', (s) => (s.kinlings[1]!.id = a!.id)],
      ['five kinlings', (s) => s.kinlings.push(structuredClone({ ...s.kinlings[0]!, id: 'kin_extra' }))],
    ];
    for (const [label, breakIt] of cases) {
      const s = structuredClone(base);
      breakIt(s);
      expect(validateSave(s).ok, label).toBe(false);
    }
  });
});
