// Creating lab sessions (fresh or copied from the game save) and keeping them
// in their own IndexedDB database. The game's database is only ever read.
import Dexie, { type Table } from 'dexie';
import { chooseEgg, hatch, nameCreature } from '../game/onboarding';
import { activeKinling, createSave, draft, kinlingById } from '../game/state';
import type { EggType, Personality, SaveData } from '../game/types';
import { uid } from '../game/util';
import { SaveStorage } from '../persistence/db';
import { migrateSave } from '../persistence/migrations';
import { SAVE_SCHEMA_VERSION } from '../game/types';
import { defaultConfig } from './templates';
import type { LabConfig, LabSession } from './types';

export interface FreshOptions {
  egg: EggType;
  name: string;
  player: string;
  personality: Personality;
}

function newSession(seed: SaveData, kinlingId: string, source: LabSession['source'], now: number, config?: LabConfig): LabSession {
  const k = kinlingById(seed, kinlingId)!;
  const stamp = new Date(now).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return {
    id: uid('lab'),
    name: `${k.name} · ${stamp}`,
    createdAt: now,
    updatedAt: now,
    source,
    save: draft(seed),
    seed,
    kinlingId,
    turns: [],
    calls: [],
    traitSteps: [],
    arcSteps: [],
    clockOffset: 0,
    config: config ? structuredClone(config) : defaultConfig(),
  };
}

/** Fill in fields that sessions saved by older versions of the lab lack. */
export function normalizeSession(s: LabSession): LabSession {
  const config = defaultConfig();
  // Sessions keep whole saves; bring older ones up to the current format.
  const upgrade = (save: SaveData) => (save.schemaVersion === SAVE_SCHEMA_VERSION ? save : migrateSave(save).save);
  const seed = upgrade(s.seed);
  // Trait history from before a trait existed starts it at the kinling's starting value.
  const start = seed.kinlings.find((k) => k.id === s.kinlingId)?.personality;
  const fill = (p: Personality) => (start ? { ...start, ...p } : p);
  return {
    ...s,
    save: upgrade(s.save),
    seed,
    traitSteps: s.traitSteps.map((t) => ({ ...t, before: fill(t.before), after: fill(t.after) })),
    arcSteps: s.arcSteps ?? [],
    clockOffset: s.clockOffset ?? 0,
    config: { chat: { ...config.chat, ...s.config?.chat }, evolve: { ...config.evolve, ...s.config?.evolve }, story: { ...config.story, ...s.config?.story } },
  };
}

/** A newly hatched kinling with chosen traits, set up the way onboarding leaves it. */
export function freshSession(opts: FreshOptions, now: number, config?: LabConfig): LabSession {
  let s = chooseEgg(createSave(now), opts.egg);
  s = hatch(s, now).save;
  s = nameCreature(s, opts.name || 'Mochi', opts.player || 'Sam', now).save;
  s.onboarding = { step: 'done', egg: null, draftAppearance: null };
  const k = activeKinling(s)!;
  k.personality = { ...opts.personality };
  k.baseline = { ...opts.personality };
  return newSession(s, k.id, 'fresh', now, config);
}

/** A copy of one of the game's kinlings. Changes stay in the lab. */
export function sessionFromGame(save: SaveData, kinlingId: string, now: number, config?: LabConfig): LabSession {
  const seed = draft(save);
  seed.activeKinlingId = kinlingId;
  return newSession(seed, kinlingId, 'game', now, config);
}

/** Start the same kinling over, keeping the current settings. */
export function restartSession(session: LabSession, now: number): LabSession {
  const next = newSession(session.seed, session.kinlingId, session.source, now, session.config);
  return next;
}

/** Read the game's save without taking its tab lock or writing anything. */
export async function readGameSave(): Promise<SaveData | null> {
  const storage = new SaveStorage();
  try {
    await storage.open();
    const result = await storage.load();
    return result?.save ?? null;
  } finally {
    storage.close();
  }
}

interface SessionRow {
  id: string;
  updatedAt: number;
  session: LabSession;
}

class LabDB extends Dexie {
  sessions!: Table<SessionRow, string>;
  constructor() {
    super('kinling-lab');
    this.version(1).stores({ sessions: 'id, updatedAt' });
  }
}

let db: LabDB | null = null;
function labDb(): LabDB {
  db ??= new LabDB();
  return db;
}

export interface SessionInfo {
  id: string;
  name: string;
  updatedAt: number;
  turns: number;
}

export async function listSessions(): Promise<SessionInfo[]> {
  const rows = await labDb().sessions.orderBy('updatedAt').reverse().toArray();
  return rows.map((r) => ({ id: r.id, name: r.session.name, updatedAt: r.updatedAt, turns: r.session.turns.length }));
}

export async function loadSession(id: string): Promise<LabSession | null> {
  const s = (await labDb().sessions.get(id))?.session;
  return s ? normalizeSession(s) : null;
}

export async function storeSession(session: LabSession): Promise<void> {
  await labDb().sessions.put({ id: session.id, updatedAt: session.updatedAt, session });
}

export async function deleteSession(id: string): Promise<void> {
  await labDb().sessions.delete(id);
}

/** A session from an exported JSON file, under a new id so it never replaces another. */
export function parseSessionFile(text: string): LabSession {
  const data = JSON.parse(text) as Partial<LabSession>;
  if (!data || typeof data !== 'object' || !data.save || !data.seed || !data.kinlingId || !Array.isArray(data.turns) || !Array.isArray(data.calls) || !Array.isArray(data.traitSteps)) {
    throw new Error('This file is not a Personality Lab session.');
  }
  return normalizeSession({ ...(data as LabSession), id: uid('lab') });
}
