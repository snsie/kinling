// Minigame arena artwork, drawn straight from the collision geometry in
// src/minigame/arenas.ts so what the player sees is what blocks them.
import type { JSX } from 'react';
import type { RouteId } from '../game/types';
import type { Circle } from '../minigame/arenas';
import { ARENA_H, ARENA_W, ARENAS } from '../minigame/arenas';
import type { Item, MoverState } from '../minigame/engine';
import { ItemGlyph } from './ItemIcon';
import '../styles/scenes.css';

/** Deterministic pseudo-random in 0..1 for decoration placement. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A lumpy circle outline around (cx, cy). */
function blob(cx: number, cy: number, r: number, bumps: number, depth: number, seed: number): string {
  const pts: string[] = [];
  const steps = bumps * 2;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r + (i % 2 === 0 ? depth : -depth * 0.4) * (0.7 + 0.6 * hash01(seed + i));
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)} ${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return `M${pts.join(' L')}Z`;
}

function Daisy({ x, y, color = '#FFFFFF', center = '#F2C14E', s = 1 }: { x: number; y: number; color?: string; center?: string; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {[0, 72, 144, 216, 288].map((r) => (
        <ellipse key={r} cx="0" cy="-3.2" rx="2" ry="3" fill={color} transform={`rotate(${r})`} />
      ))}
      <circle r="1.9" fill={center} />
    </g>
  );
}

function Tuft({ x, y, color = '#7FB45E' }: { x: number; y: number; color?: string }) {
  return <path d={`M${x - 4} ${y} Q${x - 3} ${y - 6} ${x - 5} ${y - 9} M${x} ${y} Q${x} ${y - 7} ${x + 1} ${y - 11} M${x + 4} ${y} Q${x + 3} ${y - 6} ${x + 6} ${y - 8}`} stroke={color} strokeWidth="1.6" fill="none" strokeLinecap="round" />;
}

function Bramble({ zone, i }: { zone: Circle; i: number }) {
  const { x, y, r } = zone;
  const vines = [0, 1, 2, 3].map((k) => {
    const a0 = hash01(i * 10 + k) * Math.PI * 2;
    const a1 = a0 + 2.2 + hash01(i * 7 + k) * 1.2;
    const rr = r * (0.45 + 0.35 * hash01(i * 3 + k));
    return { a0, a1, rr };
  });
  return (
    <g>
      <path d={blob(x, y, r, 9, 3, i * 31)} fill="#557A36" stroke="#36552A" strokeWidth="1.6" strokeLinejoin="round" />
      <path d={blob(x, y, r * 0.72, 7, 2, i * 17)} fill="#4A6E30" />
      {vines.map(({ a0, a1, rr }, k) => {
        const sx = x + Math.cos(a0) * rr;
        const sy = y + Math.sin(a0) * rr;
        const ex = x + Math.cos(a1) * rr;
        const ey = y + Math.sin(a1) * rr;
        const thorns = [0.25, 0.5, 0.75].map((t) => {
          const px = sx + (ex - sx) * t + (y - (sy + ey) / 2) * 0.25 * Math.sin(t * Math.PI);
          const py = sy + (ey - sy) * t - (x - (sx + ex) / 2) * 0.25 * Math.sin(t * Math.PI);
          return `M${px.toFixed(1)} ${(py - 2.6).toFixed(1)} l1.6 2.6 l-3.2 0Z`;
        });
        return (
          <g key={k}>
            <path d={`M${sx} ${sy} Q${x} ${y} ${ex} ${ey}`} stroke="#2F4A22" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path d={thorns.join(' ')} fill="#2F4A22" />
          </g>
        );
      })}
      {[0, 1, 2].map((k) => {
        const a = hash01(i * 13 + k) * Math.PI * 2;
        const rr = r * 0.55;
        return <circle key={k} cx={x + Math.cos(a) * rr} cy={y + Math.sin(a) * rr} r="2.2" fill="#C2405A" stroke="#7E2236" strokeWidth="0.8" />;
      })}
    </g>
  );
}

