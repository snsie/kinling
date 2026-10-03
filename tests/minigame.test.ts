import { describe, expect, it } from 'vitest';
import { MinigameRun } from '../src/minigame/engine';
import { ARENAS } from '../src/minigame/arenas';
import { sanitizeResult } from '../src/game/adventure';

function play(seed: number, route: 'garden-path' | 'pond-shallows' | 'pond-deep', canSwim = false) {
  const run = new MinigameRun({ route, seed, canSwim }, `run_${seed}`);
  let frame = 0;
  while (!run.state.finished && frame < 5000) {
    // Chase the nearest item, like a simple player would.
    const p = run.state.player;
    const target = [...run.state.items].sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    run.step({ target: target ? { x: target.x, y: target.y } : null }, 1 / 30);
    frame++;
  }
  return run;
}

describe('collection minigame', () => {
  it('is deterministic for the same seed and inputs', () => {
    const a = play(7, 'garden-path').result(true);
    const b = play(7, 'garden-path').result(true);
    expect(a.collected).toEqual(b.collected);
    expect(a.hits).toBe(b.hits);
  });

  it('finishes at the time limit and produces a valid result', () => {
    const run = play(3, 'garden-path');
    expect(run.state.finished).toBe(true);
    expect(run.state.t).toBeGreaterThanOrEqual(ARENAS['garden-path'].duration);
    const total = Object.values(run.result(true).collected).reduce((x, y) => x + (y ?? 0), 0);
    expect(total).toBeGreaterThan(0);
    expect(sanitizeResult(run.result(true))).not.toBeNull();
  });

  it('only yields items that belong to the route', () => {
    const r = play(11, 'pond-shallows').result(true);
    for (const k of Object.keys(r.collected)) expect(['shell', 'reed', 'pondPlum', 'cress', 'dewdrop', 'stardust']).toContain(k);
  });

  it('blocks deep water without swimming but allows lily pads', () => {
    const run = new MinigameRun({ route: 'pond-shallows', seed: 1 });
    expect(run.passable(120, 160)).toBe(false); // open water
    expect(run.passable(200, 166)).toBe(true); // lily pad
    expect(run.passable(200, 240)).toBe(true); // shore
    const swimmer = new MinigameRun({ route: 'pond-shallows', seed: 1, canSwim: true });
    expect(swimmer.passable(120, 160)).toBe(true);
  });

  it('bee stings startle and drop the last item', () => {
    const run = new MinigameRun({ route: 'garden-path', seed: 5 });
    run.state.basket.push('leaf', 'petal');
    const bee = run.state.movers[0]!;
    run.state.player.x = bee.x;
    run.state.player.y = bee.y;
    // Step with no movement until a collision registers.
    let hit = false;
    for (let i = 0; i < 5 && !hit; i++) {
      const m = run.state.movers[0]!;
      run.state.player.x = m.x;
      run.state.player.y = m.y;
      run.step({}, 0.001);
      hit = run.state.events.some((e) => e.type === 'hit');
    }
    expect(hit).toBe(true);
    expect(run.state.basket).toEqual(['leaf']);
    expect(run.state.player.stunned).toBeGreaterThan(0);
  });

  it('first visits guarantee a golden find', () => {
    const run = new MinigameRun({ route: 'pond-shallows', seed: 99, firstVisit: true });
    expect(run.state.goldenAt).toBe(4);
  });

  it('the deep route current pushes a swimmer along', () => {
    const run = new MinigameRun({ route: 'pond-deep', seed: 2, canSwim: true });
    run.state.player.x = 60;
    run.state.player.y = 110;
    const x0 = run.state.player.x;
    for (let i = 0; i < 10; i++) run.step({}, 0.05);
    expect(run.state.player.x).toBeGreaterThan(x0);
  });
});
