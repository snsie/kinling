// Illustrated eggs for onboarding: idle sway, wobble, crack and open states.
import { useId, type CSSProperties } from 'react';
import { EGGS } from '../game/catalog';
import type { EggType } from '../game/types';
import '../styles/creature.css';

export type EggState = 'idle' | 'wobble' | 'crack' | 'open';

export interface EggProps {
  egg: EggType;
  state?: EggState;
  size?: number | string;
  reducedMotion?: boolean;
  title?: string;
  className?: string;
}

const CX = 100;
const CY = 106;
const RX = 56;
const RY = 72;
const BOTTOM = CY + RY;

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

function eggPath(): string {
  return [
    `M ${CX} ${CY - RY}`,
    `C ${CX + RX * 0.78} ${CY - RY}, ${CX + RX} ${CY + RY * 0.02}, ${CX + RX} ${CY + RY * 0.35}`,
    `C ${CX + RX} ${CY + RY * 0.82}, ${CX + RX * 0.56} ${BOTTOM}, ${CX} ${BOTTOM}`,
    `C ${CX - RX * 0.56} ${BOTTOM}, ${CX - RX} ${CY + RY * 0.82}, ${CX - RX} ${CY + RY * 0.35}`,
    `C ${CX - RX} ${CY + RY * 0.02}, ${CX - RX * 0.78} ${CY - RY}, ${CX} ${CY - RY} Z`,
  ].join(' ');
}

/** Zig-zag crack across the shell. */
function crackPoints(): [number, number][] {
  const y = CY - 6;
  const n = 10;
  const x0 = CX - RX - 6;
  const w = 2 * RX + 12;
  return Array.from({ length: n + 1 }, (_, i) => [x0 + (i * w) / n, y + (i % 2 ? -8 : 6)] as [number, number]);
}

function star5(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function star4(cx: number, cy: number, s: number): string {
  const w = s * 0.28;
  return `M ${cx} ${cy - s} Q ${cx + w} ${cy - w} ${cx + s} ${cy} Q ${cx + w} ${cy + w} ${cx} ${cy + s} Q ${cx - w} ${cy + w} ${cx - s} ${cy} Q ${cx - w} ${cy - w} ${cx} ${cy - s} Z`;
}

function Decor({ egg }: { egg: EggType }) {
  const { spot, shade } = EGGS[egg].shell;
  switch (egg) {
    case 'woodland': {
      const spots = [
        [72, 70, 7],
        [118, 58, 5],
        [132, 92, 8],
        [86, 112, 6],
        [64, 142, 8],
        [120, 136, 6],
        [100, 84, 4],
        [140, 128, 4],
        [80, 52, 4],
        [104, 160, 5],
        [58, 104, 4],
      ];
      return (
        <g>
          {spots.map(([x, y, r], i) => (
            <ellipse key={i} cx={x} cy={y} rx={r!} ry={r! * 0.8} fill={i % 3 === 0 ? shade : spot} opacity={i % 3 === 0 ? 0.55 : 0.85} transform={`rotate(${(i * 37) % 60} ${x} ${y})`} />
          ))}
          <path d={`M ${CX - 3} ${CY - RY + 4} q 8 -14 20 -12 q -4 12 -20 12 Z`} fill="#7fae5c" stroke="#5d8a4a" strokeWidth={1.5} />
        </g>
      );
    }
    case 'aquatic': {
      const wave = (y: number) => {
        let d = `M ${CX - RX - 10} ${y}`;
        for (let x = CX - RX - 10; x < CX + RX + 10; x += 20) d += ` q 5 -7 10 0 q 5 7 10 0`;
        return d;
      };
      return (
        <g fill="none" strokeLinecap="round">
          <path d={wave(CY - 22)} stroke={spot} strokeWidth={6} opacity={0.75} />
          <path d={wave(CY + 16)} stroke={shade} strokeWidth={5} opacity={0.5} />
          <path d={wave(CY + 52)} stroke={spot} strokeWidth={6} opacity={0.75} />
          {[
            [78, 62, 3.5],
            [128, 74, 2.5],
            [118, 132, 3],
            [72, 150, 2.5],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#ffffff" opacity={0.65} />
          ))}
        </g>
      );
    }
    case 'celestial': {
      const stars = [
        [76, 66, 7],
        [126, 82, 5.5],
        [92, 120, 6.5],
        [134, 140, 5],
        [66, 150, 4.5],
        [110, 52, 4],
      ];
      return (
        <g>
          {stars.map(([x, y, r], i) => (
            <path key={i} d={star5(x!, y!, r!)} fill={spot} stroke="#d6a93c" strokeWidth={1} strokeLinejoin="round" />
          ))}
          {[
            [100, 96, 1.6],
            [58, 116, 1.4],
            [144, 110, 1.6],
            [118, 162, 1.4],
            [86, 88, 1.2],
            [138, 60, 1.2],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#fffbe8" />
          ))}
          <path d={`M ${CX - RX} ${CY + 30} Q ${CX} ${CY + 2} ${CX + RX} ${CY + 30}`} stroke={shade} strokeWidth={3} fill="none" opacity={0.25} />
        </g>
      );
    }
  }
}

