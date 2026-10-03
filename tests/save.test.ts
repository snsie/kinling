import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { exportSave, parseImport, MAX_IMPORT_BYTES } from '../src/persistence/exportImport';
import { migrateSave, NewerSaveError } from '../src/persistence/migrations';
import { validateSave } from '../src/persistence/schema';
import { SaveConflictError, SaveStorage } from '../src/persistence/db';
import { createSave } from '../src/game/state';
import { resolveAdventure } from '../src/game/adventure';
import { hatchedSave, kin, legacyV3, T0 } from './helpers';

describe('save validation', () => {
  it('accepts fresh and played saves', () => {
    expect(validateSave(createSave(T0)).ok).toBe(true);
    const fresh = hatchedSave();
    const played = resolveAdventure(fresh, kin(fresh).id, {
      runId: 'r', route: 'garden-path', seed: 1, collected: { leaf: 2 }, golden: true, hits: 0, completed: true, tutorial: false, durationMs: 1,
    }, T0).save;
    expect(validateSave(played).ok).toBe(true);
  });

  it('rejects out-of-range and unknown values', () => {
    const s = hatchedSave();
    const bad1 = structuredClone(s);
    kin(bad1).needs.hunger = 500;
    expect(validateSave(bad1).ok).toBe(false);
    const bad2 = structuredClone(s) as unknown as { unlocks: { traits: string[] } };
    bad2.unlocks.traits.push('feature.jetpack');
    expect(validateSave(bad2).ok).toBe(false);
    const bad3 = structuredClone(s);
    bad3.inventory.keepsakes.push({ id: 'moonpetal', foundAt: 1, location: 'garden' }, { id: 'moonpetal', foundAt: 2, location: 'garden' });
    expect(validateSave(bad3).ok).toBe(false);
  });

  it('rejects a creature wearing locked features', () => {
    const s = hatchedSave('woodland');
    kin(s).appearance.wings = true;
    const r = validateSave(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/never unlocked/);
  });
});

describe('export and import', () => {
  it('round-trips an exported save', () => {
    const s = hatchedSave();
    const r = parseImport(exportSave(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.save).toEqual(s);
  });

  it('rejects malformed files with readable errors', () => {
    expect(parseImport('')).toMatchObject({ ok: false });
    expect(parseImport('{not json')).toMatchObject({ ok: false, error: expect.stringMatching(/JSON/) });
    expect(parseImport('[1,2,3]')).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ format: 'other-game', save: {} }))).toMatchObject({ ok: false });
    expect(parseImport(JSON.stringify({ format: 'kinling-save', save: { schemaVersion: 2 } }))).toMatchObject({ ok: false });
    expect(parseImport('x'.repeat(MAX_IMPORT_BYTES + 10))).toMatchObject({ ok: false, error: expect.stringMatching(/too large/) });
  });

  it('rejects saves from a newer version', () => {
    const s = { ...hatchedSave(), schemaVersion: 99 };
    expect(() => migrateSave(s)).toThrow(NewerSaveError);
    expect(parseImport(JSON.stringify(s))).toMatchObject({ ok: false, error: expect.stringMatching(/newer version/) });
  });

  it('migrates a version 1 save', () => {
    const v3 = legacyV3(hatchedSave());
    const v1: Record<string, unknown> = structuredClone(v3);
    v1.schemaVersion = 1;
    v1.playerName = 'Sam';
    delete v1.player;
    delete v1.diaryCursor;
    delete v1.claimedRuns;
    v1.memories = (v3.memories as Record<string, unknown>[]).map(({ pinned: _p, ...m }) => m);
    v1.settings = { ...(v3.settings as object), ai: { enabled: false, modelId: 'Qwen3-1.7B-q4f16_1-MLC' } };
    const r = parseImport(JSON.stringify(v1));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.migratedFrom).toBe(1);
      expect(r.save.player).toEqual({ name: 'Sam', facts: [] });
      expect(kin(r.save).memories.every((m) => m.pinned === false)).toBe(true);
      expect(r.save.claimedRuns).toEqual([]);
    }
  });
});

describe('IndexedDB storage', () => {
  it('saves, loads and detects conflicting writes', async () => {
    const store = new SaveStorage(`test-${Math.random()}`);
    await store.open();
    expect(await store.load()).toBeNull();
    const s = hatchedSave();
    const rev1 = await store.write(s, null);
    expect(rev1).toBe(1);
    const loaded = await store.load();
    expect(loaded && kin(loaded.save).name).toBe('Mochi');
    // A second tab that still thinks there is no save must not overwrite.
    await expect(store.write(s, null)).rejects.toBeInstanceOf(SaveConflictError);
    const rev2 = await store.write({ ...s, revision: rev1 }, rev1);
    expect(rev2).toBe(2);
    await store.destroy();
  });

  it('falls back to the backup when the main record is corrupted', async () => {
    const store = new SaveStorage(`test-${Math.random()}`);
    await store.open();
    const s = hatchedSave();
    await store.write(s, null);
    await store.write(s, 1);
    // Corrupt the main record directly.
    const db = (store as unknown as { db: { saves: { put(v: unknown): Promise<unknown> } } }).db;
    await db.saves.put({ key: 'main', revision: 3, updatedAt: 0, data: { schemaVersion: 2, junk: true } });
    const loaded = await store.load();
    expect(loaded?.fromBackup).toBe(true);
    expect(loaded && kin(loaded.save).name).toBe('Mochi');
    await store.destroy();
  });
});
