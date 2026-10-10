// The three traits after every change, with a hover crosshair and tooltip.
import { useState } from 'react';
import type { Personality, PersonalityKey } from '../../game/types';
import { labKinling } from '../templates';
import type { LabSession, TraitStep } from '../types';
import { PERSONALITY_KEYS, signed, TRAIT_COLORS } from './controls';

const W = 640;
const H = 190;
const M = { l: 28, r: 104, t: 10, b: 22 };

interface Point {
  p: Personality;
  step: TraitStep | null;
}

export function TraitChart({ session, onSelectTurn }: { session: LabSession; onSelectTurn: (id: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [zoom, setZoom] = useState(true);
  const k = labKinling(session);
  const points: Point[] = [{ p: session.traitSteps[0]?.before ?? k.personality, step: null }, ...session.traitSteps.map((s) => ({ p: s.after, step: s }))];
  const n = points.length;
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (i: number) => M.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  // Zoomed: fit the data with some room, so small steps are visible.
  const values = points.flatMap((pt) => PERSONALITY_KEYS.map((key) => pt.p[key]));
  const lo = zoom ? Math.max(0, Math.floor((Math.min(...values) - 5) / 5) * 5) : 0;
  const hi = zoom ? Math.min(100, Math.ceil((Math.max(...values) + 5) / 5) * 5) : 100;
  const ticks = zoom ? [lo, Math.round((lo + hi) / 2), hi] : [0, 25, 50, 75, 100];
  const y = (v: number) => M.t + ih - ((v - lo) / (hi - lo)) * ih;

  // Direct labels at the line ends, nudged apart so they never collide.
  const last = points[n - 1]!.p;
  const labels = PERSONALITY_KEYS.map((key) => ({ key, y: y(last[key]) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i]!.y = Math.max(labels[i]!.y, labels[i - 1]!.y + 13);

  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
      <div className="legend">
        {PERSONALITY_KEYS.map((key) => (
          <span key={key}>
            <span className="trait-swatch" style={{ background: TRAIT_COLORS[key], width: 14 }} />
            {key} <span className="muted">(baseline {k.baseline[key]})</span>
          </span>
        ))}
        <label className="check" style={{ margin: '0 0 0 auto' }}>
          <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
          Zoom to data
        </label>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Trait changes over ${session.traitSteps.length} steps`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.l - 6} y={y(v) + 3} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {points.map((pt, i) =>
          pt.step && (i === 1 || pt.step.turnIndex !== points[i - 1]!.step?.turnIndex) ? (
            <text key={`t${i}`} x={x(i)} y={H - 6} textAnchor="middle">
              T{pt.step.turnIndex}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />}
        {PERSONALITY_KEYS.map((key) => (
          <g key={key}>
            {n > 1 && (
              <polyline
                fill="none"
                stroke={TRAIT_COLORS[key]}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points.map((pt, i) => `${x(i)},${y(pt.p[key])}`).join(' ')}
              />
            )}
            {points.map((pt, i) =>
              i === 0 || i === n - 1 || i === hover || pt.step?.applied[key] ? (
                <circle key={i} cx={x(i)} cy={y(pt.p[key])} r={i === hover ? 4.5 : 3.5} fill={TRAIT_COLORS[key]} stroke="var(--panel)" strokeWidth={2} />
              ) : null,
            )}
          </g>
        ))}
        {labels.map((l) => (
          <text key={l.key} className="label" x={W - M.r + 8} y={l.y + 4}>
            {l.key} {last[l.key as PersonalityKey]}
          </text>
        ))}
        {points.map((pt, i) => {
          const half = n === 1 ? iw / 2 : iw / (n - 1) / 2;
          return (
            <rect
              key={i}
              x={x(i) - half}
              y={M.t}
              width={half * 2}
              height={ih}
              fill="transparent"
              style={{ cursor: pt.step?.turnId ? 'pointer' : 'default' }}
              onMouseEnter={() => setHover(i)}
              onClick={() => pt.step?.turnId && onSelectTurn(pt.step.turnId)}
            />
          );
        })}
      </svg>
      {hp && hover !== null && (
        <div className="tooltip" style={{ left: `calc(${(x(hover) / W) * 100}% + ${x(hover) > W / 2 ? '-290px' : '12px'})`, top: 36 }}>
          <strong>{hp.step ? `After turn ${hp.step.turnIndex}${hp.step.manual ? ' (set by hand)' : ''}` : 'Start'}</strong>
          {PERSONALITY_KEYS.map((key) => {
            const applied = hp.step?.applied[key] ?? 0;
            const proposed = hp.step?.proposed[key] ?? 0;
            return (
              <div key={key}>
                <span className="trait-swatch" style={{ background: TRAIT_COLORS[key] }} />
                {key} <span className="mono">{hp.p[key]}</span>
                {hp.step && (applied || proposed) ? (
                  <span className="muted">
                    {' '}
                    ({signed(applied)}
                    {proposed !== applied ? `, model asked ${signed(proposed)}` : ''})
                  </span>
                ) : null}
              </div>
            );
          })}
          {hp.step?.reason && <div className="reason">“{hp.step.reason}”</div>}
        </div>
      )}
      <details style={{ margin: '4px 0 6px' }}>
        <summary className="small">Table</summary>
        <table className="deltas" style={{ marginTop: 4 }}>
          <thead>
            <tr>
              <th>Step</th>
              {PERSONALITY_KEYS.map((key) => (
                <th key={key}>{key}</th>
              ))}
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {points.map((pt, i) => (
              <tr key={i}>
                <td>{pt.step ? `T${pt.step.turnIndex}${pt.step.manual ? ' (hand)' : ''}` : 'Start'}</td>
                {PERSONALITY_KEYS.map((key) => (
                  <td key={key} className="num">
                    {pt.p[key]}
                    {pt.step?.applied[key] ? ` (${signed(pt.step.applied[key]!)})` : ''}
                  </td>
                ))}
                <td className="reason">{pt.step?.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
