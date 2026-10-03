import { useEffect, useLayoutEffect } from 'react';
import { useStore } from './app/actions';
import { startAiFromSettings } from './app/aiControl';
import { useReducedMotion } from './app/motion';
import { configureSound } from './app/sfx';
import { store } from './app/store';
import { ui } from './app/ui';
import { Toasts } from './ui/common';
import { GameScreen } from './ui/GameScreen';
import { Onboarding } from './ui/onboarding/Onboarding';
import { TopBar } from './ui/TopBar';
import { parseImport } from './persistence/exportImport';

export function App() {
  const { save, status, notice } = useStore();
  const reducedMotion = useReducedMotion(save?.settings.reducedMotion);

  useEffect(() => {
    void store.init().then(() => {
      void startAiFromSettings();
    });
  }, []);

  useEffect(() => {
    if (save) configureSound(save.settings.sound, save.settings.volume);
  }, [save?.settings.sound, save?.settings.volume]);

  // Layout effect: the class must be in place before the first animated paint.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reducedMotion);
  }, [reducedMotion]);

  useEffect(() => {
    if (notice) {
      ui.toast(notice, 'info');
      store.clearNotice();
    }
  }, [notice]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <TopBar save={save} />
      {!save && status.kind === 'loading' && (
        <main className="splash" id="main">
          <img src="./icon.svg" alt="" width={72} height={72} className="splash__icon" />
          <p>Opening the hollow…</p>
        </main>
      )}
      {!save && status.kind === 'error' && (
        <main className="splash" id="main">
          <h1>Your save couldn't be opened</h1>
          <p>{status.message}</p>
          <p>You can import a backup or start over below.</p>
          <RecoveryPanel />
        </main>
      )}
      {save && save.onboarding.step !== 'done' && <Onboarding save={save} reducedMotion={reducedMotion} />}
      {save && save.onboarding.step === 'done' && save.creature && <GameScreen save={save} reducedMotion={reducedMotion} />}
      <Toasts />
    </div>
  );
}

/** Shown when the stored save is unreadable: offers import or a fresh start. */
function RecoveryPanel() {
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const res = parseImport(await file.text());
    if (!res.ok) {
      ui.toast(`Import failed: ${res.error}`, 'error');
      return;
    }
    await store.replaceSave(res.save);
    ui.toast('Backup imported.', 'success');
  };
  return (
    <div className="card recovery">
      <label className="btn">
        Import a backup…
        <input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      <button
        className="btn btn--danger"
        onClick={() => {
          if (confirm('Start a new game? The unreadable save will be replaced.')) void store.resetAll();
        }}
      >
        Start a new game
      </button>
    </div>
  );
}