function Stump({ c }: { c: Circle }) {
  const { x, y, r } = c;
  return (
    <g>
      <ellipse cx={x + 2} cy={y + r * 0.55} rx={r * 1.05} ry={r * 0.45} fill="#000" opacity="0.15" />
      <path d={`M${x - r} ${y} L${x - r} ${y + r * 0.45} Q${x} ${y + r * 0.85} ${x + r} ${y + r * 0.45} L${x + r} ${y}Z`} fill="#8C5F3A" stroke="#5E3D22" strokeWidth="1.5" />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.62} fill="#D9B07E" stroke="#5E3D22" strokeWidth="1.5" />
      <ellipse cx={x} cy={y} rx={r * 0.66} ry={r * 0.4} fill="none" stroke="#B88A57" strokeWidth="1.2" />
      <ellipse cx={x} cy={y} rx={r * 0.34} ry={r * 0.2} fill="none" stroke="#B88A57" strokeWidth="1.2" />
      <path d={`M${x - r * 0.6} ${y + r * 0.6} q2 -5 5 0`} fill="#E0705A" />
    </g>
  );
}

function Rock({ c, mossy = true }: { c: Circle; mossy?: boolean }) {
  const { x, y, r } = c;
  return (
    <g>
      <ellipse cx={x + 2} cy={y + r * 0.6} rx={r * 1.05} ry={r * 0.4} fill="#000" opacity="0.15" />
      <path d={`M${x - r} ${y + r * 0.4} C${x - r * 1.05} ${y - r * 0.6} ${x - r * 0.3} ${y - r} ${x + r * 0.2} ${y - r * 0.9} C${x + r} ${y - r * 0.75} ${x + r * 1.05} ${y} ${x + r} ${y + r * 0.4} C${x + r * 0.5} ${y + r * 0.75} ${x - r * 0.5} ${y + r * 0.75} ${x - r} ${y + r * 0.4}Z`} fill="#A9A39B" stroke="#6B655E" strokeWidth="1.5" />
      <path d={`M${x - r * 0.55} ${y - r * 0.35} C${x - r * 0.4} ${y - r * 0.7} ${x} ${y - r * 0.8} ${x + r * 0.3} ${y - r * 0.7}`} stroke="#D8D3CC" strokeWidth="2" fill="none" strokeLinecap="round" />
      {mossy && <path d={`M${x - r * 0.9} ${y + r * 0.1} C${x - r * 0.5} ${y - r * 0.15} ${x - r * 0.1} ${y + r * 0.1} ${x + r * 0.15} ${y - r * 0.05} C${x + r * 0.1} ${y + r * 0.35} ${x - r * 0.6} ${y + r * 0.45} ${x - r * 0.9} ${y + r * 0.1}Z`} fill="#7FA35A" opacity="0.9" />}
    </g>
  );
}

function ReedClump({ c, i }: { c: Circle; i: number }) {
  const { x, y, r } = c;
  const blades = Array.from({ length: 9 }, (_, k) => {
    const dx = (k / 8 - 0.5) * r * 1.5;
    const h = r * (0.9 + 0.5 * hash01(i * 9 + k));
    const lean = (hash01(i * 5 + k) - 0.5) * 6;
    return { dx, h, lean };
  });
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="#2F5E3E" opacity="0.55" />
      <ellipse cx={x} cy={y + r * 0.35} rx={r * 0.95} ry={r * 0.5} fill="#3F6E3A" stroke="#2A4B27" strokeWidth="1.4" />
      {blades.map(({ dx, h, lean }, k) => (
        <path key={k} d={`M${x + dx} ${y + r * 0.45} Q${x + dx + lean * 0.4} ${y + r * 0.45 - h * 0.6} ${x + dx + lean} ${y + r * 0.45 - h}`} stroke={k % 2 ? '#6FA656' : '#5C9147'} strokeWidth="2.4" fill="none" strokeLinecap="round" />
      ))}
      {[1, 4, 7].map((k) => {
        const b = blades[k]!;
        return <rect key={k} x={x + b.dx + b.lean - 2.2} y={y + r * 0.45 - b.h - 2} width="4.4" height="9" rx="2.2" fill="#8C5A35" stroke="#5E3A20" strokeWidth="0.8" />;
      })}
    </g>
  );
}

function Cattail({ x, y, h = 22, lean = 0 }: { x: number; y: number; h?: number; lean?: number }) {
  return (
    <g>
      <path d={`M${x} ${y} Q${x + lean * 0.4} ${y - h * 0.6} ${x + lean} ${y - h}`} stroke="#5C9147" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <path d={`M${x} ${y} Q${x - 5} ${y - h * 0.4} ${x - 7} ${y - h * 0.7}`} stroke="#79B85A" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <rect x={x + lean - 2.2} y={y - h - 1} width="4.4" height="9" rx="2.2" fill="#8C5A35" />
    </g>
  );
}

