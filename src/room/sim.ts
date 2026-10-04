// Kinlings wandering the home room. Positions are never saved: the room is
// rebuilt from the save whenever it is shown. Given the same state, save,
// time step and random source, stepRoom always produces the same result.
import type { FurnitureId } from '../game/chatter';
import { COOL, WARM } from '../game/feelings';
import { feelingOf, kinlingById } from '../game/state';
import type { Kinling, SaveData } from '../game/types';
import { findPath } from '../minigame/pathfind';
import { cellCenter, cellIndex, cellOf, COLS, FURNITURE, ROOM, ROWS, walkable, WALKABLE_CELLS } from './layout';

export type RoomMode = 'wander' | 'walkTo' | 'talking' | 'resting';

export interface RoomKinling {
  id: string;
  /** Position in tiles; (0.5, 0.5) is the middle of the top-left tile. */
  x: number;
  y: number;
  mode: RoomMode;
  /** Cells still to walk through. */
  path: number[];
  /** Seconds left to linger (wander) or nap (resting). */
  wait: number;
  facing: 1 | -1;
  goal: FurnitureId | 'floor' | 'friend' | null;
}

export interface RoomState {
  /** Simulated seconds. */
  t: number;
  /** In save order, so stepping is deterministic. */
  kinlings: RoomKinling[];
}

/** Walking speed in tiles per second. */
export const SPEED = 1.6;
/** Keep this far from kinlings you feel cool about. */
export const AVOID_RADIUS = 3;

function pickCell(cells: readonly number[], rand: () => number): number {
  return cells[Math.floor(rand() * cells.length) % cells.length]!;
}

function placed(id: string, cell: number, rand: () => number): RoomKinling {
  const p = cellCenter(cell);
  return { id, x: p.x, y: p.y, mode: 'wander', path: [], wait: 0.5 + rand() * 2, facing: rand() < 0.5 ? 1 : -1, goal: null };
}

export function createRoom(save: SaveData, rand: () => number): RoomState {
  return syncRoom({ t: 0, kinlings: [] }, save, rand);
}

/** Add newly hatched kinlings on free tiles and drop ones no longer in the save. */
export function syncRoom(state: RoomState, save: SaveData, rand: () => number): RoomState {
  const ids = save.kinlings.map((k) => k.id);
  if (ids.length === state.kinlings.length && ids.every((id, i) => state.kinlings[i]!.id === id)) return state;
  const byId = new Map(state.kinlings.map((k) => [k.id, k]));
  const kinlings: RoomKinling[] = [];
  for (const id of ids) {
    const existing = byId.get(id);
    if (existing) {
      kinlings.push(existing);
      continue;
    }
    const taken = new Set(kinlings.map((k) => cellOf(k.x, k.y)));
    const free = WALKABLE_CELLS.filter((c) => !taken.has(c));
    kinlings.push(placed(id, pickCell(free.length ? free : WALKABLE_CELLS, rand), rand));
  }
  return { ...state, kinlings };
}

function neighbourCells(cell: number): number[] {
  const c = cell % COLS;
  const r = Math.floor(cell / COLS);
  const out: number[] = [];
  for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nc = c + dc;
    const nr = r + dr;
    if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
    const i = cellIndex(nc, nr);
    if (walkable(i)) out.push(i);
  }
  return out;
}

interface Candidate {
  goal: RoomKinling['goal'];
  cell: number;
  weight: number;
}

