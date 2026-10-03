// The playable collection minigame: rendering, input and HUD around the
// deterministic engine in src/minigame/engine.ts.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { playSfx } from '../app/sfx';
import { FOODS, KEEPSAKES, MATERIALS, ROUTES } from '../game/catalog';
import type { Appearance, FoodId, LifeStage, MaterialId } from '../game/types';
import { ARENA_H, ARENA_W, type CollectibleKind } from '../minigame/arenas';
import { MinigameRun, type MinigameResult, type RunConfig } from '../minigame/engine';
import { ArenaBackdrop, FieldItem, MoverSprite } from '../render/ArenaArt';
import { Creature } from '../render/Creature';
import { ItemIcon } from '../render/ItemIcon';
import { Icon } from './icons';
import { Kinetic } from './motion';

export interface MinigameProps {
  config: RunConfig;
  appearance: Appearance;
  stage: LifeStage;
  name: string;
  reducedMotion: boolean;
  onFinish: (result: MinigameResult) => void;
}

const KEY_DIRS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  w: [0, -1],
  s: [0, 1],
  a: [-1, 0],
  d: [1, 0],
  W: [0, -1],
  S: [0, 1],
  A: [-1, 0],
  D: [1, 0],
};

function itemName(kind: CollectibleKind): string {
  return (MATERIALS as Record<string, { name: string }>)[kind]?.name ?? FOODS[kind as FoodId]?.name ?? kind;
}

