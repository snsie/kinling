// The home room seen from above: a grid of floor tiles with furniture.
// Furniture blocks its tiles; each piece has a "spot" beside it where a
// kinling stands to use it.
import type { FurnitureId } from '../game/chatter';
import { gridLinks } from '../minigame/pathfind';

export const COLS = 12;
export const ROWS = 8;

export interface Cell {
  c: number;
  r: number;
}

export interface Furniture {
  id: FurnitureId;
  label: string;
  /** Top-left tile and size in tiles. */
  c: number;
  r: number;
  w: number;
  h: number;
  /** Where a kinling stands to use it. */
  spot: Cell;
}

export const FURNITURE: readonly Furniture[] = [
  { id: 'shelf', label: 'keepsake shelf', c: 1, r: 0, w: 3, h: 1, spot: { c: 2, r: 1 } },
  { id: 'bowl', label: 'food bowl', c: 6, r: 1, w: 1, h: 1, spot: { c: 6, r: 2 } },
  { id: 'bed', label: 'bed', c: 9, r: 1, w: 2, h: 2, spot: { c: 9, r: 3 } },
  { id: 'tub', label: 'water tub', c: 0, r: 6, w: 2, h: 2, spot: { c: 2, r: 6 } },
  { id: 'plant', label: 'potted plant', c: 11, r: 7, w: 1, h: 1, spot: { c: 10, r: 7 } },
];

export const FURNITURE_BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));

export interface RoomGrid {
  cols: number;
  rows: number;
  grid: Uint8Array;
  links: Uint8Array;
}

function buildGrid(): RoomGrid {
  const grid = new Uint8Array(COLS * ROWS).fill(1);
  // The back wall is row 0.
  for (let c = 0; c < COLS; c++) grid[c] = 0;
  for (const f of FURNITURE) {
    for (let r = f.r; r < f.r + f.h; r++) for (let c = f.c; c < f.c + f.w; c++) grid[r * COLS + c] = 0;
  }
  return { cols: COLS, rows: ROWS, grid, links: gridLinks(grid, COLS) };
}

export const ROOM: RoomGrid = buildGrid();

export function cellIndex(c: number, r: number): number {
  return r * COLS + c;
}

export function cellOf(x: number, y: number): number {
  const c = Math.max(0, Math.min(COLS - 1, Math.floor(x)));
  const r = Math.max(0, Math.min(ROWS - 1, Math.floor(y)));
  return r * COLS + c;
}

export function cellCenter(i: number): { x: number; y: number } {
  return { x: (i % COLS) + 0.5, y: Math.floor(i / COLS) + 0.5 };
}

export function walkable(i: number): boolean {
  return i >= 0 && i < ROOM.grid.length && ROOM.grid[i] === 1;
}

export const WALKABLE_CELLS: readonly number[] = [...ROOM.grid.keys()].filter((i) => ROOM.grid[i] === 1);

/** The furniture whose spot is within `radius` tiles of (x, y), nearest first. */
export function furnitureNear(x: number, y: number, radius = 1.6): FurnitureId | null {
  let best: Furniture | null = null;
  let bestD = radius;
  for (const f of FURNITURE) {
    const cx = f.c + f.w / 2;
    const cy = f.r + f.h / 2;
    // Distance to the furniture's edge, not its middle.
    const dx = Math.max(0, Math.abs(x - cx) - f.w / 2);
    const dy = Math.max(0, Math.abs(y - cy) - f.h / 2);
    const d = Math.hypot(dx, dy);
    if (d <= bestD) {
      bestD = d;
      best = f;
    }
  }
  return best?.id ?? null;
}
