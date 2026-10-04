import { describe, expect, it } from 'vitest';
import type { SaveData } from '../src/game/types';
import { createRng } from '../src/game/util';
import { beginTalk, cooledDown, detectEncounter, ENCOUNTER_SECONDS, KINLING_COOLDOWN_MS, newEncounters, PAIR_COOLDOWN_MS } from '../src/room/encounters';
import { cellCenter, cellIndex, cellOf, walkable } from '../src/room/layout';
import { AVOID_RADIUS, chooseTarget, createRoom, stepRoom, type RoomState } from '../src/room/sim';
import { family, T0 } from './helpers';

const MIN = 60_000;

function at(room: RoomState, id: string, c: number, r: number, mode: 'wander' | 'walkTo' | 'talking' | 'resting' = 'wander'): RoomState {
  const p = cellCenter(cellIndex(c, r));
  return { ...room, kinlings: room.kinlings.map((k) => (k.id === id ? { ...k, x: p.x, y: p.y, mode, path: [], wait: 99 } : k)) };
}

describe('room simulation', () => {
  it('never walks into furniture or walls, and is deterministic', () => {
    for (const seed of [1, 2, 3]) {
      const s = family();
      s.kinlings[0]!.needs.energy = 20;
      s.kinlings[1]!.needs.hunger = 10;
      const run = () => {
        const rand = createRng(seed);
        let room = createRoom(s, rand);
        const trail: string[] = [];
        for (let i = 0; i < 3000; i++) {
          room = stepRoom(room, s, 0.1, rand);
          for (const k of room.kinlings) expect(walkable(cellOf(k.x, k.y)), `${k.id} at ${k.x},${k.y}`).toBe(true);
          if (i % 100 === 0) trail.push(room.kinlings.map((k) => `${k.x.toFixed(3)},${k.y.toFixed(3)},${k.mode}`).join(';'));
        }
        return trail;
      };
      const a = run();
      expect(run()).toEqual(a);
      expect(new Set(a).size).toBeGreaterThan(10);
    }
  });

  it('heads for the bowl when hungry and naps on the bed when sleepy', () => {
    const s = family(1);
    const k = s.kinlings[0]!;
    k.needs.hunger = 5;
    const rand = createRng(9);
    const room = createRoom(s, rand);
    const goals = Array.from({ length: 300 }, () => chooseTarget(room, s, room.kinlings[0]!, k, rand)?.goal);
    expect(goals.filter((g) => g === 'bowl').length).toBeGreaterThan(goals.filter((g) => g === 'bed').length * 3);
  });

  it('keeps away from kinlings it feels cool about', () => {
    const s = family(2);
    const [a, b] = s.kinlings;
    s.feelings.find((f) => f.from === a!.id && f.to === b!.id)!.warmth = -15;
    const rand = createRng(4);
    let room = createRoom(s, rand);
    room = at(room, b!.id, 6, 4);
    const other = room.kinlings[1]!;
    for (let i = 0; i < 300; i++) {
      const t = chooseTarget(room, s, room.kinlings[0]!, s.kinlings[0]!, rand);
      if (!t) continue;
      const p = cellCenter(t.cell);
      expect(Math.hypot(p.x - other.x, p.y - other.y)).toBeGreaterThanOrEqual(AVOID_RADIUS);
    }
  });

  it('walks toward kinlings it likes', () => {
    const s = family(2);
    const [a, b] = s.kinlings;
    s.feelings.find((f) => f.from === a!.id && f.to === b!.id)!.warmth = 90;
    const rand = createRng(5);
    const room = createRoom(s, rand);
    const goals = Array.from({ length: 300 }, () => chooseTarget(room, s, room.kinlings[0]!, s.kinlings[0]!, rand)?.goal);
    expect(goals.filter((g) => g === 'friend').length).toBeGreaterThan(60);
  });

  it('kinlings in a conversation stay put', () => {
    const s = family(2);
    const rand = createRng(6);
    let room = createRoom(s, rand);
    room = beginTalk(room, s.kinlings[0]!.id, s.kinlings[1]!.id);
    const before = room.kinlings.map((k) => [k.x, k.y]);
    for (let i = 0; i < 50; i++) room = stepRoom(room, s, 0.1, rand);
    expect(room.kinlings.map((k) => [k.x, k.y])).toEqual(before);
  });
});

describe('encounters', () => {
  function close(s: SaveData, dx: number) {
    let room = createRoom(s, createRng(1));
    const [a, b] = s.kinlings;
    room = at(room, a!.id, 4, 4);
    const p = cellCenter(cellIndex(4, 4));
    room = { ...room, kinlings: room.kinlings.map((k) => (k.id === b!.id ? { ...k, x: p.x + dx, y: p.y, mode: 'wander', path: [], wait: 99 } : k)) };
    // Keep anyone else far away.
    for (const [i, k] of s.kinlings.slice(2).entries()) room = at(room, k.id, 10 - i * 3, 6);
    return room;
  }

  function run(room: RoomState, s: SaveData, seconds: number, now = T0) {
    let enc = newEncounters();
    let start: [string, string] | null = null;
    for (let t = 0; t < seconds && !start; t += 0.1) {
      const r = detectEncounter(room, enc, s, 0.1, now);
      enc = r.enc;
      start = r.start;
    }
    return { start, enc };
  }

  it('starts only when two idle kinlings stay within 1.5 tiles for 1.5 s', () => {
    const s = family(2);
    expect(run(close(s, 1.4), s, ENCOUNTER_SECONDS + 0.2).start).not.toBeNull();
    expect(run(close(s, 1.4), s, ENCOUNTER_SECONDS - 0.3).start).toBeNull();
    expect(run(close(s, 1.6), s, 5).start).toBeNull();
    const resting = at(close(s, 1), s.kinlings[1]!.id, 5, 4, 'resting');
    expect(run(resting, s, 5).start).toBeNull();
  });

  it('respects the pair and per-kinling cooldowns', () => {
    const s = family(3);
    const [a, b, c] = s.kinlings.map((k) => k.id) as [string, string, string];
    const log = (x: string, y: string, ago: number) => ({ id: `c${ago}`, at: T0 - ago, a: x, b: y, topic: 'snacks', lines: [], source: 'authored' as const });
    s.conversations = [log(a, b, 5 * MIN)];
    expect(cooledDown(s, a, b, T0)).toBe(false);
    s.conversations = [log(a, b, PAIR_COOLDOWN_MS + MIN)];
    expect(cooledDown(s, a, b, T0)).toBe(true);
    s.conversations = [log(a, c, 2 * MIN)];
    expect(cooledDown(s, a, b, T0)).toBe(false);
    s.conversations = [log(a, c, KINLING_COOLDOWN_MS + MIN)];
    expect(cooledDown(s, a, b, T0)).toBe(true);
    s.conversations = [log(a, b, 5 * MIN)];
    expect(run(close(s, 1), s, 5).start).toBeNull();
  });

  it('runs one conversation at a time', () => {
    const s = family(4);
    const [a, b, c, d] = s.kinlings.map((k) => k.id) as [string, string, string, string];
    let room = createRoom(s, createRng(2));
    room = at(at(at(at(room, a, 3, 3), b, 4, 3), c, 3, 5), d, 4, 5);
    const { start, enc } = run(room, s, 3);
    expect(start).not.toBeNull();
    const again = detectEncounter(room, enc, s, 5, T0);
    expect(again.start).toBeNull();
  });
});
