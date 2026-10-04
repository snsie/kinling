// Deterministic collection minigame simulation. Given the same seed, inputs and
// time steps it always produces the same run, which keeps it testable.
import type { RouteId } from '../game/types';
import { createRng, uid } from '../game/util';
import type { ArenaDef, CollectibleKind, MoverDef } from './arenas';
import { ARENA_H, ARENA_W, ARENAS, insideCircle, insideEllipse, PLAYER_R } from './arenas';
import { findPath, NEIGHBOURS } from './pathfind';

export interface RunConfig {
  route: RouteId;
  seed: number;
  /** Slower obstacles and a longer timer. */
  relaxed?: boolean;
  /** Onboarding walk: short, gentle, guaranteed treasure. */
  tutorial?: boolean;
  /** First trip to this route guarantees a golden find. */
  firstVisit?: boolean;
  /** Paddle tail: can swim through any water. */
  canSwim?: boolean;
}

export interface Item {
  id: number;
  kind: CollectibleKind | 'golden';
  x: number;
  y: number;
  /** Seconds left before a golden item fades (golden only). */
  ttl?: number;
  bornAt: number;
}

export interface MoverState {
  kind: MoverDef['kind'];
  x: number;
  y: number;
  /** For frogs: 0..1 hop progress, 0 when sitting. */
  hop: number;
  facing: 1 | -1;
  /** Logs: half-length for collision. */
  half?: number;
}

export type RunEvent =
  | { type: 'collect'; kind: CollectibleKind }
  | { type: 'golden' }
  | { type: 'goldenAppeared' }
  | { type: 'goldenFaded' }
  | { type: 'hit'; by: MoverDef['kind']; dropped: CollectibleKind | null }
  | { type: 'blocked' }
  | { type: 'finished' };

export interface PlayerState {
  x: number;
  y: number;
  facing: 1 | -1;
  moving: boolean;
  stunned: number;
  invulnerable: number;
  slowed: boolean;
  swimming: boolean;
}

export interface RunState {
  t: number;
  duration: number;
  player: PlayerState;
  items: Item[];
  movers: MoverState[];
  basket: CollectibleKind[];
  golden: boolean;
  goldenAt: number | null;
  hits: number;
  finished: boolean;
  events: RunEvent[];
}

export interface RunInput {
  /** Direction from keys or d-pad, components in -1..1. */
  dir?: { x: number; y: number };
  /** Pointer target in arena coordinates. */
  target?: { x: number; y: number } | null;
}

export interface MinigameResult {
  runId: string;
  route: RouteId;
  seed: number;
  collected: Partial<Record<CollectibleKind, number>>;
  golden: boolean;
  hits: number;
  completed: boolean;
  tutorial: boolean;
  durationMs: number;
}

export const BASE_SPEED = 120;
export const SPAWN_EVERY = 1.5;
export const INITIAL_ITEMS = 3;
/** Longest possible run (relaxed mode). */
export const MAX_DURATION = 60;
const CELL = 8;
const STUN_TIME = 0.7;
const INVULN_TIME = 1.6;
const GOLDEN_TTL = 7;

export class MinigameRun {
  readonly def: ArenaDef;
  readonly config: Required<RunConfig>;
  readonly runId: string;
  state: RunState;
  private rand: () => number;
  private nextItemId = 1;
  private spawnTimer = 0;
  private obstacleScale: number;
  /** Static walkability grid used for tap-to-move pathfinding. */
  private grid: Uint8Array;
  /** Per cell, a bit per neighbour direction whose connecting segment is walkable. */
  private links: Uint8Array;
  private cols: number;
  private rows: number;
  private path: { x: number; y: number }[] = [];
  private pathTarget: { x: number; y: number } | null = null;
  private pathAge = 0;
  /** After bumping into something, follow grid waypoints exactly for a moment. */
  private strictUntil = 0;
  /** Waypoint cells that just led into a wall: avoided briefly when re-planning. */
  private avoid = new Map<number, number>();

