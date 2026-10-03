// Layered SVG creature. Every part is drawn around its own anchor point, and
// anchors are computed from the proportions and life stage, so any trait
// combination stays attached and every animation keeps working.
import { useId, type CSSProperties, type ReactNode } from 'react';
import { COLORS } from '../game/catalog';
import type { Mood } from '../game/needs';
import type { CreatureAnim } from '../game/outcome';
import type { Appearance, EarId, LifeStage, TailId } from '../game/types';
import '../styles/creature.css';

export interface CreatureProps {
  appearance: Appearance;
  stage: LifeStage;
  anim?: CreatureAnim;
  mood?: Mood;
  reducedMotion?: boolean;
  facing?: 1 | -1;
  moving?: boolean;
  size?: number | string;
  title?: string;
  className?: string;
  /** Render only a <g> (no outer <svg>) so it can be embedded inside another SVG scene. */
  asGroup?: boolean;
}

const INK = '#3b2f2a';
const GROUND = 184;
const CX = 100;

// ---------------------------------------------------------------------------
// Color helpers

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

interface Palette {
  base: string;
  shade: string;
  light: string;
  accent: string;
  accentShade: string;
  mark: string;
  markLight: string;
  glow: string;
}

function paletteFor(a: Appearance): Palette {
  const body = COLORS[a.bodyColor];
  const accent = COLORS[a.accentColor];
  const mark = COLORS[a.markingColor];
  // Markings that match the coat would vanish, so nudge them darker.
  const markBase = a.markingColor === a.bodyColor ? body.shade : mark.base;
  return {
    base: body.base,
    shade: body.shade,
    light: body.light,
    accent: a.accentColor === a.bodyColor ? body.light : accent.base,
    accentShade: accent.shade,
    mark: markBase,
    markLight: mark.light,
    glow: mix(mark.light, '#ffffff', 0.55),
  };
}

// ---------------------------------------------------------------------------
// Layout

const STAGE: Record<LifeStage, { body: number; head: number; leg: number }> = {
  hatchling: { body: 0.8, head: 1.1, leg: 0.65 },
  sprout: { body: 1, head: 1, leg: 1 },
  grown: { body: 1.1, head: 0.96, leg: 1.3 },
};

interface Layout {
  bodyRx: number;
  bodyRy: number;
  bodyCy: number;
  bodyBottom: number;
  headRx: number;
  headRy: number;
  headR: number;
  headCy: number;
  neckY: number;
  legLen: number;
  footRx: number;
  footRy: number;
  feetY: number;
  footDx: number;
  /** Body-relative unit (≈1 for an average body). */
  k: number;
  /** Head-relative unit (≈1 for an average head). */
  e: number;
  fit: number;
}

const EAR_REACH: Record<EarId, number> = { rounded: 26, floppy: 8, leaf: 38, fluffy: 46 };
const TAIL_REACH: Record<TailId, number> = { short: 20, curled: 34, paddle: 52 };

function layoutFor(a: Appearance, stage: LifeStage): Layout {
  const s = STAGE[stage];
  const { plump: p, head: h, height: t } = a.proportions;
  const bodyRx = (37 + 22 * p) * s.body;
  const bodyRy = (30 + 17 * t) * s.body;
  const legLen = (3 + 10 * t) * s.leg;
  const footRy = 7.5 * Math.sqrt(s.body);
  const feetY = GROUND - footRy;
  const bodyBottom = GROUND - 3 - legLen;
  const bodyCy = bodyBottom - bodyRy;
  const headR = (30 + 15 * h) * s.head;
  const headRx = headR * 1.1;
  const headRy = headR * 0.95;
  const headCy = bodyCy - bodyRy * 0.62 - headRy * 0.6;
  const k = bodyRx / 48;
  const e = headR / 37;

  // Fit everything (ears, horns, tail, wings) inside the 200x200 box.
  const earTop = EAR_REACH[a.ears] * e;
  const top = Math.min(headCy - headRy - Math.max(earTop * 0.85, a.horns ? 15 * e : 0, a.fins ? 30 * e : 0), bodyCy - bodyRy - (a.wings ? 36 * k : 0));
  const wingReach = a.wings ? bodyRx * 0.42 + 47 * k : 0;
  const right = Math.max(CX + headRx + 4, CX + bodyRx * 0.74 + TAIL_REACH[a.tail] * k, CX + bodyRx + 4, CX + wingReach);
  const left = Math.min(CX - headRx - 4, CX - bodyRx - 4, CX - wingReach);
  const fit = Math.min(1, (GROUND - 6) / (GROUND - top), 98 / (right - CX), 96 / (CX - left));
  return {
    bodyRx,
    bodyRy,
    bodyCy,
    bodyBottom,
    headRx,
    headRy,
    headR,
    headCy,
    neckY: headCy + headRy * 0.75,
    legLen,
    footRx: (10.5 + 3 * p) * s.body,
    footRy,
    feetY,
    footDx: bodyRx * 0.45,
    k,
    e,
    fit,
  };
}

/** Soft pear-shaped body, widest a little below the middle. */
function bodyPath(cx: number, cy: number, rx: number, ry: number): string {
  const top = cy - ry;
  const bottom = cy + ry;
  return [
    `M ${cx} ${top}`,
    `C ${cx + rx * 0.72} ${top}, ${cx + rx} ${cy - ry * 0.45}, ${cx + rx} ${cy + ry * 0.15}`,
    `C ${cx + rx} ${cy + ry * 0.75}, ${cx + rx * 0.66} ${bottom}, ${cx} ${bottom}`,
    `C ${cx - rx * 0.66} ${bottom}, ${cx - rx} ${cy + ry * 0.75}, ${cx - rx} ${cy + ry * 0.15}`,
    `C ${cx - rx} ${cy - ry * 0.45}, ${cx - rx * 0.72} ${top}, ${cx} ${top} Z`,
  ].join(' ');
}

/** Rounded head with full cheeks. */
function headPath(cx: number, cy: number, rx: number, ry: number): string {
  return [
    `M ${cx} ${cy - ry}`,
    `C ${cx + rx * 0.64} ${cy - ry}, ${cx + rx} ${cy - ry * 0.55}, ${cx + rx} ${cy + ry * 0.05}`,
    `C ${cx + rx} ${cy + ry * 0.64}, ${cx + rx * 0.62} ${cy + ry}, ${cx} ${cy + ry}`,
    `C ${cx - rx * 0.62} ${cy + ry}, ${cx - rx} ${cy + ry * 0.64}, ${cx - rx} ${cy + ry * 0.05}`,
    `C ${cx - rx} ${cy - ry * 0.55}, ${cx - rx * 0.64} ${cy - ry}, ${cx} ${cy - ry} Z`,
  ].join(' ');
}