function Shell({ egg, ids }: { egg: EggType; ids: { clip: string; shine: string } }) {
  const { base, shade } = EGGS[egg].shell;
  const d = eggPath();
  return (
    <g>
      <path d={d} fill={base} />
      <g clipPath={`url(#${ids.clip})`}>
        <Decor egg={egg} />
        <ellipse cx={CX + RX * 0.5} cy={CY + RY * 0.55} rx={RX * 0.7} ry={RY * 0.6} fill={shade} opacity={0.16} />
      </g>
      <ellipse className="egg-glint" cx={CX - RX * 0.4} cy={CY - RY * 0.42} rx={11} ry={20} fill={`url(#${ids.shine})`} transform={`rotate(-22 ${CX - RX * 0.4} ${CY - RY * 0.42})`} />
      <path d={d} fill="none" stroke={shade} strokeWidth={2.6} />
    </g>
  );
}

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function Egg({ egg, state = 'idle', size, reducedMotion = false, title, className }: EggProps) {
  const uid = sanitizeId(useId());
  const ids = { clip: `egg-${uid}-clip`, shine: `egg-${uid}-shine`, top: `egg-${uid}-top`, bottom: `egg-${uid}-bottom` };
  const { shade } = EGGS[egg].shell;
  const zig = crackPoints();
  const zigLine = `M ${zig.map(([x, y]) => `${x} ${y}`).join(' L ')}`;
  const topClip = `M ${CX - RX - 20} 0 L ${CX + RX + 20} 0 L ${[...zig].reverse().map(([x, y]) => `${x} ${y}`).join(' L ')} Z`;
  const rimBand = `M ${zig.map(([x, y]) => `${x} ${y}`).join(' L ')} L ${[...zig].reverse().map(([x, y]) => `${x} ${y + 9}`).join(' L ')} Z`;
  const bottomClip = `M ${zig.map(([x, y]) => `${x} ${y}`).join(' L ')} L ${CX + RX + 20} 200 L ${CX - RX - 20} 200 Z`;
  const rootClass = ['egg', `egg--${state}`, `egg--${egg}`, reducedMotion ? 'egg--still' : ''].filter(Boolean).join(' ');
  const style: CSSProperties = { width: size ?? '100%', height: 'auto', overflow: 'visible', display: 'block' };
  const open = state === 'open';

  return (
    <svg
      viewBox="0 0 200 200"
      className={className ? `egg-svg ${className}` : 'egg-svg'}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={ids.clip}>
          <path d={eggPath()} />
        </clipPath>
        <clipPath id={ids.top}>
          <path d={topClip} />
        </clipPath>
        <clipPath id={ids.bottom}>
          <path d={bottomClip} />
        </clipPath>
        <radialGradient id={ids.shine} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      </defs>
      <g className={rootClass}>
        <ellipse cx={CX} cy={BOTTOM + 4} rx={RX * 0.85} ry={7} fill="rgba(70, 45, 25, 0.16)" />
        <g transform={`translate(${CX} ${BOTTOM})`}>
          <g className="egg-sway kin-pivot">
            <g transform={`translate(${-CX} ${-BOTTOM})`}>
              {open ? (
                <>
                  <g clipPath={`url(#${ids.bottom})`}>
                    <Shell egg={egg} ids={ids} />
                    {/* The inside of the shell, seen along the broken rim. */}
                    <path d={rimBand} clipPath={`url(#${ids.clip})`} fill={mix(EGGS[egg].shell.base, '#fffaf0', 0.55)} stroke={shade} strokeWidth={1.2} strokeLinejoin="round" />
                  </g>
                  <path d={zigLine} clipPath={`url(#${ids.clip})`} fill="none" stroke={shade} strokeWidth={2.6} strokeLinejoin="round" />
                  <g transform={`translate(${CX + RX * 0.3} ${CY - 6})`}>
                    <g className="egg-cap" style={reducedMotion ? { transform: 'translate(-18px, -34px) rotate(-18deg)' } : undefined}>
                      <g transform={`translate(${-(CX + RX * 0.3)} ${-(CY - 6)})`}>
                        <g clipPath={`url(#${ids.top})`}>
                          <Shell egg={egg} ids={ids} />
                        </g>
                        <path d={zigLine} clipPath={`url(#${ids.clip})`} fill="none" stroke={shade} strokeWidth={2.6} strokeLinejoin="round" />
                      </g>
                    </g>
                  </g>
                  {[
                    [52, 70, 7],
                    [150, 58, 6],
                    [160, 104, 4.5],
                    [40, 112, 4.5],
                    [100, 40, 5],
                  ].map(([x, y, s], i) => (
                    <path key={i} className="egg-sparkle" style={{ animationDelay: `${i * 0.2}s` }} d={star4(x!, y!, s!)} fill="#f7d36b" stroke="#e0ac3a" strokeWidth={0.8} />
                  ))}
                </>
              ) : (
                <>
                  <Shell egg={egg} ids={ids} />
                  {state === 'crack' && (
                    <g fill="none" stroke={shade} strokeWidth={2.6} strokeLinejoin="round" strokeLinecap="round">
                      <path className="egg-crack-line" d={zigLine} clipPath={`url(#${ids.clip})`} />
                      <path className="egg-crack-line" d={`M ${CX + 18} ${CY - 2} l 6 12 l -4 8`} />
                      <path className="egg-crack-line" d={`M ${CX - 30} ${CY - 12} l -4 -10 l 5 -6`} />
                    </g>
                  )}
                </>
              )}
            </g>
          </g>
        </g>
      </g>
    </svg>
  );
}