export function Minigame({ config, appearance, stage, name, reducedMotion, onFinish }: MinigameProps) {
  const runRef = useRef<MinigameRun | null>(null);
  if (!runRef.current) runRef.current = new MinigameRun(config);
  const run = runRef.current;
  const [, setFrame] = useState(0);
  const [phase, setPhase] = useState<'intro' | 'playing' | 'paused' | 'done'>('intro');
  const [announce, setAnnounce] = useState('');
  const keys = useRef(new Set<string>());
  const padDir = useRef<[number, number]>([0, 0]);
  const target = useRef<{ x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const lastAnnounce = useRef(0);
  const finished = useRef(false);
  const startBtn = useRef<HTMLButtonElement>(null);
  const route = ROUTES[config.route];
  // The backdrop is static; a stable element lets React skip it on every frame.
  const backdrop = useMemo(() => <ArenaBackdrop route={config.route} reducedMotion={reducedMotion} />, [config.route, reducedMotion]);

  const finish = useCallback(
    (completed: boolean) => {
      if (finished.current) return;
      finished.current = true;
      setPhase('done');
      onFinish(run.result(completed));
    },
    [onFinish, run],
  );

  useEffect(() => {
    startBtn.current?.focus();
  }, []);

  // Keyboard input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (phase === 'done') return;
      if (KEY_DIRS[e.key]) {
        keys.current.add(e.key);
        target.current = null;
        if (phase === 'playing') e.preventDefault();
      }
      if ((e.key === ' ' || e.key === 'p' || e.key === 'P') && (phase === 'playing' || phase === 'paused')) {
        e.preventDefault();
        setPhase((p) => (p === 'playing' ? 'paused' : 'playing'));
      }
      if (e.key === 'Escape' && phase === 'playing') setPhase('paused');
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key);
    const blur = () => {
      keys.current.clear();
      if (phase === 'playing') setPhase('paused');
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    const vis = () => document.hidden && blur();
    document.addEventListener('visibilitychange', vis);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [phase]);

  // Game loop
  useEffect(() => {
    if (phase !== 'playing') return;
    let raf = 0;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      let dx = padDir.current[0];
      let dy = padDir.current[1];
      for (const k of keys.current) {
        const d = KEY_DIRS[k];
        if (d) {
          dx += d[0];
          dy += d[1];
        }
      }
      const st = run.step({ dir: dx || dy ? { x: dx, y: dy } : undefined, target: target.current }, dt);
      for (const e of st.events) {
        if (e.type === 'collect') {
          playSfx('collect');
          if (t - lastAnnounce.current > 1200) {
            lastAnnounce.current = t;
            setAnnounce(`Collected ${itemName(e.kind).toLowerCase()}. ${st.basket.length} items in your basket.`);
          }
        } else if (e.type === 'golden') {
          playSfx('sparkle');
          setAnnounce('You found the golden treasure!');
        } else if (e.type === 'goldenAppeared') {
          setAnnounce('A golden treasure appeared somewhere!');
        } else if (e.type === 'hit') {
          playSfx('bonk');
          const by = e.by === 'bee' ? 'a bee' : e.by === 'frog' ? 'a splashing frog' : 'a drifting log';
          setAnnounce(`Bumped by ${by}${e.dropped ? `, dropped a ${itemName(e.dropped).toLowerCase()}` : ''}.`);
        }
      }
      if (target.current && Math.hypot(target.current.x - st.player.x, target.current.y - st.player.y) < 4) target.current = null;
      setFrame((f) => f + 1);
      if (st.finished) {
        finish(true);
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, run, finish]);

  const toArena = (e: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const p = pt.matrixTransform(m.inverse());
    return { x: Math.max(0, Math.min(ARENA_W, p.x)), y: Math.max(0, Math.min(ARENA_H, p.y)) };
  };

  const st = run.state;
  const p = st.player;
  const timeLeft = Math.max(0, Math.ceil(st.duration - st.t));
  const counts: Partial<Record<CollectibleKind, number>> = {};
  for (const k of st.basket) counts[k] = (counts[k] ?? 0) + 1;
  const anim = p.stunned > 0 ? 'puzzled' : 'idle';

  const pad = (dir: [number, number]) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.preventDefault();
      padDir.current = dir;
      target.current = null;
    },
    onPointerUp: () => (padDir.current = [0, 0]),
    onPointerLeave: () => (padDir.current = [0, 0]),
    onPointerCancel: () => (padDir.current = [0, 0]),
  });

  return (
    <section className="minigame" aria-label={`${route.name} adventure`}>
      <div className="minigame__hud">
        <div className="hud-pill" aria-label={`${timeLeft} seconds left`}>
          {Icon.clock(18)} {timeLeft}s
        </div>
        <div className="hud-basket" aria-label={`Basket: ${st.basket.length} items`}>
          {(Object.keys(counts) as CollectibleKind[]).map((k) => (
            <span key={k} className="hud-basket__item">
              <ItemIcon kind={k as MaterialId | FoodId} size={20} />
              {counts[k]}
            </span>
          ))}
          {st.golden && (
            <span className="hud-basket__item hud-basket__item--gold">
              <ItemIcon kind="golden" size={20} /> ✓
            </span>
          )}
          {st.basket.length === 0 && !st.golden && <span className="hint">Basket empty</span>}
        </div>
        <button className="icon-btn" onClick={() => setPhase(phase === 'playing' ? 'paused' : 'playing')} aria-label={phase === 'playing' ? 'Pause' : 'Resume'} disabled={phase === 'intro' || phase === 'done'}>
          {Icon.pause(20)}
        </button>
      </div>

      <div className="minigame__field">
        <svg
          ref={svgRef}
          className="arena"
          viewBox={`0 0 ${ARENA_W} ${ARENA_H}`}
          role="application"
          aria-label={`${route.name}. Move ${name} with the arrow keys or WASD, or tap where to go. Collect items and avoid obstacles. Space pauses.`}
          onPointerDown={(e) => {
            if (phase !== 'playing') return;
            const pt = toArena(e);
            if (pt) target.current = pt;
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (phase !== 'playing' || e.buttons === 0) return;
            const pt = toArena(e);
            if (pt) target.current = pt;
          }}
        >
          {backdrop}
          {st.items.map((it) => (
            <FieldItem key={it.id} item={it} reducedMotion={reducedMotion} />
          ))}
          {target.current && <circle className="arena__target" cx={target.current.x} cy={target.current.y} r={6} />}
          {p.swimming && <ellipse cx={p.x} cy={p.y + 10} rx={18} ry={6} className="arena__ripple" />}
          <g transform={`translate(${p.x - 24} ${p.y - 38})`} className={p.invulnerable > 0 && !reducedMotion ? 'arena__blink' : undefined} data-player="">
            <svg width={48} height={48} viewBox="0 0 200 200" overflow="visible">
              <Creature asGroup appearance={appearance} stage={stage} anim={anim} moving={p.moving} facing={p.facing} reducedMotion={reducedMotion} />
            </svg>
          </g>
          {st.movers.map((m, i) => (
            <MoverSprite key={i} mover={m} />
          ))}
        </svg>

        {phase === 'intro' && (
          <div className="minigame__overlay">
            <h2>
              <Kinetic text={route.name} />
            </h2>
            <p>{route.description}</p>
            <p className="hint">{route.obstacleHint}</p>
            <p className="hint">Arrow keys / WASD to move, or tap where to go. Space to pause. A golden treasure may appear — grab it before it fades!</p>
            <button ref={startBtn} className="btn btn--primary btn--big" onClick={() => setPhase('playing')}>
              Start
            </button>
          </div>
        )}
        {phase === 'paused' && (
          <div className="minigame__overlay" role="dialog" aria-label="Paused">
            <h2>Paused</h2>
            <div className="row row--center">
              <button className="btn btn--primary" autoFocus onClick={() => setPhase('playing')}>
                Resume
              </button>
              <button className="btn btn--ghost" onClick={() => finish(false)}>
                Head home early
              </button>
            </div>
            <p className="hint">Heading home early keeps what's in your basket, but skips the bonus.</p>
          </div>
        )}
      </div>

      <div className="dpad" aria-hidden="true">
        <button className="dpad__btn dpad__up" tabIndex={-1} {...pad([0, -1])}>
          {Icon.arrow('up')}
        </button>
        <button className="dpad__btn dpad__left" tabIndex={-1} {...pad([-1, 0])}>
          {Icon.arrow('left')}
        </button>
        <button className="dpad__btn dpad__right" tabIndex={-1} {...pad([1, 0])}>
          {Icon.arrow('right')}
        </button>
        <button className="dpad__btn dpad__down" tabIndex={-1} {...pad([0, 1])}>
          {Icon.arrow('down')}
        </button>
      </div>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
      <p className="sr-only">Keepsakes possible here: {route.location === 'garden' ? KEEPSAKES['ladybug-button'].name : KEEPSAKES['swirl-shell'].name} and more.</p>
    </section>
  );
}
