import { describe, expect, it } from 'vitest';
import { resolveAdventure, sanitizeResult, scoreRun, tierFor } from '../src/game/adventure';
import { applyEvolution } from '../src/game/evolution';
import { refreshProgress } from '../src/game/progress';
import type { MinigameResult } from '../src/minigame/engine';
import { hatchedSave, kin, T0 } from './helpers';

function result(over: Partial<MinigameResult> = {}): MinigameResult {
  return {
    runId: 'run_1',
    route: 'garden-path',
    seed: 42,
    collected: { leaf: 3, petal: 2, dewberry: 1 },
    golden: false,
    hits: 1,
    completed: true,
    tutorial: false,
    durationMs: 45000,
    ...over,
  };
}

describe('adventure rewards', () => {
  it('adds gathered items to the inventory and updates stats', () => {
    const s = hatchedSave();
    const leaves = s.inventory.materials.leaf;
    const out = resolveAdventure(s, kin(s).id, result(), T0);
    expect(out.feedback.ok).toBe(true);
    expect(out.save.inventory.materials.leaf).toBeGreaterThanOrEqual(leaves + 3);
    expect(out.save.inventory.foods.dewberry).toBe(s.inventory.foods.dewberry + 1);
    expect(out.save.stats.gardenTrips).toBe(s.stats.gardenTrips + 1);
    expect(kin(out.save).affinities.woodland).toBeGreaterThan(kin(s).affinities.woodland);
    expect(kin(out.save).needs.energy).toBeLessThan(kin(s).needs.energy);
  });

  it('can only be claimed once per run', () => {
    const s = hatchedSave();
    const once = resolveAdventure(s, kin(s).id, result(), T0).save;
    const twice = resolveAdventure(once, kin(once).id, result(), T0 + 1);
    expect(twice.feedback.ok).toBe(false);
    expect(twice.save).toBe(once);
  });

  it('rejects impossible or tampered results', () => {
    const s = hatchedSave();
    expect(sanitizeResult(result({ collected: { shell: 3 } }))).toBeNull(); // shells don't grow in the garden
    expect(sanitizeResult(result({ collected: { leaf: 500 } }))).toBeNull();
    expect(sanitizeResult(result({ collected: { leaf: -2 } }))).toBeNull();
    expect(sanitizeResult(result({ collected: { leaf: 1.5 } }))).toBeNull();
    expect(sanitizeResult({ ...result(), route: 'moon-base' as never })).toBeNull();
    expect(resolveAdventure(s, kin(s).id, result({ collected: { leaf: 500 } }), T0).feedback.ok).toBe(false);
  });

  it('refuses the deep route without a paddle tail', () => {
    const s = hatchedSave('aquatic');
    const out = resolveAdventure(s, kin(s).id, result({ route: 'pond-deep', collected: { shell: 2 } }), T0);
    expect(out.feedback.ok).toBe(false);
  });

  it('grants each keepsake only once and gives stardust when a route is exhausted', () => {
    let s = hatchedSave();
    const found: string[] = [];
    for (let i = 0; i < 5; i++) {
      const out = resolveAdventure(s, kin(s).id, result({ runId: `run_${i}`, golden: true, collected: { leaf: 1 } }), T0 + i);
      s = out.save;
      found.push(...(out.rewards?.keepsakes ?? []));
    }
    expect(new Set(found).size).toBe(found.length);
    expect(found).toEqual(expect.arrayContaining(['ladybug-button', 'moonpetal', 'four-leaf-clover']));
    expect(s.inventory.materials.stardust).toBeGreaterThan(0);
  });

  it('awards the tutorial acorn exactly once', () => {
    let s = hatchedSave();
    s = resolveAdventure(s, kin(s).id, result({ runId: 'tut', tutorial: true, collected: { leaf: 1 } }), T0).save;
    expect(s.inventory.keepsakes.map((k) => k.id)).toEqual(['first-acorn']);
    s = resolveAdventure(s, kin(s).id, result({ runId: 'tut2', tutorial: true, collected: { leaf: 1 } }), T0).save;
    expect(s.inventory.keepsakes.filter((k) => k.id === 'first-acorn')).toHaveLength(1);
  });

  it('leaving early keeps items but forfeits the tier bonus', () => {
    const s = hatchedSave();
    const big = { leaf: 8, petal: 6, pebble: 4 };
    const done = resolveAdventure(s, kin(s).id, result({ runId: 'a', collected: big, hits: 0 }), T0);
    const quit = resolveAdventure(s, kin(s).id, result({ runId: 'b', collected: big, hits: 0, completed: false }), T0);
    expect(done.rewards!.tier).toBe('gold');
    expect(quit.rewards!.tier).toBe('none');
    expect(quit.save.inventory.materials.leaf).toBe(s.inventory.materials.leaf + 8);
  });

  it('scores and tiers are deterministic', () => {
    expect(scoreRun({ leaf: 3, dewdrop: 2 }, 1, true)).toBe(3 + 4 + 3 - 1);
    expect(tierFor(3)).toBe('none');
    expect(tierFor(4)).toBe('bronze');
    expect(tierFor(9)).toBe('silver');
    expect(tierFor(15)).toBe('gold');
  });

  it('a non-aquatic creature can unlock the paddle tail through normal pond play', () => {
    let s = hatchedSave('woodland');
    let i = 0;
    while (!s.unlocks.traits.includes('tail.paddle') && i < 10) {
      kin(s).needs.energy = 100;
      s = resolveAdventure(s, kin(s).id, result({ runId: `p${i}`, route: 'pond-shallows', collected: { shell: 3, reed: 3, dewdrop: 1, pondPlum: 1 }, hits: 1 }), T0 + i).save;
      i++;
    }
    expect(s.unlocks.traits).toContain('tail.paddle');
    expect(i).toBeLessThanOrEqual(4);
    const out = applyEvolution(s, kin(s).id, { changes: [{ trait: 'tail.paddle' }] }, T0 + 100);
    expect(out.feedback.ok).toBe(true);
    refreshProgress(out.save, kin(out.save), T0, 0);
  });
});
