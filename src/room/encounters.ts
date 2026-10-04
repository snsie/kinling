// When two idle kinlings linger near each other, they start a conversation.
// Cooldowns are read from the saved conversation log, so they survive reloads.
import type { SaveData } from '../game/types';
import type { RoomKinling, RoomState } from './sim';

/** Tiles between two kinlings for them to notice each other. */
export const ENCOUNTER_RADIUS = 1.5;
/** Seconds they must stay that close. */
export const ENCOUNTER_SECONDS = 1.5;
/** The same two kinlings talk at most this often… */
export const PAIR_COOLDOWN_MS = 10 * 60 * 1000;
/** …and any kinling waits this long between conversations. */
export const KINLING_COOLDOWN_MS = 3 * 60 * 1000;

export interface EncounterState {
  /** Seconds each pair has been close, keyed by pairKey. */
  near: Record<string, number>;
  /** The conversation in progress; only one at a time. */
  active: { a: string; b: string } | null;
}

export function newEncounters(): EncounterState {
  return { near: {}, active: null };
}

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function idle(k: RoomKinling): boolean {
  return k.mode === 'wander' || k.mode === 'walkTo';
}

/** Both kinlings are free to talk, judging by the saved conversation log. */
export function cooledDown(save: SaveData, a: string, b: string, now: number): boolean {
  return save.conversations.every((c) => {
    const age = now - c.at;
    const pair = pairKey(c.a, c.b) === pairKey(a, b);
    if (pair && age < PAIR_COOLDOWN_MS) return false;
    const involved = c.a === a || c.b === a || c.a === b || c.b === b;
    return !(involved && age < KINLING_COOLDOWN_MS);
  });
}

/** The more outgoing kinling opens the conversation. */
function opener(save: SaveData, a: string, b: string): [string, string] {
  const score = (id: string) => {
    const k = save.kinlings.find((x) => x.id === id);
    return k ? k.personality.playfulness + k.personality.confidence : 0;
  };
  return score(b) > score(a) ? [b, a] : [a, b];
}

/** Advance the proximity timers. Returns the pair that should start talking, opener first. */
export function detectEncounter(room: RoomState, enc: EncounterState, save: SaveData, dt: number, now: number): { enc: EncounterState; start: [string, string] | null } {
  if (enc.active) return { enc: { ...enc, near: {} }, start: null };
  const near: Record<string, number> = {};
  let start: [string, string] | null = null;
  const ks = room.kinlings;
  for (let i = 0; i < ks.length; i++) {
    for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i]!;
      const b = ks[j]!;
      if (!idle(a) || !idle(b) || Math.hypot(a.x - b.x, a.y - b.y) > ENCOUNTER_RADIUS) continue;
      const key = pairKey(a.id, b.id);
      near[key] = (enc.near[key] ?? 0) + dt;
      if (!start && near[key]! >= ENCOUNTER_SECONDS && cooledDown(save, a.id, b.id, now)) start = opener(save, a.id, b.id);
    }
  }
  return { enc: { near, active: start ? { a: start[0], b: start[1] } : null }, start };
}

/** Both stop and face each other. */
export function beginTalk(room: RoomState, a: string, b: string): RoomState {
  const ka = room.kinlings.find((k) => k.id === a);
  const kb = room.kinlings.find((k) => k.id === b);
  if (!ka || !kb) return room;
  return {
    ...room,
    kinlings: room.kinlings.map((k) => {
      if (k.id !== a && k.id !== b) return k;
      const other = k.id === a ? kb : ka;
      return { ...k, mode: 'talking', path: [], wait: 0, facing: other.x >= k.x ? 1 : -1 };
    }),
  };
}

export function endTalk(room: RoomState, enc: EncounterState, rand: () => number): { room: RoomState; enc: EncounterState } {
  const active = enc.active;
  if (!active) return { room, enc };
  return {
    room: {
      ...room,
      kinlings: room.kinlings.map((k) => (k.id === active.a || k.id === active.b ? { ...k, mode: 'wander', wait: 1 + rand() * 2, goal: null } : k)),
    },
    enc: { near: {}, active: null },
  };
}