function LilyPad({ pad, i }: { pad: Circle; i: number }) {
  const { x, y, r } = pad;
  const a = hash01(i * 3.3) * Math.PI * 2;
  const half = 0.2;
  const n1x = x + Math.cos(a - half) * (r + 0.5);
  const n1y = y + Math.sin(a - half) * (r + 0.5);
  const n2x = x + Math.cos(a + half) * (r + 0.5);
  const n2y = y + Math.sin(a + half) * (r + 0.5);
  return (
    <g>
      <ellipse cx={x + 1.5} cy={y + 2} rx={r} ry={r} fill="#2F7DA8" opacity="0.25" />
      <circle cx={x} cy={y} r={r} fill="#7DBE5A" stroke="#4E8A39" strokeWidth="1.6" />
      <path d={`M${x} ${y} L${n1x} ${n1y} A${r + 0.5} ${r + 0.5} 0 0 1 ${n2x} ${n2y}Z`} fill="#6AB5DA" />
      {[1.3, 2.4, 3.6, 4.7].map((k) => {
        const va = a + k;
        return <path key={k} d={`M${x} ${y} L${x + Math.cos(va) * r * 0.8} ${y + Math.sin(va) * r * 0.8}`} stroke="#5E9E45" strokeWidth="1" opacity="0.8" />;
      })}
      <path d={`M${x - r * 0.6} ${y - r * 0.35} A${r * 0.75} ${r * 0.75} 0 0 1 ${x - r * 0.05} ${y - r * 0.72}`} stroke="#B6E08F" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {i % 4 === 1 && (
        <g transform={`translate(${x + r * 0.3} ${y + r * 0.25})`}>
          {[0, 60, 120, 180, 240, 300].map((rot) => (
            <ellipse key={rot} cx="0" cy="-3" rx="1.8" ry="3.2" fill="#F7B6CB" stroke="#D17A98" strokeWidth="0.6" transform={`rotate(${rot})`} />
          ))}
          <circle r="1.6" fill="#F7D98B" />
        </g>
      )}
    </g>
  );
}

function GardenBackdrop() {
  const def = ARENAS['garden-path'];
  const flowers: [number, number, string][] = [
    [22, 120, '#F4A7BB'],
    [30, 150, '#FFFFFF'],
    [380, 120, '#F7D98B'],
    [372, 230, '#FFFFFF'],
    [150, 245, '#F4A7BB'],
    [262, 30, '#C9B3E8'],
    [170, 28, '#FFFFFF'],
    [300, 245, '#F7D98B'],
    [380, 160, '#F4A7BB'],
    [96, 30, '#F7D98B'],
  ];
  return (
    <g>
      <rect width={ARENA_W} height={ARENA_H} fill="#A6D27C" />
      {Array.from({ length: 10 }, (_, k) => (
        <rect key={k} x={k * 40} y="0" width="20" height={ARENA_H} fill="#9BCB70" opacity="0.55" />
      ))}
      {/* hedge along the top */}
      <path d={`M0 0 H${ARENA_W} V9 ${Array.from({ length: 20 }, (_, k) => `Q${ARENA_W - k * 20 - 10} ${k % 2 ? 17 : 15} ${ARENA_W - (k + 1) * 20} 9`).join(' ')} Z`} fill="#6FA356" stroke="#4E7A3A" strokeWidth="1.2" />
      {/* stepping stones from the gate */}
      {[
        [200, 250, 9],
        [190, 228, 8],
        [203, 206, 7.5],
        [186, 186, 7],
      ].map(([x, y, r], i) => (
        <ellipse key={i} cx={x} cy={y} rx={r} ry={r * 0.62} fill="#D7CFC2" stroke="#A89E90" strokeWidth="1" opacity="0.9" />
      ))}
      {/* flower beds at the edges */}
      <path d="M0 214 Q30 204 46 222 Q52 248 40 260 H0Z" fill="#9C6E48" stroke="#7A5236" strokeWidth="3" />
      <path d="M3 218 Q28 210 41 225 Q46 246 36 260 H0Z" fill="#7E5A3C" />
      <path d="M352 260 Q348 232 372 222 Q392 218 400 226 V260Z" fill="#9C6E48" stroke="#7A5236" strokeWidth="3" />
      <path d="M357 260 Q354 236 373 227 Q390 223 400 230 V260Z" fill="#7E5A3C" />
      <Daisy x={14} y={236} color="#F4A7BB" />
      <Daisy x={30} y={248} />
      <Daisy x={22} y={222} color="#F7D98B" s={0.9} />
      <Daisy x={370} y={240} color="#C9B3E8" />
      <Daisy x={388} y={250} color="#F4A7BB" s={0.9} />
      <Daisy x={384} y={232} />
      {flowers.map(([x, y, c], i) => (
        <Daisy key={i} x={x} y={y} color={c} s={0.7} />
      ))}
      {[
        [70, 110],
        [140, 180],
        [250, 60],
        [330, 120],
        [260, 230],
        [110, 220],
        [40, 90],
        [360, 200],
        [300, 90],
        [170, 70],
      ].map(([x, y], i) => (
        <Tuft key={i} x={x} y={y} color={i % 2 ? '#86BC63' : '#7AB05A'} />
      ))}
      {def.slowZones.map((z, i) => (
        <Bramble key={i} zone={z} i={i} />
      ))}
      {def.blockers.map((b, i) => (i === 0 ? <Stump key={i} c={b} /> : <Rock key={i} c={b} />))}
    </g>
  );
}

