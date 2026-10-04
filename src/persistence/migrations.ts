// Save migrations. Each step upgrades a save by exactly one schema version.
//
// v1 was the pre-release layout: the player's name lived at `playerName`,
// memories had no `pinned` flag, AI settings had no download consent, and
// there was no diary cursor or adventure claim list.
// v2 had no conversation summary.
// v3 had a single `creature`, with its memories, chat, appearance history and
// daily counters at the top level of the save.
import { playerFeelingFromBond } from '../game/state';
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
  2: (v2) => ({ ...v2, chatSummary: null, schemaVersion: 3 }),
  3: (v3) => {
    const { creature, memories, chat, chatSummary, appearanceHistory, daily, ...out } = v3;
    const c = creature && typeof creature === 'object' ? (creature as AnyRecord) : null;
    const d = (daily ?? {}) as AnyRecord;
    const kinlings: AnyRecord[] = [];
    const feelings: AnyRecord[] = [];
    if (c) {
      kinlings.push({
        ...c,
        baseline: { ...(c.personality as AnyRecord) },
        memories: Array.isArray(memories) ? memories.map((m) => ({ ...(m as AnyRecord), withIds: [], private: false })) : [],
        chat: Array.isArray(chat) ? chat : [],
        chatSummary: chatSummary ?? null,
        appearanceHistory: Array.isArray(appearanceHistory) ? appearanceHistory : [],
        careLog: d.careLog ?? { feed: [], groom: [], rest: [], play: [] },
        socialDaily: {
          day: d.day,
          personalityDelta: d.personalityDelta,
          chatBond: d.chatBond ?? 0,
          socialPersonality: { curiosity: 0, confidence: 0, playfulness: 0 },
          feelingDelta: {},
        },
      });
      feelings.push({ ...playerFeelingFromBond(String(c.id), typeof c.bond === 'number' ? c.bond : 0) });
    }
    const player = (v3.player ?? {}) as AnyRecord;
    const facts = Array.isArray(player.facts) ? player.facts.map((f) => ({ ...(f as AnyRecord), shareable: false })) : [];
    const settings = (v3.settings ?? {}) as AnyRecord;
    return {
      ...out,
      kinlings,
      activeKinlingId: c ? c.id : null,
      feelings,
      conversations: [],
      player: { ...player, facts },
      settings: { ...settings, ai: { ...(settings.ai as AnyRecord), memorySearch: false } },
      schemaVersion: 4,
    };
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
