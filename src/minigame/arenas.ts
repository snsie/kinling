// Arena layouts for each exploration route. Coordinates are in a 400x260 field.
import type { RouteId } from '../game/types';

export const ARENA_W = 400;
export const ARENA_H = 260;
export const PLAYER_R = 13;

export const COLLECTIBLE_KINDS = [
  'leaf',
  'petal',
  'pebble',
  'dewberry',
  'clover',
  'shell',
  'reed',
  'dewdrop',
  'pondPlum',
  'cress',
  'stardust',
] as const;
export type CollectibleKind = (typeof COLLECTIBLE_KINDS)[number];

export interface Circle {
  x: number;
  y: number;
  r: number;
}
export interface Ellipse {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

export type MoverDef =
  | { kind: 'bee'; cx: number; cy: number; ax: number; ay: number; speed: number; phase: number }
  | { kind: 'frog'; pads: number[]; hopEvery: number; offset: number }
  | { kind: 'log'; y: number; speed: number; startX: number; length: number };

export interface ArenaDef {
  route: RouteId;
  start: { x: number; y: number };
  duration: number;
  /** Thorny patches: walkable but slow. */
  slowZones: Circle[];
  /** Solid obstacles (reed clumps, rocks). */
  blockers: Circle[];
  /** Water areas. Without swimming only pads inside them are walkable. */
  water: Ellipse[];
  pads: Circle[];
  /** Horizontal current applied while in water (units/second). */
  current: number;
  /** Water band that covers everything between these y values (deep route). */
  waterBand?: { top: number; bottom: number };
  movers: MoverDef[];
  spawn: { kind: CollectibleKind; weight: number }[];
  maxItems: number;
  goldenChance: number;
}

const GARDEN: ArenaDef = {
  route: 'garden-path',
  start: { x: 200, y: 232 },
  duration: 45,
  slowZones: [
    { x: 110, y: 78, r: 26 },
    { x: 300, y: 178, r: 28 },
    { x: 222, y: 104, r: 18 },
    { x: 60, y: 190, r: 20 },
  ],
  blockers: [
    { x: 345, y: 60, r: 20 },
    { x: 40, y: 40, r: 16 },
  ],
  water: [],
  pads: [],
  current: 0,
  movers: [
    { kind: 'bee', cx: 150, cy: 120, ax: 95, ay: 55, speed: 0.75, phase: 0 },
    { kind: 'bee', cx: 270, cy: 110, ax: 85, ay: 60, speed: 0.6, phase: 2.1 },
  ],
  spawn: [
    { kind: 'leaf', weight: 30 },
    { kind: 'petal', weight: 25 },
    { kind: 'pebble', weight: 15 },
    { kind: 'dewberry', weight: 17 },
    { kind: 'clover', weight: 11 },
    { kind: 'stardust', weight: 2 },
  ],
  maxItems: 5,
  goldenChance: 0.65,
};

// Lily pads form a cross of overlapping stepping stones across the pond.
const SHALLOW_PADS: Circle[] = [
  { x: 200, y: 196, r: 19 },
  { x: 200, y: 166, r: 19 },
  { x: 196, y: 136, r: 20 },
  { x: 204, y: 106, r: 19 },
  { x: 200, y: 76, r: 19 },
  { x: 200, y: 48, r: 19 },
  { x: 62, y: 122, r: 19 },
  { x: 92, y: 118, r: 19 },
  { x: 122, y: 124, r: 19 },
  { x: 152, y: 120, r: 19 },
  { x: 176, y: 126, r: 17 },
  { x: 226, y: 118, r: 17 },
  { x: 252, y: 116, r: 19 },
  { x: 282, y: 122, r: 19 },
  { x: 312, y: 118, r: 19 },
  { x: 340, y: 120, r: 19 },
];

const SHALLOWS: ArenaDef = {
  route: 'pond-shallows',
  start: { x: 200, y: 240 },
  duration: 45,
  slowZones: [],
  blockers: [
    { x: 30, y: 230, r: 16 },
    { x: 372, y: 34, r: 16 },
  ],
  water: [{ x: 200, y: 122, rx: 152, ry: 88 }],
  pads: SHALLOW_PADS,
  current: 0,
  movers: [
    { kind: 'frog', pads: [6, 8, 9, 2, 1], hopEvery: 1.5, offset: 0 },
    { kind: 'frog', pads: [15, 13, 12, 3, 4], hopEvery: 1.7, offset: 0.8 },
  ],
  spawn: [
    { kind: 'shell', weight: 28 },
    { kind: 'reed', weight: 24 },
    { kind: 'pondPlum', weight: 18 },
    { kind: 'cress', weight: 15 },
    { kind: 'dewdrop', weight: 12 },
    { kind: 'stardust', weight: 3 },
  ],
  maxItems: 6,
  goldenChance: 0.65,
};

const DEEP: ArenaDef = {
  route: 'pond-deep',
  start: { x: 60, y: 238 },
  duration: 45,
  slowZones: [],
  blockers: [
    { x: 120, y: 90, r: 18 },
    { x: 250, y: 160, r: 20 },
    { x: 330, y: 80, r: 16 },
    { x: 180, y: 200, r: 14 },
  ],
  water: [],
  pads: [],
  current: 18,
  waterBand: { top: 34, bottom: 222 },
  movers: [
    { kind: 'log', y: 70, speed: 38, startX: 0, length: 64 },
    { kind: 'log', y: 128, speed: -30, startX: 260, length: 72 },
    { kind: 'log', y: 186, speed: 44, startX: 150, length: 58 },
  ],
  spawn: [
    { kind: 'shell', weight: 30 },
    { kind: 'dewdrop', weight: 22 },
    { kind: 'reed', weight: 18 },
    { kind: 'pondPlum', weight: 12 },
    { kind: 'cress', weight: 10 },
    { kind: 'stardust', weight: 8 },
  ],
  maxItems: 6,
  goldenChance: 0.8,
};

export const ARENAS: Record<RouteId, ArenaDef> = {
  'garden-path': GARDEN,
  'pond-shallows': SHALLOWS,
  'pond-deep': DEEP,
};

/** Items each route can legitimately produce (used to validate results). */
export function routeCollectibles(route: RouteId): CollectibleKind[] {
  return ARENAS[route].spawn.map((s) => s.kind);
}

export function insideEllipse(e: Ellipse, x: number, y: number): boolean {
  const dx = (x - e.x) / e.rx;
  const dy = (y - e.y) / e.ry;
  return dx * dx + dy * dy <= 1;
}

export function insideCircle(c: Circle, x: number, y: number, pad = 0): boolean {
  const dx = x - c.x;
  const dy = y - c.y;
  return dx * dx + dy * dy <= (c.r + pad) * (c.r + pad);
}