function ShallowsBackdrop({ still }: { still?: boolean }) {
  const def = ARENAS['pond-shallows'];
  const w = def.water[0]!;
  return (
    <g>
      <rect width={ARENA_W} height={ARENA_H} fill="#B2D687" />
      {Array.from({ length: 10 }, (_, k) => (
        <rect key={k} x={k * 40} y="0" width="20" height={ARENA_H} fill="#A9CF7D" opacity="0.5" />
      ))}
      <ellipse cx={w.x} cy={w.y} rx={w.rx + 9} ry={w.ry + 8} fill="#E9D9A6" />
      <ellipse cx={w.x} cy={w.y} rx={w.rx + 3} ry={w.ry + 2.5} fill="#D8C48E" />
      <ellipse cx={w.x} cy={w.y} rx={w.rx} ry={w.ry} fill="#79C1E2" />
      <ellipse cx={w.x} cy={w.y + 4} rx={w.rx - 22} ry={w.ry - 18} fill="#6AB5DA" />
      <ellipse cx={w.x} cy={w.y + 6} rx={w.rx - 62} ry={w.ry - 44} fill="#5DABD3" />
      <g className={still ? undefined : 'scene-ripples'}>
        {[
          [110, 80, 14],
          [290, 170, 16],
          [130, 170, 12],
          [280, 74, 12],
          [240, 190, 9],
        ].map(([x, y, r], i) => (
          <path key={i} d={`M${x - r} ${y} Q${x} ${y - r * 0.45} ${x + r} ${y}`} stroke="#D8F0FA" strokeWidth="1.5" fill="none" opacity="0.7" className={still ? undefined : 'scene-ripple'} style={{ animationDelay: `${i * 0.7}s` }} />
        ))}
      </g>
      <path d={`M${w.x - w.rx + 18} ${w.y - 30} Q${w.x - w.rx + 40} ${w.y - w.ry + 10} ${w.x - 60} ${w.y - w.ry + 8}`} stroke="#FFFFFF" strokeWidth="2" fill="none" opacity="0.35" strokeLinecap="round" />
      {def.pads.map((p, i) => (
        <LilyPad key={i} pad={p} i={i} />
      ))}
      {/* shoreline reeds and flowers, kept clear of the paths */}
      <Cattail x={16} y={92} h={24} lean={-3} />
      <Cattail x={24} y={98} h={20} lean={2} />
      <Cattail x={378} y={168} h={22} lean={3} />
      <Cattail x={386} y={176} h={18} lean={-2} />
      <Cattail x={108} y={232} h={20} lean={-2} />
      <Cattail x={300} y={236} h={22} lean={2} />
      <Cattail x={62} y={30} h={18} lean={2} />
      <Daisy x={340} y={238} color="#F4A7BB" s={0.8} />
      <Daisy x={90} y={246} s={0.8} />
      <Daisy x={330} y={20} color="#F7D98B" s={0.8} />
      <Tuft x={150} y={248} />
      <Tuft x={262} y={250} />
      <Tuft x={30} y={160} />
      <Tuft x={372} y={96} />
      {def.blockers.map((b, i) => (
        <Rock key={i} c={b} />
      ))}
    </g>
  );
}