  constructor(config: RunConfig, runId: string = uid('run')) {
    this.def = ARENAS[config.route];
    this.config = {
      route: config.route,
      seed: config.seed >>> 0,
      relaxed: config.relaxed ?? false,
      tutorial: config.tutorial ?? false,
      firstVisit: config.firstVisit ?? false,
      canSwim: config.canSwim ?? false,
    };
    this.runId = runId;
    this.rand = createRng(this.config.seed);
    this.obstacleScale = this.config.tutorial ? 0.45 : this.config.relaxed ? 0.6 : 1;
    const duration = this.config.tutorial ? 25 : this.def.duration + (this.config.relaxed ? 15 : 0);
    let goldenAt: number | null = null;
    if (this.config.tutorial || this.config.firstVisit) goldenAt = 4;
    else if (this.rand() < this.def.goldenChance) goldenAt = 8 + this.rand() * (duration - 18);
    const movers = this.config.tutorial ? this.def.movers.slice(0, 1) : this.def.movers;
    this.state = {
      t: 0,
      duration,
      player: {
        x: this.def.start.x,
        y: this.def.start.y,
        facing: 1,
        moving: false,
        stunned: 0,
        invulnerable: 0,
        slowed: false,
        swimming: false,
      },
      items: [],
      movers: movers.map((m) => this.moverAt(m, 0)),
      basket: [],
      golden: false,
      goldenAt,
      hits: 0,
      finished: false,
      events: [],
    };
    this.cols = Math.ceil(ARENA_W / CELL);
    this.rows = Math.ceil(ARENA_H / CELL);
    this.grid = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.grid[r * this.cols + c] = this.passable(c * CELL + CELL / 2, r * CELL + CELL / 2) ? 1 : 0;
      }
    }
    this.links = new Uint8Array(this.cols * this.rows);
    for (let i = 0; i < this.grid.length; i++) {
      if (!this.grid[i]) continue;
      const a = this.cellCenter(i);
      const cx = i % this.cols;
      const cy = Math.floor(i / this.cols);
      NEIGHBOURS.forEach(([dx, dy], bit) => {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) return;
        const j = ny * this.cols + nx;
        if (!this.grid[j]) return;
        const b = this.cellCenter(j);
        if (this.clearLine(a.x, a.y, b.x, b.y, 1)) this.links[i]! |= 1 << bit;
      });
    }
    // Start with a few items already on the field.
    for (let i = 0; i < INITIAL_ITEMS; i++) this.spawnItem();
  }

  private cellOf(x: number, y: number): number {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor(x / CELL)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor(y / CELL)));
    return r * this.cols + c;
  }

  private cellCenter(i: number): { x: number; y: number } {
    return { x: (i % this.cols) * CELL + CELL / 2, y: Math.floor(i / this.cols) * CELL + CELL / 2 };
  }

  /** Straight segment stays on walkable ground. */
  clearLine(ax: number, ay: number, bx: number, by: number, spacing = 2): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.ceil(d / spacing));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.passable(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  }

  /** Breadth-first search over the walkability grid; returns waypoints. */
  findPath(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
    const start = this.cellOf(from.x, from.y);
    let goal = this.cellOf(to.x, to.y);
    if (!this.grid[goal]) {
      // Aim for the closest walkable cell to the target instead.
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < this.grid.length; i++) {
        if (!this.grid[i]) continue;
        const c = this.cellCenter(i);
        const dd = (c.x - to.x) ** 2 + (c.y - to.y) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      }
      if (best === -1) return [];
      goal = best;
    }
    // Seed from nearby cells we can walk to in a straight line from the real position.
    const cols = this.cols;
    const sc = start % cols;
    const sr = Math.floor(start / cols);
    const starts: number[] = [];
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const c = sc + dc;
        const r = sr + dr;
        if (c < 0 || r < 0 || c >= cols || r >= this.rows) continue;
        const i = r * cols + c;
        if (!this.grid[i]) continue;
        if ((this.avoid.get(i) ?? -1) > this.state.t) continue;
        const center = this.cellCenter(i);
        if (!this.clearLine(from.x, from.y, center.x, center.y)) continue;
        starts.push(i);
      }
    }
    if (!starts.length) return [];
    const cells = findPath(this.grid, cols, starts, goal, this.links);
    if (!cells.length) return [];
    const points = cells.map((i) => this.cellCenter(i));
    if (this.grid[this.cellOf(to.x, to.y)]) points.push({ x: to.x, y: to.y });
    return points;
  }

  /** Direction to steer along a path toward the pointer target. */
  private steerTo(target: { x: number; y: number }, dt: number): { x: number; y: number } {
    const p = this.state.player;
    this.pathAge += dt;
    const moved = !this.pathTarget || Math.hypot(this.pathTarget.x - target.x, this.pathTarget.y - target.y) > 6;
    if (moved || this.pathAge > 0.5) {
      if (this.state.t >= this.strictUntil && this.clearLine(p.x, p.y, target.x, target.y)) this.path = [{ x: target.x, y: target.y }];
      else this.path = this.findPath(p, target);
      this.pathTarget = { x: target.x, y: target.y };
      this.pathAge = 0;
    }
    // Skip ahead to the farthest waypoint we can see (unless recovering from a bump).
    if (this.state.t >= this.strictUntil) {
      let idx = 0;
      for (let i = Math.min(this.path.length - 1, 8); i > 0; i--) {
        if (this.clearLine(p.x, p.y, this.path[i]!.x, this.path[i]!.y)) {
          idx = i;
          break;
        }
      }
      this.path.splice(0, idx);
    }
    while (this.path.length > 1 && Math.hypot(this.path[0]!.x - p.x, this.path[0]!.y - p.y) < 4) this.path.shift();
    const next = this.path[0];
    if (!next) return { x: 0, y: 0 };
    const dx = next.x - p.x;
    const dy = next.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 3) return { x: 0, y: 0 };
    return { x: dx / d, y: dy / d };
  }

  private get moverDefs(): MoverDef[] {
    return this.config.tutorial ? this.def.movers.slice(0, 1) : this.def.movers;
  }

  inWater(x: number, y: number): boolean {
    if (this.def.waterBand) return y >= this.def.waterBand.top && y <= this.def.waterBand.bottom;
    return this.def.water.some((w) => insideEllipse(w, x, y));
  }

  onPad(x: number, y: number): boolean {
    // A little tolerance so pads that visually touch the shore really connect.
    return this.def.pads.some((p) => insideCircle(p, x, y, 1.5));
  }

  passable(x: number, y: number): boolean {
    if (x < PLAYER_R || x > ARENA_W - PLAYER_R || y < PLAYER_R || y > ARENA_H - PLAYER_R) return false;
    if (this.def.blockers.some((b) => insideCircle(b, x, y, PLAYER_R * 0.8))) return false;
    if (this.inWater(x, y) && !this.config.canSwim && !this.onPad(x, y)) return false;
    return true;
  }

  private moverAt(m: MoverDef, t: number): MoverState {
    const s = this.obstacleScale;
    switch (m.kind) {
      case 'bee': {
        const theta = m.phase + t * m.speed * s;
        const x = m.cx + m.ax * Math.sin(theta);
        const y = m.cy + m.ay * Math.sin(2 * theta) * 0.5;
        const facing: 1 | -1 = Math.cos(theta) >= 0 ? 1 : -1;
        return { kind: 'bee', x, y, hop: 0, facing };
      }
      case 'frog': {
        const pads = m.pads.map((i) => this.def.pads[i]!);
        // Ping-pong along the pad list.
        const cycle = (pads.length - 1) * 2;
        const every = m.hopEvery / s;
        const raw = t / every + m.offset;
        const step = Math.floor(raw);
        const frac = raw - step;
        const idx = (k: number) => {
          const p = ((k % cycle) + cycle) % cycle;
          return p < pads.length ? p : cycle - p;
        };
        const from = pads[idx(step)]!;
        const to = pads[idx(step + 1)]!;
        // Sit for most of the interval, hop in the last 35%.
        const hopT = frac < 0.65 ? 0 : (frac - 0.65) / 0.35;
        const x = from.x + (to.x - from.x) * hopT;
        const y = from.y + (to.y - from.y) * hopT - Math.sin(hopT * Math.PI) * 10;
        return { kind: 'frog', x, y, hop: hopT, facing: to.x >= from.x ? 1 : -1 };
      }
      case 'log': {
        const span = ARENA_W + m.length * 2;
        const raw = m.startX + m.speed * s * t + m.length;
        const x = ((raw % span) + span) % span - m.length;
        return { kind: 'log', x, y: m.y, hop: 0, facing: m.speed >= 0 ? 1 : -1, half: m.length / 2 };
      }
    }
  }

  private pickKind(): CollectibleKind {
    const total = this.def.spawn.reduce((a, s) => a + s.weight, 0);
    let r = this.rand() * total;
    for (const s of this.def.spawn) {
      r -= s.weight;
      if (r <= 0) return s.kind;
    }
    return this.def.spawn[0]!.kind;
  }

  private spawnPoint(): { x: number; y: number } | null {
    const { player, items } = this.state;
    for (let attempt = 0; attempt < 40; attempt++) {
      const x = 24 + this.rand() * (ARENA_W - 48);
      const y = 24 + this.rand() * (ARENA_H - 48);
      if (!this.passable(x, y)) continue;
      if (this.def.slowZones.some((z) => insideCircle(z, x, y, 6))) continue;
      if (Math.hypot(x - player.x, y - player.y) < 48) continue;
      if (items.some((it) => Math.hypot(it.x - x, it.y - y) < 26)) continue;
      return { x, y };
    }
    return null;
  }

  private spawnItem(kind?: Item['kind']): void {
    const p = this.spawnPoint();
    if (!p) return;
    const item: Item = { id: this.nextItemId++, kind: kind ?? this.pickKind(), x: p.x, y: p.y, bornAt: this.state.t };
    if (item.kind === 'golden') item.ttl = this.config.relaxed || this.config.tutorial ? GOLDEN_TTL + 4 : GOLDEN_TTL;
    this.state.items.push(item);
  }

  step(input: RunInput, dtRaw: number): RunState {
    const st = this.state;
    st.events = [];
    if (st.finished) return st;
    const dt = Math.min(Math.max(dtRaw, 0), 0.05);
    st.t += dt;
    const p = st.player;

    // Movement
    p.stunned = Math.max(0, p.stunned - dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    let mx = 0;
    let my = 0;
    if (p.stunned <= 0) {
      if (input.dir && (input.dir.x || input.dir.y)) {
        mx = input.dir.x;
        my = input.dir.y;
      } else if (input.target) {
        const dir = this.steerTo(input.target, dt);
        mx = dir.x;
        my = dir.y;
      }
    }
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    p.slowed = this.def.slowZones.some((z) => insideCircle(z, p.x, p.y));
    p.swimming = this.inWater(p.x, p.y) && !this.onPad(p.x, p.y);
    let speed = BASE_SPEED * (p.slowed ? 0.45 : 1) * (p.swimming ? 0.85 : 1);
    if (this.config.tutorial) speed *= 1.05;
    p.moving = len > 0.05;
    if (mx > 0.1) p.facing = 1;
    else if (mx < -0.1) p.facing = -1;
    // Intended movement first (sliding along obstacles), then the current's drift on its own,
    // so the current can never pin the player against a reed clump.
    if (p.moving && !this.tryMove(mx * speed * dt, my * speed * dt)) {
      st.events.push({ type: 'blocked' });
      this.pathAge = Infinity;
      this.strictUntil = st.t + 0.75;
      const next = this.path[0];
      if (next) this.avoid.set(this.cellOf(next.x, next.y), st.t + 2);
    }
    if (p.swimming && this.def.current) this.tryMove(this.def.current * this.obstacleScale * dt, 0);

    // Obstacles
    const defs = this.moverDefs;
    st.movers = defs.map((m) => this.moverAt(m, st.t));
    if (p.invulnerable <= 0) {
      for (const m of st.movers) {
        if (this.touches(m, p)) {
          st.hits += 1;
          p.stunned = STUN_TIME;
          p.invulnerable = INVULN_TIME;
          let dropped: CollectibleKind | null = null;
          if (!this.config.tutorial && st.basket.length > 0) {
            dropped = st.basket.pop()!;
            // The dropped item lands somewhere else on the field and can be found again.
            this.spawnItem(dropped);
          }
          st.events.push({ type: 'hit', by: m.kind, dropped });
          break;
        }
      }
    }

    // Collection
    const reach = PLAYER_R + 9;
    st.items = st.items.filter((it) => {
      if (Math.hypot(it.x - p.x, it.y - p.y) > reach) return true;
      if (it.kind === 'golden') {
        st.golden = true;
        st.events.push({ type: 'golden' });
      } else {
        st.basket.push(it.kind);
        st.events.push({ type: 'collect', kind: it.kind });
      }
      return false;
    });

    // Golden item lifetime
    for (const it of st.items) {
      if (it.kind === 'golden' && it.ttl !== undefined) it.ttl -= dt;
    }
    const beforeCount = st.items.length;
    st.items = st.items.filter((it) => it.kind !== 'golden' || (it.ttl ?? 1) > 0);
    if (st.items.length < beforeCount) st.events.push({ type: 'goldenFaded' });
    if (st.goldenAt !== null && st.t >= st.goldenAt && !st.golden) {
      st.goldenAt = null;
      this.spawnItem('golden');
      st.events.push({ type: 'goldenAppeared' });
    }

    // Spawning
    this.spawnTimer += dt;
    const max = this.config.tutorial ? 5 : this.def.maxItems;
    if (this.spawnTimer >= SPAWN_EVERY) {
      this.spawnTimer = 0;
      if (st.items.filter((i) => i.kind !== 'golden').length < max) this.spawnItem();
    }

    if (st.t >= st.duration) {
      st.finished = true;
      st.events.push({ type: 'finished' });
    }
    return st;
  }

  /** Move with wall sliding. Returns false when (almost) no progress was possible. */
  private tryMove(dx: number, dy: number): boolean {
    const p = this.state.player;
    const nx = p.x + dx;
    const ny = p.y + dy;
    const want = Math.hypot(dx, dy);
    // A slide only counts if it covers a meaningful share of the intended step.
    const minSlide = want * 0.3;
    if (this.passable(nx, ny)) {
      p.x = nx;
      p.y = ny;
    } else if (Math.abs(dx) >= minSlide && this.passable(nx, p.y)) {
      p.x = nx;
    } else if (Math.abs(dy) >= minSlide && this.passable(p.x, ny)) {
      p.y = ny;
    } else {
      return false;
    }
    return true;
  }

  private touches(m: MoverState, p: PlayerState): boolean {
    if (m.kind === 'frog' && m.hop > 0.2 && m.hop < 0.8) return false; // mid-air frogs sail over you
    if (m.kind === 'log') {
      const half = m.half ?? 30;
      return Math.abs(p.x - m.x) < half + PLAYER_R * 0.6 && Math.abs(p.y - m.y) < 10 + PLAYER_R * 0.6;
    }
    const r = m.kind === 'bee' ? 10 : 12;
    return Math.hypot(m.x - p.x, m.y - p.y) < r + PLAYER_R * 0.75;
  }

  result(completed: boolean): MinigameResult {
    const collected: Partial<Record<CollectibleKind, number>> = {};
    for (const k of this.state.basket) collected[k] = (collected[k] ?? 0) + 1;
    return {
      runId: this.runId,
      route: this.config.route,
      seed: this.config.seed,
      collected,
      golden: this.state.golden,
      hits: this.state.hits,
      completed,
      tutorial: this.config.tutorial,
      durationMs: Math.round(this.state.t * 1000),
    };
  }
}
