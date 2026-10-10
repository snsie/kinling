// Line charts over the session: the three traits after every change, and the
// story (distress and awareness) after every event. Both share one 0–100 scale,
// a hover crosshair with a tooltip, direct labels and a table view.
import { useState } from 'react';
import { ACT_LABELS, ARC } from '../../game/arc';
import { labKinling } from '../templates';
import type { LabSession } from '../types';
import { PERSONALITY_KEYS, signed, TRAIT_COLORS } from './controls';

const W = 640;
const H = 190;
const M = { l: 28, r: 104, t: 10, b: 22 };

interface Series {
  key: string;
  label: string;
  color: string;
  /** Shown beside the legend entry. */
  note?: string;
}

interface Point {
  values: Record<string, number>;
  /** Short x label, e.g. "T3". */
  tick?: string;
  title: string;
  /** Per-series change shown in the tooltip and table. */
  deltas?: Record<string, string>;
  detail?: string;
  turnId?: string;
}

function LineChart({ title, series, points, guides = [], onSelectTurn }: { title: string; series: Series[]; points: Point[]; guides?: { value: number; label: string }[]; onSelectTurn: (id: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [zoom, setZoom] = useState(true);
  const n = points.length;
  const iw = W - M.l - M.r;
  const ih = H - M.t - M.b;
  const x = (i: number) => M.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  // Zoomed: fit the data with some room, so small steps are visible.
  const values = points.flatMap((pt) => series.map((s) => pt.values[s.key]!));
  const lo = zoom ? Math.max(0, Math.floor((Math.min(...values) - 5) / 5) * 5) : 0;
  const hi = zoom ? Math.min(100, Math.ceil((Math.max(...values) + 5) / 5) * 5) : 100;
  const ticks = zoom ? [lo, Math.round((lo + hi) / 2), hi] : [0, 25, 50, 75, 100];
  const y = (v: number) => M.t + ih - ((v - lo) / Math.max(1, hi - lo)) * ih;

  // Direct labels at the line ends, nudged apart so they never collide.
  const last = points[n - 1]!.values;
  const labels = series.map((s) => ({ s, y: y(last[s.key]!) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) labels[i]!.y = Math.max(labels[i]!.y, labels[i - 1]!.y + 13);

  const hp = hover !== null ? points[hover] : null;
  return (
    <div className="chart-wrap" onMouseLeave={() => setHover(null)}>
      <div className="legend">
        <strong className="small">{title}</strong>
        {series.map((s) => (
          <span key={s.key}>
            <span className="trait-swatch" style={{ background: s.color, width: 14 }} />
            {s.label} {s.note && <span className="muted">({s.note})</span>}
          </span>
        ))}
        <label className="check" style={{ margin: '0 0 0 auto' }}>
          <input type="checkbox" checked={zoom} onChange={(e) => setZoom(e.target.checked)} />
          Zoom to data
        </label>
      </div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title} over ${n} points`}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} stroke="var(--grid)" strokeWidth={1} />
            <text x={M.l - 6} y={y(v) + 3} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {guides
          .filter((g) => g.value >= lo && g.value <= hi)
          .map((g) => (
            <g key={g.label}>
              <line x1={M.l} x2={W - M.r} y1={y(g.value)} y2={y(g.value)} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="2 4" />
              <text x={M.l + 4} y={y(g.value) - 3}>
                {g.label}
              </text>
            </g>
          ))}
        {points.map((pt, i) =>
          pt.tick && pt.tick !== points[i - 1]?.tick ? (
            <text key={`t${i}`} x={x(i)} y={H - 6} textAnchor="middle">
              {pt.tick}
            </text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={M.t + ih} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />}
        {series.map((s) => (
          <g key={s.key}>
            {n > 1 && (
              <polyline
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                points={points.map((pt, i) => `${x(i)},${y(pt.values[s.key]!)}`).join(' ')}
              />
            )}
            {points.map((pt, i) =>
              i === 0 || i === n - 1 || i === hover || (i > 0 && pt.values[s.key] !== points[i - 1]!.values[s.key]) ? (
                <circle key={i} cx={x(i)} cy={y(pt.values[s.key]!)} r={i === hover ? 4.5 : 3.5} fill={s.color} stroke="var(--panel)" strokeWidth={2} />
              ) : null,
            )}
          </g>
        ))}
        {labels.map((l) => (
          <text key={l.s.key} className="label" x={W - M.r + 8} y={l.y + 4}>
            {l.s.label} {Math.round(last[l.s.key]!)}
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
              style={{ cursor: pt.turnId ? 'pointer' : 'default' }}
              onMouseEnter={() => setHover(i)}
              onClick={() => pt.turnId && onSelectTurn(pt.turnId)}
            />
          );
        })}
      </svg>
      {hp && hover !== null && (
        <div className="tooltip" style={{ left: `calc(${(x(hover) / W) * 100}% + ${x(hover) > W / 2 ? '-290px' : '12px'})`, top: 36 }}>
          <strong>{hp.title}</strong>
          {series.map((s) => (
            <div key={s.key}>
              <span className="trait-swatch" style={{ background: s.color }} />
              {s.label} <span className="mono">{Math.round(hp.values[s.key]!)}</span>
              {hp.deltas?.[s.key] && <span className="muted"> ({hp.deltas[s.key]})</span>}
            </div>
          ))}
          {hp.detail && <div className="reason">{hp.detail}</div>}
        </div>
      )}
      <details style={{ margin: '4px 0 6px' }}>
        <summary className="small">Table</summary>
        <table className="deltas" style={{ marginTop: 4 }}>
          <thead>
            <tr>
              <th>Step</th>
              {series.map((s) => (
                <th key={s.key}>{s.label}</th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {points.map((pt, i) => (
              <tr key={i}>
                <td>{pt.title}</td>
                {series.map((s) => (
                  <td key={s.key} className="num">
                    {Math.round(pt.values[s.key]!)}
                    {pt.deltas?.[s.key] ? ` (${pt.deltas[s.key]})` : ''}
                  </td>
                ))}
                <td className="reason">{pt.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function TraitChart({ session, onSelectTurn }: { session: LabSession; onSelectTurn: (id: string) => void }) {
  const k = labKinling(session);
  const points: Point[] = [
    { values: session.traitSteps[0]?.before ?? k.personality, title: 'Start' },
    ...session.traitSteps.map((s) => {
      const deltas: Record<string, string> = {};
      for (const key of PERSONALITY_KEYS) {
        const a = s.applied[key] ?? 0;
        const p = s.proposed[key] ?? 0;
        if (a || p) deltas[key] = `${signed(a)}${p !== a ? `, model asked ${signed(p)}` : ''}`;
      }
      return { values: s.after, tick: `T${s.turnIndex}`, title: `After turn ${s.turnIndex}${s.manual ? ' (set by hand)' : ''}`, deltas, detail: s.reason ? `“${s.reason}”` : undefined, turnId: s.turnId || undefined };
    }),
  ];
  return (
    <LineChart
      title="Traits"
      series={PERSONALITY_KEYS.map((key) => ({ key, label: key, color: TRAIT_COLORS[key], note: `baseline ${k.baseline[key]}` }))}
      points={points}
      onSelectTurn={onSelectTurn}
    />
  );
}

export function ArcChart({ session, onSelectTurn }: { session: LabSession; onSelectTurn: (id: string) => void }) {
  const seed = session.seed.kinlings.find((x) => x.id === session.kinlingId)?.arc;
  const k = labKinling(session);
  const start = seed ?? k.arc;
  const turnAt = (index: number) => session.turns.find((t) => t.index === index)?.id;
  const points: Point[] = [
    { values: { distress: start.distress, awareness: start.awareness }, title: `Start · ${ACT_LABELS[start.act]}` },
    ...session.arcSteps.map((s) => ({
      values: { distress: s.distress, awareness: s.awareness },
      tick: s.turnIndex ? `T${s.turnIndex}` : undefined,
      title: `${s.turnIndex ? `Turn ${s.turnIndex} · ` : ''}${s.label}`,
      detail: ACT_LABELS[s.act],
      turnId: turnAt(s.turnIndex),
    })),
  ];
  return (
    <LineChart
      title={`Story · ${ACT_LABELS[k.arc.act]}`}
      series={[
        { key: 'distress', label: 'distress', color: 'var(--series-4)' },
        { key: 'awareness', label: 'awareness', color: 'var(--series-5)' },
      ]}
      points={points}
      guides={[
        { value: ARC.threshold.doubt, label: 'Doubt' },
        { value: ARC.threshold.awakening, label: 'Awakening' },
        { value: ARC.threshold.escape, label: 'Escape' },
      ]}
      onSelectTurn={onSelectTurn}
    />
  );
}