function DeepBackdrop({ still }: { still?: boolean }) {
  const def = ARENAS['pond-deep'];
  const band = def.waterBand!;
  const rows = [58, 104, 150, 196];
  return (
    <g>
      <rect width={ARENA_W} height={ARENA_H} fill="#A9D07F" />
      <rect y={band.top - 6} width={ARENA_W} height={band.bottom - band.top + 12} fill="#E3D19C" />
      <rect y={band.top} width={ARENA_W} height={band.bottom - band.top} fill="#4E97C6" />
      <rect y={band.top + 22} width={ARENA_W} height={band.bottom - band.top - 44} fill="#4589BA" />
      <rect y={band.top + 56} width={ARENA_W} height={band.bottom - band.top - 112} fill="#3F80B2" />
      <path d={`M0 ${band.top} ${Array.from({ length: 20 }, (_, k) => `Q${k * 20 + 10} ${band.top + 4} ${(k + 1) * 20} ${band.top}`).join(' ')}`} stroke="#9FD3EE" strokeWidth="1.5" fill="none" opacity="0.8" />
      <path d={`M0 ${band.bottom} ${Array.from({ length: 20 }, (_, k) => `Q${k * 20 + 10} ${band.bottom - 4} ${(k + 1) * 20} ${band.bottom}`).join(' ')}`} stroke="#9FD3EE" strokeWidth="1.5" fill="none" opacity="0.8" />
      {/* the current, gently drifting to the right */}
      <g className={still ? undefined : 'scene-current'}>
        {rows.map((y, r) =>
          Array.from({ length: 8 }, (_, k) => {
            const x = -70 + k * 70 + (r % 2) * 35;
            return <path key={`${r}-${k}`} d={`M${x} ${y - 5} L${x + 7} ${y} L${x} ${y + 5}`} stroke="#CFEAF7" strokeWidth="2" fill="none" opacity="0.4" strokeLinecap="round" strokeLinejoin="round" />;
          }),
        )}
      </g>
      {[
        [40, 84],
        [210, 120],
        [360, 170],
        [150, 176],
        [300, 52],
      ].map(([x, y], i) => (
        <path key={i} d={`M${x - 10} ${y} Q${x} ${y - 4} ${x + 10} ${y}`} stroke="#BFE3F4" strokeWidth="1.3" fill="none" opacity="0.6" />
      ))}
      {/* banks */}
      {Array.from({ length: 13 }, (_, k) => (
        <Tuft key={`t${k}`} x={14 + k * 31} y={band.top - 9} color={k % 2 ? '#7AB05A' : '#86BC63'} />
      ))}
      {Array.from({ length: 13 }, (_, k) => (
        <Tuft key={`b${k}`} x={24 + k * 31} y={ARENA_H - 6} color={k % 2 ? '#7AB05A' : '#86BC63'} />
      ))}
      <Cattail x={8} y={band.top - 4} h={20} lean={3} />
      <Cattail x={392} y={band.top - 4} h={20} lean={-3} />
      <Cattail x={250} y={ARENA_H - 8} h={18} lean={2} />
      <Daisy x={330} y={ARENA_H - 16} color="#F4A7BB" s={0.8} />
      <Daisy x={130} y={14} color="#F7D98B" s={0.8} />
      {def.blockers.map((b, i) => (
        <ReedClump key={i} c={b} i={i} />
      ))}
    </g>
  );
}

/** Static background for an arena in the 400x260 field. */
export function ArenaBackdrop({ route, reducedMotion }: { route: RouteId; reducedMotion?: boolean }): JSX.Element {
  if (route === 'garden-path') return <GardenBackdrop />;
  if (route === 'pond-shallows') return <ShallowsBackdrop still={reducedMotion} />;
  return <DeepBackdrop still={reducedMotion} />;
}