/** A group whose local origin is (x, y): animations pivot there. */
function Pivot({ x, y, className, children, rotate, scaleX }: { x: number; y: number; className?: string; children: ReactNode; rotate?: number; scaleX?: number }) {
  const extra = `${rotate ? ` rotate(${rotate})` : ''}${scaleX && scaleX !== 1 ? ` scale(${scaleX} 1)` : ''}`;
  return (
    <g transform={`translate(${r(x)} ${r(y)})${extra}`}>
      <g className={className ? `kin-pivot ${className}` : undefined}>{children}</g>
    </g>
  );
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

function star4(cx: number, cy: number, size: number): string {
  const s = size;
  const w = s * 0.28;
  return `M ${cx} ${cy - s} Q ${cx + w} ${cy - w} ${cx + s} ${cy} Q ${cx + w} ${cy + w} ${cx} ${cy + s} Q ${cx - w} ${cy + w} ${cx - s} ${cy} Q ${cx - w} ${cy - w} ${cx} ${cy - s} Z`;
}

// ---------------------------------------------------------------------------
// Parts

interface Ids {
  bodyClip: string;
  headClip: string;
  glow: string;
  wing: string;
  belly: string;
  sheen: string;
  paddleClip: string;
}

function Shadow({ L }: { L: Layout }) {
  return <ellipse className="kin-shadow" cx={CX} cy={GROUND + 1.5} rx={L.bodyRx * 1.05} ry={6.5} fill="rgba(70, 45, 25, 0.16)" />;
}

function EarShape({ type, pal, e }: { type: EarId; pal: Palette; e: number }) {
  const sw = 2.4;
  switch (type) {
    case 'rounded':
      return (
        <g>
          <circle cx={0} cy={-12 * e} r={14 * e} fill={pal.base} stroke={pal.shade} strokeWidth={sw} />
          <circle cx={0} cy={-11.5 * e} r={8.5 * e} fill={pal.accent} opacity={0.9} />
        </g>
      );
    case 'floppy': {
      const outer = `M ${-7 * e} ${2 * e} C ${-9 * e} ${-12 * e}, ${-15 * e} ${-30 * e}, ${-8 * e} ${-42 * e} C ${-3 * e} ${-49 * e}, ${8 * e} ${-47 * e}, ${10 * e} ${-38 * e} C ${12 * e} ${-26 * e}, ${8 * e} ${-10 * e}, ${7 * e} ${2 * e} Z`;
      const inner = `M ${-3 * e} ${-4 * e} C ${-5 * e} ${-15 * e}, ${-9.5 * e} ${-29 * e}, ${-4.5 * e} ${-38 * e} C ${-1 * e} ${-43 * e}, ${5 * e} ${-41 * e}, ${6 * e} ${-35 * e} C ${7 * e} ${-25 * e}, ${4 * e} ${-13 * e}, ${3 * e} ${-4 * e} Z`;
      return (
        <g>
          <path d={outer} fill={pal.base} stroke={pal.shade} strokeWidth={sw} strokeLinejoin="round" />
          <path d={inner} fill={pal.accent} opacity={0.85} />
        </g>
      );
    }
    case 'leaf': {
      const leafFill = mix(pal.base, '#8fbf6a', 0.22);
      const outer = `M 0 ${2 * e} C ${-15 * e} ${-6 * e}, ${-15 * e} ${-26 * e}, ${1 * e} ${-40 * e} C ${15 * e} ${-26 * e}, ${14 * e} ${-6 * e}, 0 ${2 * e} Z`;
      const veins = [
        `M 0 ${-2 * e} Q ${1 * e} ${-18 * e} ${1 * e} ${-34 * e}`,
        `M ${0.4 * e} ${-11 * e} L ${-6 * e} ${-17 * e}`,
        `M ${0.6 * e} ${-11 * e} L ${7 * e} ${-17 * e}`,
        `M ${0.8 * e} ${-20 * e} L ${-5 * e} ${-26 * e}`,
        `M ${0.9 * e} ${-20 * e} L ${6 * e} ${-26 * e}`,
      ];
      return (
        <g>
          <path d={outer} fill={leafFill} stroke={pal.shade} strokeWidth={sw} strokeLinejoin="round" />
          <path d={`M 0 ${-1 * e} C ${-8 * e} ${-8 * e}, ${-9 * e} ${-22 * e}, ${0.5 * e} ${-33 * e} C ${2 * e} ${-20 * e}, ${1 * e} ${-8 * e}, 0 ${-1 * e} Z`} fill={pal.light} opacity={0.5} />
          {veins.map((d, i) => (
            <path key={i} d={d} stroke={pal.shade} strokeWidth={i === 0 ? 1.6 : 1.2} fill="none" strokeLinecap="round" opacity={0.75} />
          ))}
        </g>
      );
    }
    case 'fluffy': {
      const outer = [
        `M ${-14 * e} ${2 * e}`,
        `C ${-18 * e} ${-12 * e}, ${-16 * e} ${-27 * e}, ${-8 * e} ${-37 * e}`,
        `L ${-10 * e} ${-43 * e} L ${-4 * e} ${-40 * e} L ${-1.5 * e} ${-48 * e} L ${2.5 * e} ${-41 * e} L ${7.5 * e} ${-44 * e} L ${6.5 * e} ${-36 * e}`,
        `C ${13 * e} ${-27 * e}, ${16 * e} ${-12 * e}, ${13 * e} ${2 * e} Z`,
      ].join(' ');
      const inner = `M ${-8 * e} ${-1 * e} C ${-10 * e} ${-11 * e}, ${-8 * e} ${-24 * e}, ${-2 * e} ${-32 * e} L ${0} ${-37 * e} L ${2 * e} ${-32 * e} C ${7 * e} ${-24 * e}, ${9 * e} ${-11 * e}, ${7 * e} ${-1 * e} Z`;
      const fluff = [
        `M ${-4 * e} ${-6 * e} q ${2 * e} ${-6 * e} ${-1 * e} ${-11 * e}`,
        `M ${2 * e} ${-8 * e} q ${-2 * e} ${-6 * e} ${1 * e} ${-12 * e}`,
        `M ${-1 * e} ${-18 * e} q ${2 * e} ${-5 * e} ${0} ${-10 * e}`,
      ];
      return (
        <g>
          <path d={outer} fill={pal.base} stroke={pal.shade} strokeWidth={sw} strokeLinejoin="round" />
          <path d={inner} fill={pal.accent} opacity={0.9} />
          {fluff.map((d, i) => (
            <path key={i} d={d} stroke="#ffffff" strokeWidth={1.6} fill="none" strokeLinecap="round" opacity={0.8} />
          ))}
        </g>
      );
    }
  }
}

function earPlacement(type: EarId, L: Layout): { x: number; y: number; angle: number } {
  switch (type) {
    case 'rounded':
      return { x: CX - L.headRx * 0.6, y: L.headCy - L.headRy * 0.6, angle: -30 };
    case 'floppy':
      return { x: CX - L.headRx * 0.78, y: L.headCy - L.headRy * 0.42, angle: -158 };
    case 'leaf':
      return { x: CX - L.headRx * 0.5, y: L.headCy - L.headRy * 0.72, angle: -28 };
    case 'fluffy':
      return { x: CX - L.headRx * 0.52, y: L.headCy - L.headRy * 0.66, angle: -22 };
  }
}

function Ears({ type, L, pal }: { type: EarId; L: Layout; pal: Palette }) {
  const { x, y, angle } = earPlacement(type, L);
  return (
    <g className={`kin-ears kin-ears--${type}`}>
      <Pivot x={x} y={y} rotate={angle}>
        <g className="kin-pivot kin-ear kin-ear-l">
          <EarShape type={type} pal={pal} e={L.e} />
        </g>
      </Pivot>
      <Pivot x={2 * CX - x} y={y} rotate={-angle}>
        <g className="kin-pivot kin-ear kin-ear-r">
          <g transform="scale(-1 1)">
            <EarShape type={type} pal={pal} e={L.e} />
          </g>
        </g>
      </Pivot>
    </g>
  );
}

function TailShape({ type, pal, k, ids }: { type: TailId; pal: Palette; k: number; ids: Ids }) {
  switch (type) {
    case 'short':
      return (
        <g>
          <circle cx={8 * k} cy={-3 * k} r={11 * k} fill={pal.base} stroke={pal.shade} strokeWidth={2.4} />
          <circle cx={11 * k} cy={-6 * k} r={5.5 * k} fill={pal.light} opacity={0.75} />
          <path d={`M ${15 * k} ${-1 * k} q ${3 * k} ${2 * k} ${2 * k} ${5 * k}`} stroke={pal.shade} strokeWidth={1.3} fill="none" strokeLinecap="round" opacity={0.6} />
        </g>
      );
    case 'curled': {
      const d = `M ${-4 * k} ${2 * k} C ${12 * k} ${4 * k}, ${27 * k} ${-4 * k}, ${28 * k} ${-18 * k} C ${29 * k} ${-31 * k}, ${15 * k} ${-37 * k}, ${8 * k} ${-29 * k} C ${2 * k} ${-22 * k}, ${9 * k} ${-14 * k}, ${16 * k} ${-19 * k}`;
      return (
        <g>
          <path d={d} stroke={pal.shade} strokeWidth={11 * k + 4.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={d} stroke={pal.base} strokeWidth={11 * k} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d={`M ${6 * k} ${-1 * k} C ${16 * k} ${-1 * k}, ${23 * k} ${-8 * k}, ${24 * k} ${-17 * k}`} stroke={pal.light} strokeWidth={3 * k} fill="none" strokeLinecap="round" opacity={0.75} />
        </g>
      );
    }
    case 'paddle': {
      const fill = mix(pal.base, pal.shade, 0.45);
      const edge = mix(pal.shade, INK, 0.25);
      const cx = 30 * k;
      const cy = 4 * k;
      const rx = 22 * k;
      const ry = 12 * k;
      const hatch: string[] = [];
      for (let i = -5; i <= 5; i++) {
        hatch.push(`M ${cx + i * 6 * k - 14 * k} ${cy - ry} L ${cx + i * 6 * k + 14 * k} ${cy + ry}`);
        hatch.push(`M ${cx + i * 6 * k + 14 * k} ${cy - ry} L ${cx + i * 6 * k - 14 * k} ${cy + ry}`);
      }
      return (
        <g>
          <rect x={-4 * k} y={-6 * k} width={16 * k} height={12 * k} rx={6 * k} fill={pal.base} stroke={pal.shade} strokeWidth={2.4} />
          <g transform={`rotate(14 ${cx} ${cy})`}>
            <clipPath id={ids.paddleClip}>
              <ellipse cx={cx} cy={cy} rx={rx} ry={ry} />
            </clipPath>
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={fill} />
            <g clipPath={`url(#${ids.paddleClip})`} stroke={edge} strokeWidth={1.1} opacity={0.45}>
              {hatch.map((d, i) => (
                <path key={i} d={d} />
              ))}
            </g>
            <ellipse cx={cx - 4 * k} cy={cy - 4 * k} rx={rx * 0.55} ry={ry * 0.35} fill="#ffffff" opacity={0.18} />
            <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={edge} strokeWidth={2.4} />
          </g>
        </g>
      );
    }
  }
}

function Tail({ type, L, pal, ids }: { type: TailId; L: Layout; pal: Palette; ids: Ids }) {
  const x = CX + L.bodyRx * 0.74;
  const y = L.bodyCy + L.bodyRy * 0.48;
  return (
    <Pivot x={x} y={y} className={`kin-tail kin-tail--${type}`}>
      <TailShape type={type} pal={pal} k={L.k} ids={ids} />
    </Pivot>
  );
}

function WingShape({ k, ids }: { k: number; ids: Ids }) {
  const upper = `M 0 0 C ${-8 * k} ${-20 * k}, ${-32 * k} ${-38 * k}, ${-42 * k} ${-26 * k} C ${-50 * k} ${-15 * k}, ${-28 * k} ${-1 * k}, 0 0 Z`;
  const lower = `M ${-1 * k} ${3 * k} C ${-14 * k} ${6 * k}, ${-32 * k} ${13 * k}, ${-30 * k} ${22 * k} C ${-27 * k} ${30 * k}, ${-10 * k} ${17 * k}, 0 ${5 * k} Z`;
  const veins = [
    `M 0 0 Q ${-18 * k} ${-14 * k} ${-38 * k} ${-24 * k}`,
    `M 0 0 Q ${-20 * k} ${-6 * k} ${-36 * k} ${-12 * k}`,
    `M 0 ${4 * k} Q ${-14 * k} ${10 * k} ${-26 * k} ${19 * k}`,
  ];
  return (
    <g>
      <path d={upper} fill={`url(#${ids.wing})`} stroke="#b7a6e6" strokeWidth={1.8} strokeLinejoin="round" />
      <path d={lower} fill={`url(#${ids.wing})`} stroke="#b7a6e6" strokeWidth={1.8} strokeLinejoin="round" />
      {veins.map((d, i) => (
        <path key={i} d={d} stroke="#ffffff" strokeWidth={1.2} fill="none" opacity={0.8} strokeLinecap="round" />
      ))}
      <circle cx={-30 * k} cy={-24 * k} r={2.2 * k} fill="#ffffff" opacity={0.85} />
    </g>
  );
}

function Wings({ L, ids }: { L: Layout; ids: Ids }) {
  const x = CX - L.bodyRx * 0.42;
  const y = L.bodyCy - L.bodyRy * 0.5;
  return (
    <g className="kin-wings">
      <Pivot x={x} y={y} className="kin-wing kin-wing-l">
        <WingShape k={L.k} ids={ids} />
      </Pivot>
      <Pivot x={2 * CX - x} y={y} className="kin-wing kin-wing-r">
        <g transform="scale(-1 1)">
          <WingShape k={L.k} ids={ids} />
        </g>
      </Pivot>
    </g>
  );
}

function finFill(pal: Palette): string {
  return mix(pal.base, pal.accent, 0.22);
}

/** Frilly crest rising behind the head: the front view of a fin running along the back. */
function FinCrest({ L, pal }: { L: Layout; pal: Palette }) {
  const e = L.e;
  const fan = [
    `M ${-17 * e} ${6 * e}`,
    `C ${-24 * e} ${-8 * e}, ${-20 * e} ${-24 * e}, ${-12 * e} ${-30 * e}`,
    `Q ${-9 * e} ${-22 * e} ${-5 * e} ${-24 * e}`,
    `Q ${-4 * e} ${-36 * e} ${1 * e} ${-38 * e}`,
    `Q ${4 * e} ${-27 * e} ${7 * e} ${-27 * e}`,
    `Q ${12 * e} ${-33 * e} ${15 * e} ${-28 * e}`,
    `C ${22 * e} ${-20 * e}, ${23 * e} ${-6 * e}, ${17 * e} ${6 * e} Z`,
  ].join(' ');
  const rays = [-13, -6, 1, 8, 14].map((tx, i) => `M ${tx * 0.25 * e} ${6 * e} L ${tx * e} ${[-27, -22, -35, -25, -25][i]! * e}`);
  return (
    <Pivot x={CX} y={L.headCy - L.headRy * 0.72} className="kin-fin">
      <path d={fan} fill={finFill(pal)} stroke={pal.shade} strokeWidth={2.2} strokeLinejoin="round" />
      {rays.map((d, i) => (
        <path key={i} d={d} stroke={pal.shade} strokeWidth={1.3} opacity={0.55} strokeLinecap="round" />
      ))}
    </Pivot>
  );
}

/** Smaller fin lobe on the back, peeking out behind the shoulder. */
function BackFin({ L, pal }: { L: Layout; pal: Palette }) {
  const k = L.k;
  const lobe = `M ${-10 * k} ${4 * k} C ${-12 * k} ${-8 * k}, ${-4 * k} ${-20 * k}, ${4 * k} ${-22 * k} Q ${6 * k} ${-15 * k} ${10 * k} ${-16 * k} Q ${14 * k} ${-6 * k} ${12 * k} ${4 * k} Z`;
  return (
    <Pivot x={CX + L.bodyRx * 0.6} y={L.bodyCy - L.bodyRy * 0.62} rotate={28} className="kin-fin kin-fin-back">
      <path d={lobe} fill={finFill(pal)} stroke={pal.shade} strokeWidth={2.2} strokeLinejoin="round" />
      <path d={`M ${-2 * k} ${4 * k} L ${2 * k} ${-18 * k} M ${3 * k} ${4 * k} L ${9 * k} ${-12 * k}`} stroke={pal.shade} strokeWidth={1.2} opacity={0.55} strokeLinecap="round" />
    </Pivot>
  );
}

function Horns({ L }: { L: Layout }) {
  const e = L.e;
  const horn = `M ${-5.5 * e} ${3 * e} C ${-6.5 * e} ${-5 * e}, ${-4 * e} ${-12 * e}, ${1.5 * e} ${-15 * e} C ${3.5 * e} ${-10 * e}, ${6 * e} ${-4 * e}, ${5.5 * e} ${3 * e} Z`;
  const ridges = `M ${-4.5 * e} ${-2 * e} q ${4.5 * e} ${-2 * e} ${9 * e} ${0} M ${-3.5 * e} ${-7 * e} q ${3.5 * e} ${-1.5 * e} ${6.5 * e} ${0}`;
  const dx = L.headRx * 0.27;
  const y = L.headCy - L.headRy * 0.86;
  return (
    <g className="kin-horns">
      {[-1, 1].map((side) => (
        <g key={side} transform={`translate(${r(CX + side * dx)} ${r(y)}) scale(${-side} 1) rotate(-10)`}>
          <path d={horn} fill="#f4e4c4" stroke="#b39466" strokeWidth={2} strokeLinejoin="round" />
          <path d={ridges} stroke="#c9ad7e" strokeWidth={1.2} fill="none" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

function Legs({ L, pal }: { L: Layout; pal: Palette }) {
  const top = L.bodyBottom - 10;
  const h = L.feetY - top;
  const w = L.footRx * 1.15;
  return (
    <g>
      {[-1, 1].map((side) => (
        <rect key={side} x={CX + side * L.footDx - w / 2} y={top} width={w} height={h} rx={w / 2} fill={pal.base} stroke={pal.shade} strokeWidth={2.4} />
      ))}
    </g>
  );
}

function Feet({ L, pal }: { L: Layout; pal: Palette }) {
  return (
    <g className="kin-feet">
      {[-1, 1].map((side) => {
        const x = CX + side * L.footDx;
        const { footRx: rx, footRy: ry, feetY: y } = L;
        return (
          <g key={side} className={`kin-foot kin-foot-${side < 0 ? 'l' : 'r'}`}>
            <path
              d={`M ${x - rx} ${y + ry * 0.35} C ${x - rx} ${y - ry * 0.9}, ${x + rx} ${y - ry * 0.9}, ${x + rx} ${y + ry * 0.35} C ${x + rx} ${y + ry}, ${x - rx} ${y + ry}, ${x - rx} ${y + ry * 0.35} Z`}
              fill={pal.base}
              stroke={pal.shade}
              strokeWidth={2.4}
              strokeLinejoin="round"
            />
            <ellipse cx={x - rx * 0.25} cy={y - ry * 0.2} rx={rx * 0.4} ry={ry * 0.28} fill="#ffffff" opacity={0.28} />
            <path d={`M ${x - rx * 0.3} ${y + ry * 0.75} v ${-ry * 0.55} M ${x + rx * 0.3} ${y + ry * 0.75} v ${-ry * 0.55}`} stroke={pal.shade} strokeWidth={1.4} strokeLinecap="round" opacity={0.75} />
          </g>
        );
      })}
    </g>
  );
}

function Arms({ L, pal }: { L: Layout; pal: Palette }) {
  const k = L.k;
  return (
    <g className="kin-arms">
      {[-1, 1].map((side) => (
        <Pivot key={side} x={CX + side * L.bodyRx * 0.8} y={L.bodyCy - L.bodyRy * 0.2} rotate={side * 26} className={`kin-arm kin-arm-${side < 0 ? 'l' : 'r'}`}>
          <path
            d={`M ${-6 * k} 0 C ${-7.5 * k} ${8 * k}, ${-6 * k} ${17 * k}, 0 ${18 * k} C ${6 * k} ${17 * k}, ${7.5 * k} ${8 * k}, ${6 * k} 0 Z`}
            fill={pal.base}
            stroke={pal.shade}
            strokeWidth={2.3}
            strokeLinejoin="round"
          />
          <path d={`M ${-2.4 * k} ${15.5 * k} v ${-2.6 * k} M ${2.4 * k} ${15.5 * k} v ${-2.6 * k}`} stroke={pal.shade} strokeWidth={1.2} strokeLinecap="round" opacity={0.7} />
        </Pivot>
      ))}
    </g>
  );
}

interface MarkingSpec {
  spots: { x: number; y: number; r: number }[];
  stripes: string[];
}

function bodyMarkings(L: Layout, pattern: Appearance['pattern']): MarkingSpec {
  const rx = L.bodyRx;
  const ry = L.bodyRy;
  const cy = L.bodyCy;
  if (pattern === 'spots') {
    const rel = [
      [-0.68, -0.3, 0.18],
      [-0.86, 0.22, 0.13],
      [-0.4, -0.74, 0.12],
      [0.7, -0.24, 0.16],
      [0.88, 0.26, 0.12],
      [0.38, -0.72, 0.13],
    ];
    return { spots: rel.map(([dx, dy, rr]) => ({ x: CX + dx! * rx, y: cy + dy! * ry, r: rr! * rx })), stripes: [] };
  }
  if (pattern === 'stripes') {
    const stripes: string[] = [];
    for (const side of [-1, 1]) {
      for (const dy of [-0.5, -0.1, 0.3]) {
        const y = cy + dy * ry;
        stripes.push(`M ${CX + side * rx * 1.08} ${y - 2} Q ${CX + side * rx * 0.86} ${y + 1} ${CX + side * rx * 0.62} ${y + 5}`);
      }
    }
    stripes.push(`M ${CX - rx * 0.22} ${cy - ry * 1.02} Q ${CX} ${cy - ry * 0.82} ${CX + rx * 0.22} ${cy - ry * 1.02}`);
    return { spots: [], stripes };
  }
  return { spots: [], stripes: [] };
}

function headMarkings(L: Layout, pattern: Appearance['pattern']): MarkingSpec {
  const rx = L.headRx;
  const ry = L.headRy;
  const cy = L.headCy;
  if (pattern === 'spots') {
    const rel = [
      [-0.62, -0.5, 0.15],
      [-0.36, -0.8, 0.09],
      [0.64, -0.44, 0.13],
      [0.2, -0.88, 0.1],
    ];
    return { spots: rel.map(([dx, dy, rr]) => ({ x: CX + dx! * rx, y: cy + dy! * ry, r: rr! * rx })), stripes: [] };
  }
  if (pattern === 'stripes') {
    const stripes: string[] = [];
    for (const dx of [-0.26, 0, 0.26]) {
      stripes.push(`M ${CX + dx * rx} ${cy - ry * 1.05} L ${CX + dx * rx * 0.85} ${cy - ry * (dx === 0 ? 0.6 : 0.68)}`);
    }
    for (const side of [-1, 1]) {
      stripes.push(`M ${CX + side * rx * 1.06} ${cy + ry * 0.0} L ${CX + side * rx * 0.8} ${cy + ry * 0.06}`);
      stripes.push(`M ${CX + side * rx * 1.04} ${cy + ry * 0.2} L ${CX + side * rx * 0.82} ${cy + ry * 0.22}`);
    }
    return { spots: [], stripes };
  }
  return { spots: [], stripes: [] };
}

function MarkingShapes({ spec, color, width }: { spec: MarkingSpec; color: string; width: number }) {
  return (
    <g>
      {spec.spots.map((s, i) => (
        <ellipse key={`s${i}`} cx={s.x} cy={s.y} rx={s.r} ry={s.r * 0.85} fill={color} />
      ))}
      {spec.stripes.map((d, i) => (
        <path key={`t${i}`} d={d} stroke={color} strokeWidth={width} fill="none" strokeLinecap="round" />
      ))}
    </g>
  );
}

/** Star freckles shown when glow is on but there is no pattern. */
function starFreckles(L: Layout, area: 'body' | 'head'): { x: number; y: number; s: number }[] {
  if (area === 'head') {
    const out: { x: number; y: number; s: number }[] = [];
    for (const side of [-1, 1]) {
      out.push({ x: CX + side * L.headRx * 0.66, y: L.headCy + L.headRy * 0.05, s: 3.2 * L.e });
      out.push({ x: CX + side * L.headRx * 0.8, y: L.headCy + L.headRy * 0.28, s: 2.2 * L.e });
    }
    out.push({ x: CX, y: L.headCy - L.headRy * 0.7, s: 3.4 * L.e });
    return out;
  }
  return [
    { x: CX - L.bodyRx * 0.72, y: L.bodyCy - L.bodyRy * 0.2, s: 3.2 * L.k },
    { x: CX + L.bodyRx * 0.7, y: L.bodyCy - L.bodyRy * 0.1, s: 3.6 * L.k },
    { x: CX + L.bodyRx * 0.8, y: L.bodyCy + L.bodyRy * 0.3, s: 2.4 * L.k },
  ];
}

function Markings({ a, L, pal, ids, area }: { a: Appearance; L: Layout; pal: Palette; ids: Ids; area: 'body' | 'head' }) {
  const spec = area === 'body' ? bodyMarkings(L, a.pattern) : headMarkings(L, a.pattern);
  const width = area === 'body' ? L.bodyRx * 0.13 : L.headR * 0.1;
  const clip = `url(#${area === 'body' ? ids.bodyClip : ids.headClip})`;
  const freckles = a.glow && a.pattern === 'none' ? starFreckles(L, area) : [];
  return (
    <g clipPath={clip}>
      {a.glow && (
        <g className="kin-glow" filter={`url(#${ids.glow})`} opacity={0.9}>
          <MarkingShapes spec={spec} color={pal.glow} width={width * 1.3} />
          {freckles.map((f, i) => (
            <path key={i} d={star4(f.x, f.y, f.s * 1.4)} fill={pal.glow} />
          ))}
        </g>
      )}
      <MarkingShapes spec={spec} color={a.glow ? pal.markLight : pal.mark} width={width} />
      {a.glow &&
        freckles.map((f, i) => (
          <path key={i} d={star4(f.x, f.y, f.s)} fill="#fffbe6" />
        ))}
    </g>
  );
}

function MudSpecks({ L }: { L: Layout }) {
  const specks = [
    { x: CX - L.bodyRx * 0.5, y: L.bodyCy + L.bodyRy * 0.55, r: 3.2 },
    { x: CX + L.bodyRx * 0.55, y: L.bodyCy + L.bodyRy * 0.4, r: 2.4 },
    { x: CX + L.bodyRx * 0.2, y: L.bodyCy + L.bodyRy * 0.8, r: 2 },
    { x: CX - L.headRx * 0.7, y: L.headCy - L.headRy * 0.35, r: 2.2 },
  ];
  return (
    <g opacity={0.75}>
      {specks.map((s, i) => (
        <ellipse key={i} cx={s.x} cy={s.y} rx={s.r * L.k} ry={s.r * 0.75 * L.k} fill="#8a6a4a" />
      ))}
    </g>
  );
}

// ---------------------------------------------------------------------------
// Face

type EyeStyle = 'open' | 'closed' | 'happy' | 'droopy' | 'wide';
type MouthStyle = 'smile' | 'grin' | 'chomp' | 'frown' | 'o' | 'sleep';

function faceFor(anim: CreatureAnim, mood: Mood | undefined): { eyes: EyeStyle; mouth: MouthStyle } {
  switch (anim) {
    case 'sleeping':
      return { eyes: 'closed', mouth: 'sleep' };
    case 'eating':
      return { eyes: 'happy', mouth: 'chomp' };
    case 'happy':
      return { eyes: 'happy', mouth: 'grin' };
    case 'playing':
      return { eyes: 'wide', mouth: 'grin' };
    case 'grooming':
      return { eyes: 'happy', mouth: 'smile' };
    case 'puzzled':
      return { eyes: 'wide', mouth: 'o' };
    default:
      break;
  }
  switch (mood) {
    case 'joyful':
      return { eyes: 'open', mouth: 'grin' };
    case 'sleepy':
      return { eyes: 'droopy', mouth: 'smile' };
    case 'glum':
      return { eyes: 'open', mouth: 'frown' };
    case 'hungry':
      return { eyes: 'open', mouth: 'o' };
    default:
      return { eyes: 'open', mouth: 'smile' };
  }
}

function Eye({ x, y, er, style, pal }: { x: number; y: number; er: number; style: EyeStyle; pal: Palette }) {
  if (style === 'closed') {
    return <path d={`M ${x - er} ${y} Q ${x} ${y + er * 0.9} ${x + er} ${y}`} stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" />;
  }
  if (style === 'happy') {
    return <path d={`M ${x - er} ${y + er * 0.35} Q ${x} ${y - er * 1.0} ${x + er} ${y + er * 0.35}`} stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />;
  }
  const big = style === 'wide' ? 1.12 : 1;
  const rx = er * 0.86 * big;
  const ry = er * 1.04 * big;
  return (
    <g transform={`translate(${r(x)} ${r(y)})`}>
      <g className="kin-pivot kin-eye">
        <ellipse cx={0} cy={0} rx={rx} ry={ry} fill={INK} />
        <ellipse cx={0} cy={ry * 0.45} rx={rx * 0.62} ry={ry * 0.32} fill="#6b4f42" opacity={0.6} />
        <circle cx={-rx * 0.32} cy={-ry * 0.38} r={er * 0.34} fill="#ffffff" />
        <circle cx={rx * 0.34} cy={ry * 0.3} r={er * 0.15} fill="#ffffff" opacity={0.9} />
        {style === 'droopy' && (
          <path d={`M ${-rx * 1.25} ${-ry * 1.25} L ${rx * 1.25} ${-ry * 1.25} L ${rx * 1.25} ${-ry * 0.1} Q 0 ${ry * 0.25} ${-rx * 1.25} ${-ry * 0.1} Z`} fill={pal.base} stroke="none" />
        )}
        {style === 'droopy' && <path d={`M ${-rx * 1.05} ${-ry * 0.08} Q 0 ${ry * 0.28} ${rx * 1.05} ${-ry * 0.08}`} stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />}
      </g>
    </g>
  );
}

function Mouth({ x, y, m, style }: { x: number; y: number; m: number; style: MouthStyle }) {
  switch (style) {
    case 'smile':
      return <path d={`M ${x - m} ${y} q ${m / 2} ${m * 0.75} ${m} 0 q ${m / 2} ${m * 0.75} ${m} 0`} stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
    case 'grin':
      return (
        <g>
          <path d={`M ${x - m * 1.2} ${y - m * 0.15} Q ${x} ${y + m * 1.9} ${x + m * 1.2} ${y - m * 0.15} Z`} fill="#8f3f3f" stroke={INK} strokeWidth={2} strokeLinejoin="round" />
          <ellipse cx={x} cy={y + m * 0.75} rx={m * 0.55} ry={m * 0.3} fill="#f08c98" />
        </g>
      );
    case 'chomp':
      return (
        <g transform={`translate(${r(x)} ${r(y + m * 0.3)})`}>
          <g className="kin-pivot kin-mouth">
            <ellipse cx={0} cy={0} rx={m * 0.8} ry={m * 0.75} fill="#8f3f3f" stroke={INK} strokeWidth={2} />
            <ellipse cx={0} cy={m * 0.35} rx={m * 0.45} ry={m * 0.25} fill="#f08c98" />
          </g>
        </g>
      );
    case 'frown':
      return <path d={`M ${x - m * 0.8} ${y + m * 0.55} Q ${x} ${y - m * 0.15} ${x + m * 0.8} ${y + m * 0.55}`} stroke={INK} strokeWidth={2.2} fill="none" strokeLinecap="round" />;
    case 'o':
      return <ellipse cx={x} cy={y + m * 0.3} rx={m * 0.42} ry={m * 0.5} fill="#8f3f3f" stroke={INK} strokeWidth={1.8} />;
    case 'sleep':
      return <path d={`M ${x - m * 0.45} ${y + m * 0.3} q ${m * 0.45} ${m * 0.35} ${m * 0.9} 0`} stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />;
  }
}

function Face({ L, pal, anim, mood }: { L: Layout; pal: Palette; anim: CreatureAnim; mood?: Mood }) {
  const { eyes, mouth } = faceFor(anim, mood);
  const er = L.headR * 0.15;
  const eyeY = L.headCy + L.headRy * 0.04;
  const eyeDx = L.headRx * 0.38;
  return (
    <g className="kin-face">
      <ellipse cx={CX - L.headRx * 0.6} cy={L.headCy + L.headRy * 0.34} rx={L.headR * 0.16} ry={L.headR * 0.095} fill="#f07a8e" opacity={0.42} />
      <ellipse cx={CX + L.headRx * 0.6} cy={L.headCy + L.headRy * 0.34} rx={L.headR * 0.16} ry={L.headR * 0.095} fill="#f07a8e" opacity={0.42} />
      <g className="kin-eyes">
        <Eye x={CX - eyeDx} y={eyeY} er={er} style={eyes} pal={pal} />
        <Eye x={CX + eyeDx} y={eyeY} er={er} style={eyes} pal={pal} />
      </g>
      {anim === 'puzzled' && (
        <path d={`M ${CX + eyeDx - er} ${eyeY - er * 1.9} q ${er} ${-er * 0.7} ${er * 2} ${-er * 0.1}`} stroke={INK} strokeWidth={2} fill="none" strokeLinecap="round" />
      )}
      <ellipse cx={CX} cy={L.headCy + L.headRy * 0.2} rx={L.headR * 0.055} ry={L.headR * 0.04} fill={pal.shade} />
      <Mouth x={CX} y={L.headCy + L.headRy * 0.3} m={L.headR * 0.11} style={mouth} />
    </g>
  );
}

// ---------------------------------------------------------------------------
// Effects (floating hearts, zzz, bubbles…). Drawn unflipped so text reads correctly.

function heartPath(x: number, y: number, s: number): string {
  return `M ${x} ${y + s * 0.9} C ${x - s * 1.4} ${y}, ${x - s * 0.9} ${y - s * 1.1}, ${x} ${y - s * 0.35} C ${x + s * 0.9} ${y - s * 1.1}, ${x + s * 1.4} ${y}, ${x} ${y + s * 0.9} Z`;
}

function Effects({ anim, L, facing }: { anim: CreatureAnim; L: Layout; facing: 1 | -1 }) {
  const side = facing;
  const hx = CX + side * L.headRx * 0.85;
  const hy = L.headCy - L.headRy * 0.9;
  switch (anim) {
    case 'happy':
      return (
        <g className="kin-fx">
          <path className="kin-fx-float kin-fx-d0" d={heartPath(hx, hy, 6)} fill="#f0708a" stroke="#c94f68" strokeWidth={1.2} />
          <path className="kin-fx-float kin-fx-d1" d={heartPath(CX - side * L.headRx * 0.8, hy + 8, 4.5)} fill="#f59ab0" />
          <path className="kin-fx-twinkle kin-fx-d2" d={star4(CX - side * L.headRx * 1.05, L.headCy - 2, 4.5)} fill="#f7c948" />
          <path className="kin-fx-twinkle kin-fx-d1" d={star4(CX + side * L.headRx * 1.15, L.headCy + 10, 3.5)} fill="#f7c948" />
        </g>
      );
    case 'sleeping':
      return (
        <g className="kin-fx" fill="#7d6fb0" fontFamily="ui-rounded, 'Nunito', system-ui, sans-serif" fontWeight={800}>
          <text className="kin-fx-z kin-fx-d0" x={hx} y={hy} fontSize={13}>
            z
          </text>
          <text className="kin-fx-z kin-fx-d1" x={hx + side * 9} y={hy - 12} fontSize={10}>
            z
          </text>
          <text className="kin-fx-z kin-fx-d2" x={hx + side * 16} y={hy - 22} fontSize={8}>
            z
          </text>
        </g>
      );
    case 'eating': {
      const my = L.headCy + L.headRy * 0.62;
      return (
        <g className="kin-fx">
          {[-6, 2, 7].map((dx, i) => (
            <circle key={i} className={`kin-fx-crumb kin-fx-d${i}`} cx={CX + dx} cy={my + 2} r={1.8 + (i % 2) * 0.6} fill="#c99a5e" />
          ))}
        </g>
      );
    }
    case 'grooming':
      return (
        <g className="kin-fx">
          {[
            { x: CX - L.bodyRx * 0.95, y: L.bodyCy, r: 6 },
            { x: CX + L.bodyRx * 0.98, y: L.bodyCy - 8, r: 7.5 },
            { x: CX + L.headRx * 0.9, y: L.headCy - L.headRy * 0.4, r: 4.5 },
            { x: CX - L.headRx * 0.95, y: L.headCy - L.headRy * 0.8, r: 5 },
          ].map((b, i) => (
            <g key={i} className={`kin-fx-bubble kin-fx-d${i % 3}`}>
              <circle cx={b.x} cy={b.y} r={b.r} fill="rgba(210, 236, 255, 0.45)" stroke="#9cc9ea" strokeWidth={1.3} />
              <circle cx={b.x - b.r * 0.35} cy={b.y - b.r * 0.35} r={b.r * 0.25} fill="#ffffff" />
            </g>
          ))}
          <path className="kin-fx-twinkle kin-fx-d1" d={star4(CX + L.bodyRx * 0.4, L.bodyCy - L.bodyRy * 0.2, 4)} fill="#ffffff" stroke="#bfe0f7" strokeWidth={0.8} />
        </g>
      );
    case 'puzzled':
      return (
        <g className="kin-fx">
          <text className="kin-fx-bob" x={hx + side * 2} y={hy - 2} fontSize={18} fontWeight={800} fill="#8a6fc0" fontFamily="ui-rounded, 'Nunito', system-ui, sans-serif" textAnchor="middle">
            ?
          </text>
        </g>
      );
    case 'playing':
      return (
        <g className="kin-fx" stroke="#c9a77a" strokeWidth={2} strokeLinecap="round" fill="none">
          <path className="kin-fx-twinkle kin-fx-d0" d={`M ${CX - L.bodyRx - 10} ${GROUND - 14} q -6 -4 -10 -2`} />
          <path className="kin-fx-twinkle kin-fx-d1" d={`M ${CX + L.bodyRx + 10} ${GROUND - 18} q 6 -4 10 -2`} />
          <path className="kin-fx-twinkle kin-fx-d2" d={star4(CX - side * L.headRx * 1.1, L.headCy - 10, 4)} fill="#f7c948" stroke="none" />
        </g>
      );
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Root

function sanitizeId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function Creature({
  appearance,
  stage,
  anim = 'idle',
  mood,
  reducedMotion = false,
  facing = 1,
  moving = false,
  size,
  title,
  className,
  asGroup = false,
}: CreatureProps) {
  const uid = sanitizeId(useId());
  const ids: Ids = {
    bodyClip: `kin-${uid}-body`,
    headClip: `kin-${uid}-head`,
    glow: `kin-${uid}-glow`,
    wing: `kin-${uid}-wing`,
    belly: `kin-${uid}-belly`,
    sheen: `kin-${uid}-sheen`,
    paddleClip: `kin-${uid}-paddle`,
  };
  const a = appearance;
  const L = layoutFor(a, stage);
  const pal = paletteFor(a);
  const body = bodyPath(CX, L.bodyCy, L.bodyRx, L.bodyRy);
  const head = headPath(CX, L.headCy, L.headRx, L.headRy);

  const rootClass = [
    'kin',
    `kin--${anim}`,
    `kin--stage-${stage}`,
    moving ? 'kin--moving' : '',
    reducedMotion ? 'kin--still' : '',
    a.glow ? 'kin--glowing' : '',
    asGroup && className ? className : '',
  ]
    .filter(Boolean)
    .join(' ');

  const fitTransform = `translate(${CX} ${GROUND}) scale(${r(L.fit)}) translate(${-CX} ${-GROUND})`;
  const flip = facing === -1 ? `translate(${2 * CX} 0) scale(-1 1)` : undefined;

  const content = (
    <g className={rootClass}>
      <defs>
        <clipPath id={ids.bodyClip}>
          <path d={body} />
        </clipPath>
        <clipPath id={ids.headClip}>
          <path d={head} />
        </clipPath>
        <filter id={ids.glow} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
        <linearGradient id={ids.wing} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d7f0ff" stopOpacity={0.85} />
          <stop offset="50%" stopColor="#f3d6ff" stopOpacity={0.7} />
          <stop offset="100%" stopColor="#fff1c2" stopOpacity={0.8} />
        </linearGradient>
        <radialGradient id={ids.belly} cx="0.78" cy="0.9" r="0.75">
          <stop offset="0%" stopColor={pal.shade} stopOpacity={0.28} />
          <stop offset="100%" stopColor={pal.shade} stopOpacity={0} />
        </radialGradient>
        <radialGradient id={ids.sheen} cx="0.35" cy="0.3" r="0.7">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.45} />
          <stop offset="60%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      </defs>
      <g transform={fitTransform}>
        <Shadow L={L} />
        <g transform={`translate(${CX} ${GROUND})`}>
          <g className="kin-pivot kin-bob">
            <g transform={`translate(${-CX} ${-GROUND})`}>
              <g transform={flip}>
                {a.wings && <Wings L={L} ids={ids} />}
                {a.fins && <BackFin L={L} pal={pal} />}
                <Tail type={a.tail} L={L} pal={pal} ids={ids} />
                <Legs L={L} pal={pal} />
                <g className="kin-torso">
                  <path d={body} fill={pal.base} />
                  <g clipPath={`url(#${ids.bodyClip})`}>
                    <ellipse cx={CX} cy={L.bodyCy + L.bodyRy * 0.3} rx={L.bodyRx * 0.6} ry={L.bodyRy * 0.62} fill={pal.accent} />
                  </g>
                  <Markings a={a} L={L} pal={pal} ids={ids} area="body" />
                  {mood === 'messy' && <MudSpecks L={L} />}
                  <path d={body} fill={`url(#${ids.belly})`} />
                  <path d={body} fill={`url(#${ids.sheen})`} />
                  <path d={body} fill="none" stroke={pal.shade} strokeWidth={2.5} strokeLinejoin="round" />
                </g>
                <Arms L={L} pal={pal} />
                <Feet L={L} pal={pal} />
                <Pivot x={CX} y={L.neckY} className="kin-head">
                  <g transform={`translate(${-CX} ${-L.neckY})`}>
                    {a.fins && <FinCrest L={L} pal={pal} />}
                    <Ears type={a.ears} L={L} pal={pal} />
                    <path d={head} fill={pal.base} />
                    <g clipPath={`url(#${ids.headClip})`}>
                      <ellipse cx={CX} cy={L.headCy + L.headRy * 0.55} rx={L.headRx * 0.62} ry={L.headRy * 0.45} fill={pal.accent} opacity={0.55} />
                    </g>
                    <Markings a={a} L={L} pal={pal} ids={ids} area="head" />
                    <path d={head} fill={`url(#${ids.sheen})`} />
                    <path d={head} fill="none" stroke={pal.shade} strokeWidth={2.5} strokeLinejoin="round" />
                    {a.horns && <Horns L={L} />}
                    {a.ears === 'fluffy' && (
                      <path
                        d={`M ${CX - 6 * L.e} ${L.headCy - L.headRy * 0.97} q ${3 * L.e} ${-7 * L.e} ${6 * L.e} ${-1 * L.e} q ${2 * L.e} ${-6 * L.e} ${5 * L.e} ${0.5 * L.e}`}
                        fill={pal.base}
                        stroke={pal.shade}
                        strokeWidth={2}
                        strokeLinejoin="round"
                      />
                    )}
                    <Face L={L} pal={pal} anim={anim} mood={mood} />
                  </g>
                </Pivot>
              </g>
            </g>
          </g>
        </g>
        <Effects anim={anim} L={L} facing={facing} />
      </g>
    </g>
  );

  if (asGroup) return content;
  const style: CSSProperties = { width: size ?? '100%', height: 'auto', overflow: 'visible', display: 'block' };
  return (
    <svg
      viewBox="0 0 200 200"
      className={className ? `kin-svg ${className}` : 'kin-svg'}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {content}
    </svg>
  );
}
