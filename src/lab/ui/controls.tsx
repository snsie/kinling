// Small form controls shared by the lab panels.
import { useId } from 'react';
import { PERSONALITY_KEYS, type PersonalityKey } from '../../game/types';

// Categorical slots in fixed order: 1–3 temperament, 6–8 story traits (4–5 are the story chart's distress and awareness).
export const TRAIT_COLORS: Record<PersonalityKey, string> = {
  curiosity: 'var(--series-1)',
  confidence: 'var(--series-2)',
  playfulness: 'var(--series-3)',
  devotion: 'var(--series-6)',
  fear: 'var(--series-7)',
  defiance: 'var(--series-8)',
};

export { PERSONALITY_KEYS };

export function Num(props: { label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <input
        id={id}
        type="number"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) props.onChange(v);
        }}
      />
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
}

export function Slider(props: { label: React.ReactNode; value: number; onChange: (v: number) => void; min?: number; max?: number; hint?: React.ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      <span className="mono">{props.value}</span>
      <input id={id} type="range" min={props.min ?? 0} max={props.max ?? 100} value={props.value} onChange={(e) => props.onChange(Number(e.target.value))} />
      {props.hint && <span className="hint">{props.hint}</span>}
    </div>
  );
}

export function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  );
}

export function Template(props: { label: string; value: string; onChange: (v: string) => void; onReset?: () => void; rows?: number }) {
  const id = useId();
  return (
    <div className="stack">
      <div className="row spread">
        <label htmlFor={id} className="small muted">
          {props.label}
        </label>
        {props.onReset && (
          <button type="button" className="btn link small" onClick={props.onReset}>
            Reset to default
          </button>
        )}
      </div>
      <textarea id={id} className="template" rows={props.rows ?? 8} value={props.value} spellCheck={false} onChange={(e) => props.onChange(e.target.value)} />
    </div>
  );
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}