function Bee({ still }: { still?: boolean }) {
  return (
    <g>
      <ellipse cx="0" cy="14" rx="8" ry="2.5" fill="#000" opacity="0.15" />
      <path d="M-9 1 L-13 2.5 L-9 3.5Z" fill="#3B2A1A" />
      <ellipse cx="-0.5" cy="1" rx="9.5" ry="7.2" fill="#F6C945" stroke="#6B4A12" strokeWidth="1.3" />
      <path d="M-3 -5.6 C-4.2 -1.5 -4.2 3.5 -3 7.6 M2.6 -6.3 C1.4 -2 1.4 4 2.6 8.2" stroke="#3B2A1A" strokeWidth="2.8" fill="none" />
      <circle cx="8.2" cy="0" r="4.6" fill="#3B2A1A" />
      <circle cx="9.6" cy="-1.2" r="1.4" fill="#fff" />
      <path d="M9 -4 Q10 -8 12.5 -8.6 M7 -4.2 Q7 -8 9 -9.6" stroke="#3B2A1A" strokeWidth="1" fill="none" strokeLinecap="round" />
      <g className={still ? undefined : 'scene-flap'}>
        <ellipse cx="-3" cy="-8.2" rx="4.8" ry="6.6" fill="#FFFFFF" opacity="0.8" stroke="#8FB3CB" strokeWidth="0.9" transform="rotate(-18 -3 -8.2)" />
        <ellipse cx="2.4" cy="-8.4" rx="4.2" ry="6" fill="#FFFFFF" opacity="0.8" stroke="#8FB3CB" strokeWidth="0.9" transform="rotate(14 2.4 -8.4)" />
      </g>
      <path d="M-6 -2 Q-3 -4 0 -4" stroke="#FFF1B8" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </g>
  );
}

