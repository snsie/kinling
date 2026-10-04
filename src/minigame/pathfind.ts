// Grid pathfinding shared by the minigame and the home room. Cells are
// row-major indices into a walkability grid (1 = walkable).

/** Neighbour offsets; bit i of a links mask allows a step along NEIGHBOURS[i]. */
export const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;

/**
 * Allowed steps per cell: any walkable neighbour, but diagonals only when
 * both orthogonal cells beside them are walkable too (no cutting corners).
 */
export function gridLinks(grid: Uint8Array, cols: number): Uint8Array {
  const rows = Math.ceil(grid.length / cols);
  const walk = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && grid[r * cols + c] === 1;
  const links = new Uint8Array(grid.length);
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;
    const c = i % cols;
    const r = Math.floor(i / cols);
    NEIGHBOURS.forEach(([dx, dy], bit) => {
      if (!walk(c + dx, r + dy)) return;
      if (dx && dy && !(walk(c + dx, r) && walk(c, r + dy))) return;
      links[i]! |= 1 << bit;
    });
  }
  return links;
}

/** The walkable cell nearest to (x, y) in cell units, or -1 when there is none. */
export function nearestWalkable(grid: Uint8Array, cols: number, x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i]) continue;
    const d = (i % cols + 0.5 - x) ** 2 + (Math.floor(i / cols) + 0.5 - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/**
 * Breadth-first search from one or more start cells to `to`. Returns the cells
 * along the way, start and goal included, or [] when the goal can't be reached.
 */
export function findPath(grid: Uint8Array, cols: number, from: number | readonly number[], to: number, links: Uint8Array = gridLinks(grid, cols)): number[] {
  const rows = Math.ceil(grid.length / cols);
  if (to < 0 || to >= grid.length || !grid[to]) return [];
  const prev = new Int32Array(grid.length).fill(-1);
  const queue = new Int32Array(grid.length);
  let head = 0;
  let tail = 0;
  for (const s of typeof from === 'number' ? [from] : from) {
    if (s < 0 || s >= grid.length || !grid[s] || prev[s] !== -1) continue;
    prev[s] = s;
    queue[tail++] = s;
  }
  while (head < tail) {
    const cur = queue[head++]!;
    if (cur === to) break;
    const cx = cur % cols;
    const cy = Math.floor(cur / cols);
    const mask = links[cur]!;
    for (let bit = 0; bit < NEIGHBOURS.length; bit++) {
      if (!(mask & (1 << bit))) continue;
      const [dx, dy] = NEIGHBOURS[bit]!;
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      if (prev[ni] !== -1 || !grid[ni]) continue;
      prev[ni] = cur;
      queue[tail++] = ni;
    }
  }
  if (prev[to] === -1) return [];
  const cells: number[] = [];
  for (let at = to; ; at = prev[at]!) {
    cells.push(at);
    if (prev[at] === at) break;
  }
  return cells.reverse();
}
