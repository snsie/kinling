// Small accessible UI building blocks.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ui, useUi } from '../app/ui';
import { useReveal } from './motion';

export function Meter({ label, value, status, color, icon }: { label: string; value: number; status: string; color: string; icon: ReactNode }) {
  const v = Math.round(value);
  const id = useId();
  return (
    <div className="meter" style={{ '--c': color } as CSSProperties}>
      <div className="meter__head">
        <span className="meter__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="meter__label" id={id}>
          {label}
        </span>
        <span className="meter__status">{status}</span>
      </div>
      <div
        className="meter__track"
        role="meter"
        aria-labelledby={id}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-valuetext={`${v} out of 100, ${status}`}
      >
        <div className="meter__fill" style={{ width: `${v}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export function Bar({ value, max = 100, color, label }: { value: number; max?: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)}>
      <div className="bar__fill" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  badge?: boolean;
}

/** WAI-ARIA tabs with arrow-key navigation and a sliding active-state pill. */
export function Tabs<T extends string>({ tabs, active, onChange, label, idPrefix }: { tabs: TabDef<T>[]; active: T; onChange: (t: T) => void; label: string; idPrefix: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const activeIndex = tabs.findIndex((t) => t.id === active);
  // Measure before paint so the pill never flashes in the wrong place.
  useLayoutEffect(() => {
    const list = listRef.current;
    const el = refs.current[activeIndex];
    if (!list || !el) return;
    const measure = () => setIndicator({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeIndex, tabs.length]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next]!.id);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} ref={listRef} data-indicator={indicator ? '' : undefined}>
      {indicator && <span className="tabs__indicator" aria-hidden="true" style={{ transform: `translate(${indicator.x}px, ${indicator.y}px)`, width: indicator.w, height: indicator.h }} />}
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="tab"
          id={`${idPrefix}-tab-${t.id}`}
          aria-controls={`${idPrefix}-panel-${t.id}`}
          aria-selected={active === t.id}
          tabIndex={active === t.id ? 0 : -1}
          className={`tab ${active === t.id ? 'tab--active' : ''}`}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.icon && (
            <span className="tab__icon" aria-hidden="true">
              {t.icon}
            </span>
          )}
          <span className="tab__label">{t.label}</span>
          {t.badge && <span className="tab__badge" aria-label="new" />}
        </button>
      ))}
    </div>
  );
}

export function TabPanel({ idPrefix, id, active, children }: { idPrefix: string; id: string; active: boolean; children: ReactNode }) {
  if (!active) return null;
  return (
    <ActiveTabPanel idPrefix={idPrefix} id={id}>
      {children}
    </ActiveTabPanel>
  );
}

function ActiveTabPanel({ idPrefix, id, children }: { idPrefix: string; id: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useReveal(ref);
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} className="tabpanel" tabIndex={0} ref={ref}>
      {children}
    </div>
  );
}

/** Modal dialog with focus trap, Escape to close and focus restore. Rendered in
 *  a portal so glass (backdrop-filter) ancestors can't trap its fixed overlay. */
export function Modal({ title, onClose, children, labelledBy, wide }: { title: string; onClose: () => void; children: ReactNode; labelledBy?: string; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () => [...(el?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])].filter((x) => !x.hasAttribute('disabled'));
    focusables()[0]?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'modal--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? titleId} ref={ref}>
        <div className="modal__head">
          <h2 id={titleId} className="modal__title">
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, onConfirm, onCancel }: { title: string; body: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <div className="confirm">
        <div className="confirm__body">{body}</div>
        <div className="row row--end">
          <button className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function Toasts() {
  const { toasts } = useUi();
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          <span>{t.text}</span>
          <button className="icon-btn icon-btn--small" onClick={() => ui.dismissToast(t.id)} aria-label="Dismiss notification">
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

export function Progress({ value, label }: { value: number; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <div className="progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function relativeTime(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return formatTime(ms);
}