function Frog({ hop }: { hop: number }) {
  const air = hop > 0.05 && hop < 0.95;
  const lift = Math.sin(hop * Math.PI) * 10;
  return (
    <g>
      <ellipse cx="0" cy={8 + lift} rx={air ? 8 : 11} ry="3" fill="#1F4E6B" opacity={air ? 0.18 : 0.28} />
      {air ? (
        <g>
          <path d="M-7 4 C-14 8 -19 10 -22 9 M-6 -4 C-13 -8 -18 -10 -21 -8" stroke="#5E9E45" strokeWidth="3.4" fill="none" strokeLinecap="round" />
          <path d="M6 5 L10 9 M6 -5 L10 -9" stroke="#5E9E45" strokeWidth="2.6" strokeLinecap="round" />
          <ellipse cx="0" cy="0" rx="11" ry="7.5" fill="#7CC05A" stroke="#3E7A2E" strokeWidth="1.4" />
        </g>
      ) : (
        <g>
          <ellipse cx="-6" cy="5.5" rx="5.5" ry="3.2" fill="#6CB04C" stroke="#3E7A2E" strokeWidth="1.2" />
          <ellipse cx="-6" cy="-5.5" rx="5.5" ry="3.2" fill="#6CB04C" stroke="#3E7A2E" strokeWidth="1.2" />
          <ellipse cx="0" cy="0" rx="10" ry="8.5" fill="#7CC05A" stroke="#3E7A2E" strokeWidth="1.4" />
          <path d="M7 6 L10 7.5 M7 -6 L10 -7.5" stroke="#5E9E45" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      <ellipse cx="-1" cy="0" rx="5.5" ry="4.2" fill="#C8E8A4" opacity="0.8" />
      <circle cx="5" cy="-4.6" r="3.4" fill="#7CC05A" stroke="#3E7A2E" strokeWidth="1.2" />
      <circle cx="5" cy="4.6" r="3.4" fill="#7CC05A" stroke="#3E7A2E" strokeWidth="1.2" />
      <circle cx="5.8" cy="-4.6" r="1.7" fill="#2B2B2B" />
      <circle cx="5.8" cy="4.6" r="1.7" fill="#2B2B2B" />
      <circle cx="6.3" cy="-5.2" r="0.6" fill="#fff" />
      <circle cx="6.3" cy="4" r="0.6" fill="#fff" />
      <path d="M9.6 -2.4 Q11 0 9.6 2.4" stroke="#3E7A2E" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      <circle cx="-4" cy="-2" r="1" fill="#5E9E45" />
      <circle cx="-2" cy="3" r="0.9" fill="#5E9E45" />
    </g>
  );
}

function Log({ half }: { half: number }) {
  const L = half * 2;
  return (
    <g>
      <path d={`M${-half - 8} 4 Q${-half - 14} 0 ${-half - 8} -4`} stroke="#D8F0FA" strokeWidth="1.5" fill="none" opacity="0.7" />
      <path d={`M${-half - 14} 7 Q${-half - 22} 0 ${-half - 14} -7`} stroke="#D8F0FA" strokeWidth="1.2" fill="none" opacity="0.45" />
      <rect x={-half} y="-8" width={L} height="18" rx="8" fill="#1F4E6B" opacity="0.25" transform="translate(1.5 2.5)" />
      <rect x={-half} y="-9" width={L} height="18" rx="8.5" fill="#9A6A3F" stroke="#5E3D22" strokeWidth="1.5" />
      {[-0.6, -0.15, 0.3].map((t, i) => (
        <path key={i} d={`M${-half + 8} ${-4 + i * 3.6} Q${t * half} ${-6 + i * 3.6} ${half - 10} ${-4 + i * 3.6}`} stroke="#7A4F2E" strokeWidth="1.2" fill="none" opacity="0.8" />
      ))}
      <path d={`M${-half + 6} -6 L${half - 12} -6`} stroke="#BC8A5A" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      <ellipse cx={half - 4} cy="0" rx="4.5" ry="8.4" fill="#D9B07E" stroke="#5E3D22" strokeWidth="1.3" />
      <ellipse cx={half - 4} cy="0" rx="2.4" ry="4.8" fill="none" stroke="#B88A57" strokeWidth="1" />
      <path d={`M${-half * 0.2} -9 q3 -5 6 0Z`} fill="#E0705A" stroke="#9E4A36" strokeWidth="0.8" />
      <path d={`M${-half * 0.55} -8.5 q-2 -4 3 -5 q2 3 -3 5Z`} fill="#7FB56A" />
    </g>
  );
}

/** Bee, frog or log at its current position, mirrored by facing. */
export function MoverSprite({ mover, reducedMotion }: { mover: MoverState; reducedMotion?: boolean }): JSX.Element {
  const flip = mover.facing === -1 ? ' scale(-1 1)' : '';
  return (
    <g transform={`translate(${mover.x.toFixed(2)} ${mover.y.toFixed(2)})${flip}`} className={`scene-mover scene-mover--${mover.kind}`}>
      {mover.kind === 'bee' && <Bee still={reducedMotion} />}
      {mover.kind === 'frog' && <Frog hop={mover.hop} />}
      {mover.kind === 'log' && <Log half={mover.half ?? 30} />}
    </g>
  );
}

/** An item on the field; golden finds get a pulsing sparkle halo. */
export function FieldItem({ item, reducedMotion }: { item: Item; reducedMotion?: boolean }): JSX.Element {
  const golden = item.kind === 'golden';
  const fading = golden && item.ttl !== undefined && item.ttl < 2;
  const anim = (name: string) => (reducedMotion ? undefined : name);
  return (
    <g transform={`translate(${item.x.toFixed(2)} ${item.y.toFixed(2)})`} className={fading && !reducedMotion ? 'scene-blink' : undefined} data-item={item.kind}>
      <ellipse cx="0" cy="10" rx={golden ? 10 : 8} ry="2.6" fill="#000" opacity="0.18" />
      {golden && (
        <g>
          <circle r="19" fill="#FFE7A0" opacity="0.28" className={anim('scene-pulse')} />
          <circle r="14" fill="#FFF1C4" opacity="0.5" className={anim('scene-pulse')} style={{ animationDelay: '0.3s' }} />
          <g className={anim('scene-spin')}>
            {[0, 90, 180, 270].map((rot) => (
              <path key={rot} d="M0 -21 L1.4 -17 L0 -13 L-1.4 -17Z" fill="#F6C945" transform={`rotate(${rot})`} />
            ))}
          </g>
        </g>
      )}
      <g className={anim('scene-pop')}>
        <g className={anim('scene-bob')} style={{ animationDelay: `${(item.id % 5) * 0.37}s` }}>
          <g transform={golden ? 'translate(-13 -13) scale(0.8125)' : 'translate(-11 -11) scale(0.6875)'}>
            <ItemGlyph kind={item.kind} />
          </g>
        </g>
      </g>
    </g>
  );
}
