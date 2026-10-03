// Save migrations. Each step upgrades a save by exactly one schema version.
//
// v1 was the pre-release layout: the player's name lived at `playerName`,
// memories had no `pinned` flag, AI settings had no download consent, and
// there was no diary cursor or adventure claim list.
import { SAVE_SCHEMA_VERSION } from '../game/types';
import type { SaveData } from '../game/types';
import { validateSave } from './schema';

type AnyRecord = Record<string, unknown>;

const MIGRATIONS: Record<number, (save: AnyRecord) => AnyRecord> = {
  1: (v1) => {
    const out: AnyRecord = { ...v1 };
    const playerName = typeof v1.playerName === 'string' ? v1.playerName : null;
    delete out.playerName;
    out.player = { name: playerName, facts: [] };
    out.memories = Array.isArray(v1.memories) ? v1.memories.map((m) => ({ ...(m as AnyRecord), pinned: false })) : [];
    const settings = (v1.settings ?? {}) as AnyRecord;
    const ai = (settings.ai ?? {}) as AnyRecord;
    out.settings = {
      ...settings,
      ai: { enabled: ai.enabled === true, modelId: ai.modelId ?? 'Qwen3-1.7B-q4f16_1-MLC', downloadConsent: ai.enabled === true },
    };
    const diary = Array.isArray(v1.diary) ? (v1.diary as AnyRecord[]) : [];
    out.diaryCursor = diary.reduce((max, d) => Math.max(max, typeof d.at === 'number' ? d.at : 0), 0);
    out.claimedRuns = [];
    out.schemaVersion = 2;
    return out;
  },
};

export class NewerSaveError extends Error {
  constructor(version: number) {
    super(`This save was made by a newer version of Kinling (format ${version}). Please update the game before loading it.`);
    this.name = 'NewerSaveError';
  }
}

export interface MigrationResult {
  save: SaveData;
  migratedFrom: number | null;
}

export function migrateSave(raw: unknown): MigrationResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Save data is not an object.');
  let data = raw as AnyRecord;
  const start = data.schemaVersion;
  if (typeof start !== 'number' || !Number.isInteger(start) || start < 1) throw new Error('Save data has no valid schema version.');
  if (start > SAVE_SCHEMA_VERSION) throw new NewerSaveError(start);
  let version = start;
  while (version < SAVE_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No migration from save format ${version}.`);
    data = step(data);
    version += 1;
  }
  const checked = validateSave(data);
  if (!checked.ok) throw new Error(checked.error);
  return { save: checked.save, migratedFrom: start === SAVE_SCHEMA_VERSION ? null : start };
}
