import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { aiStatusLabel, useAiStatus } from '../app/aiControl';
import { useStore } from '../app/actions';
import { store } from '../app/store';
import { ui } from '../app/ui';
import { levelFor, lifeStageFor, STAGE_LABELS } from '../game/stage';
import type { SaveData } from '../game/types';
import { SaveStatusText } from './panels/SettingsPanel';
import { activeKinling } from '../game/state';

export function TopBar({ save }: { save: SaveData | null }) {
  const { status } = useStore();
  const ai = useAiStatus();
  const c = save ? activeKinling(save) : null;
  const statusTone = status.kind === 'error' || status.kind === 'memory-only' ? 'bad' : status.kind === 'readonly' || status.kind === 'conflict' ? 'warn' : 'ok';
  const done = save?.onboarding.step === 'done';
  const ref = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Firmer glass once content scrolls underneath.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Publish the header's footprint so sticky panels and scroll padding sit below it.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const publish = () => document.documentElement.style.setProperty('--header-h', `${Math.ceil(el.getBoundingClientRect().height + 8)}px`);
    publish();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <header className={`topbar ${scrolled ? 'topbar--scrolled' : ''}`} ref={ref}>
      <div className="topbar__brand">
        <img src="./icon.svg" alt="" width={32} height={32} />
        <span className="topbar__title">Kinling</span>
      </div>
      {c && c.name && (
        <div className="topbar__who">
          <strong>{c.name}</strong>
          <span className="pill pill--small">
            Lv {levelFor(c.bond)} · {STAGE_LABELS[lifeStageFor(c.bond)]}
          </span>
        </div>
      )}
      <div className="topbar__status">
        <span className={`status-chip status-chip--${statusTone}`} role="status" aria-live="polite">
          <span className="status-chip__dot" aria-hidden="true" />
          <SaveStatusText />
        </span>
        <button
          className={`status-chip status-chip--button ${ai.kind === 'ready' || ai.kind === 'generating' ? 'status-chip--ok' : ai.kind === 'error' ? 'status-chip--bad' : ''}`}
          onClick={() => done && ui.setTab('settings')}
          aria-label={`${aiStatusLabel(ai)}${done ? '. Open AI settings' : ''}`}
          disabled={!done}
        >
          {aiStatusLabel(ai)}
        </button>
      </div>
      {(status.kind === 'readonly' || status.kind === 'conflict') && (
        <div className="banner banner--warn" role="alert">
          {status.kind === 'conflict' ? 'Your save was changed in another tab, so this tab stopped saving to avoid overwriting it.' : 'Kinling is open in another tab. This tab is view-only so saves never conflict.'}
          <button className="btn btn--small" onClick={() => void store.takeOver()}>
            Play here instead
          </button>
        </div>
      )}
      {status.kind === 'memory-only' && (
        <div className="banner banner--bad" role="alert">
          {status.message}
        </div>
      )}
      {status.kind === 'error' && (
        <div className="banner banner--bad" role="alert">
          {status.message}{' '}
          <button className="btn btn--small" onClick={() => store.retrySave()}>
            Retry
          </button>
        </div>
      )}
    </header>
  );
}