/** Where a kinling heads next: things it needs, places it likes, friends; never toward kinlings it avoids. */
export function chooseTarget(state: RoomState, save: SaveData, me: RoomKinling, kin: Kinling, rand: () => number): Candidate | null {
  const n = kin.needs;
  const prefs = kin.preferences;
  const candidates: Candidate[] = [];
  for (const f of FURNITURE) {
    let weight = 1;
    if (f.id === 'bowl' && n.hunger < 40) weight += 6;
    if (f.id === 'bed' && n.energy < 40) weight += 6;
    if (f.id === 'tub') weight += (n.cleanliness < 40 ? 3 : 0) + (prefs.favoritePlace === 'pond' ? 1.5 : 0);
    if (f.id === 'plant' && prefs.favoritePlace === 'garden') weight += 1.5;
    if (f.id === 'shelf' && kin.personality.curiosity >= 62) weight += 1;
    candidates.push({ goal: f.id, cell: cellIndex(f.spot.c, f.spot.r), weight });
  }
  for (let i = 0; i < 3; i++) candidates.push({ goal: 'floor', cell: pickCell(WALKABLE_CELLS, rand), weight: 1 });

  const avoid: { x: number; y: number }[] = [];
  for (const other of state.kinlings) {
    if (other.id === me.id) continue;
    const warmth = feelingOf(save, me.id, other.id)?.warmth;
    if (warmth === undefined) continue;
    if (warmth <= COOL) avoid.push({ x: other.x, y: other.y });
    else if (warmth >= WARM) {
      const near = neighbourCells(cellOf(other.x, other.y));
      if (near.length) candidates.push({ goal: 'friend', cell: pickCell(near, rand), weight: 2 + (warmth - WARM) / 20 });
    }
  }

  const here = cellOf(me.x, me.y);
  const claimed = new Set(state.kinlings.filter((k) => k.id !== me.id && k.path.length).map((k) => k.path.at(-1)!));
  const usable = candidates.filter((cand) => {
    if (cand.cell === here || claimed.has(cand.cell)) return false;
    const p = cellCenter(cand.cell);
    return avoid.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= AVOID_RADIUS);
  });
  const total = usable.reduce((s, cand) => s + cand.weight, 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const cand of usable) {
    r -= cand.weight;
    if (r < 0) return cand;
  }
  return usable.at(-1)!;
}

function arrive(me: RoomKinling, kin: Kinling | null, rand: () => number): void {
  me.path = [];
  if (me.goal === 'bed' && kin && kin.needs.energy < 40) {
    me.mode = 'resting';
    me.wait = 8 + rand() * 6;
  } else {
    me.mode = 'wander';
    me.wait = 1.5 + rand() * 3;
  }
}

/** Advance the room by dt seconds. */
export function stepRoom(state: RoomState, save: SaveData, dt: number, rand: () => number): RoomState {
  const synced = syncRoom(state, save, rand);
  const next: RoomState = { t: synced.t + dt, kinlings: synced.kinlings.map((k) => ({ ...k, path: [...k.path] })) };
  for (const me of next.kinlings) {
    const kin = kinlingById(save, me.id);
    if (!kin || me.mode === 'talking') continue;
    if (me.mode === 'resting' || me.mode === 'wander') {
      me.wait -= dt;
      if (me.wait > 0) continue;
      if (me.mode === 'resting') {
        me.mode = 'wander';
        me.wait = 0.5 + rand();
        continue;
      }
      const target = chooseTarget(next, save, me, kin, rand);
      const path = target ? findPath(ROOM.grid, COLS, cellOf(me.x, me.y), target.cell, ROOM.links) : [];
      if (!target || path.length < 2) {
        me.wait = 1;
        continue;
      }
      me.mode = 'walkTo';
      me.goal = target.goal;
      me.path = path.slice(1);
      continue;
    }
    // walkTo: follow the path, a little at a time.
    let budget = SPEED * dt;
    while (budget > 0 && me.path.length) {
      const p = cellCenter(me.path[0]!);
      const dx = p.x - me.x;
      const dy = p.y - me.y;
      const d = Math.hypot(dx, dy);
      if (Math.abs(dx) > 0.01) me.facing = dx > 0 ? 1 : -1;
      if (d <= budget) {
        me.x = p.x;
        me.y = p.y;
        me.path.shift();
        budget -= d;
      } else {
        me.x += (dx / d) * budget;
        me.y += (dy / d) * budget;
        budget = 0;
      }
    }
    if (!me.path.length) arrive(me, kin, rand);
  }
  return next;
}

/** Put two kinlings side by side and let them linger (used by the e2e dev hook). */
export function placeTogether(state: RoomState, aId: string, bId: string): RoomState {
  const a = cellIndex(5, 4);
  const b = cellIndex(6, 4);
  return {
    ...state,
    kinlings: state.kinlings.map((k) => {
      if (k.id !== aId && k.id !== bId) return k;
      const p = cellCenter(k.id === aId ? a : b);
      return { ...k, x: p.x, y: p.y, mode: 'wander', path: [], wait: 5, goal: null, facing: k.id === aId ? 1 : -1 };
    }),
  };
}
