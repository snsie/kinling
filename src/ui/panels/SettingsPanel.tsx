// Settings: AI, sound, motion, minigame, and local save management.
import { useEffect, useRef, useState } from 'react';
import { updateSettings, useStore } from '../../app/actions';
import { configureSound, playSfx } from '../../app/sfx';
import { store } from '../../app/store';
import { ui } from '../../app/ui';
import type { MotionPref, SaveData } from '../../game/types';
import { downloadText, exportFileName, exportSave, parseImport } from '../../persistence/exportImport';
import { requestPersistentStorage, storageEstimate } from '../../persistence/db';
import { AiSetup } from '../AiSetup';
import { ConfirmDialog, formatTime } from '../common';
import { Kinetic } from '../motion';
import { activeKinling } from '../../game/state';

export function SettingsPanel({ save }: { save: SaveData }) {
  const { status, role } = useStore();
  const [pendingImport, setPendingImport] = useState<{ save: SaveData; note: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetText, setResetText] = useState('');
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const s = save.settings;

  useEffect(() => {
    void storageEstimate().then(setEstimate);
    void navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, []);

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const res = parseImport(text);
      if (!res.ok) {
        ui.toast(`Import failed: ${res.error}`, 'error');
        return;
      }
      const c = activeKinling(res.save);
      setPendingImport({
        save: res.save,
        note: `${c ? `${c.name} the ${c.egg} kinling` : 'A save in onboarding'}, last saved ${formatTime(res.save.updatedAt)}${res.migratedFrom ? ` (upgraded from format v${res.migratedFrom})` : ''}.`,
      });
    } catch (err) {
      ui.toast(`Could not read that file: ${err instanceof Error ? err.message : String(err)}`, 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const name = activeKinling(save)?.name ?? '';
  const readOnly = role !== 'writer';

  return (
    <div className="panel settings">
      <h2 className="panel__title">
        <Kinetic text="Settings" />
      </h2>

      <section className="settings__section settings__section--wide" aria-labelledby="set-ai" data-reveal="">
        <h3 id="set-ai">On-device AI</h3>
        <AiSetup />
      </section>

      <section className="settings__section" aria-labelledby="set-sound" data-reveal="">
        <h3 id="set-sound">Sound</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={s.sound}
            onChange={(e) => {
              updateSettings((x) => void (x.sound = e.target.checked));
              configureSound(e.target.checked, s.volume);
              if (e.target.checked) playSfx('chime');
            }}
          />
          <span>Sound effects</span>
        </label>
        <label className="slider">
          <span>Volume</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={s.volume}
            disabled={!s.sound}
            onChange={(e) => {
              const v = Number(e.target.value);
              updateSettings((x) => void (x.volume = v));
              configureSound(s.sound, v);
            }}
            onPointerUp={() => playSfx('pop')}
          />
        </label>
      </section>

      <section className="settings__section" aria-labelledby="set-motion" data-reveal="">
        <h3 id="set-motion">Motion</h3>
        <fieldset className="radio-row">
          <legend className="sr-only">Animation preference</legend>
          {(
            [
              ['system', 'Match my device'],
              ['reduce', 'Reduce motion'],
              ['full', 'Full animation'],
            ] as [MotionPref, string][]
          ).map(([v, label]) => (
            <label key={v} className="radio">
              <input type="radio" name="motion" value={v} checked={s.reducedMotion === v} onChange={() => updateSettings((x) => void (x.reducedMotion = v))} />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>
        <label className="toggle">
          <input type="checkbox" checked={s.relaxedMinigame} onChange={(e) => updateSettings((x) => void (x.relaxedMinigame = e.target.checked))} />
          <span>Relaxed adventures (slower obstacles, longer timer)</span>
        </label>
      </section>

      <section className="settings__section settings__section--wide" aria-labelledby="set-save" data-reveal="">
        <h3 id="set-save">Your save</h3>
        <p>
          Your kinling lives <strong>only in this browser</strong> (IndexedDB). It isn't uploaded anywhere. Clearing site data, private windows or a different browser won't have it — export a backup file to keep it safe or move it.
        </p>
        <ul className="bullets">
          <li>
            Status: <SaveStatusText />
          </li>
          {estimate && <li>Storage used by this site: {(estimate.usage / 1e6).toFixed(1)} MB (includes downloaded AI model files).</li>}
          <li>
            {persisted ? (
              'Persistent storage granted: the browser will not clear this data automatically.'
            ) : (
              <>
                The browser may clear data when space is low.{' '}
                <button className="link-btn" onClick={() => void requestPersistentStorage().then(setPersisted)}>
                  Ask to keep it
                </button>
              </>
            )}
          </li>
        </ul>
        <div className="row row--wrap">
          <button
            className="btn"
            onClick={() => {
              downloadText(exportFileName(save), exportSave(store.save ?? save));
              ui.toast('Backup exported.', 'success');
            }}
          >
            Export backup (.json)
          </button>
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={readOnly}>
            Import backup…
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={(e) => void onImportFile(e.target.files?.[0])} />
          <button className="btn btn--danger-ghost" onClick={() => setConfirmReset(true)} disabled={readOnly}>
            Reset game…
          </button>
        </div>
        {status.kind === 'error' && (
          <div className="notice notice--error" role="alert">
            {status.message}{' '}
            <button className="btn btn--small" onClick={() => store.retrySave()}>
              Retry save
            </button>
          </div>
        )}
      </section>

      {pendingImport && (
        <ConfirmDialog
          title="Replace your current save?"
          body={
            <>
              <p>The backup contains: {pendingImport.note}</p>
              <p>This replaces the kinling in this browser. Consider exporting your current save first.</p>
            </>
          }
          confirmLabel="Import and replace"
          danger
          onCancel={() => setPendingImport(null)}
          onConfirm={() => {
            const next = pendingImport.save;
            setPendingImport(null);
            void store
              .replaceSave(next)
              .then(() => ui.toast('Backup imported.', 'success'))
              .catch((err: unknown) => ui.toast(`Import failed: ${err instanceof Error ? err.message : String(err)}`, 'error'));
          }}
        />
      )}
      {confirmReset && (
        <ConfirmDialog
          title="Reset everything?"
          body={
            <>
              <p>This permanently deletes {name || 'your kinling'}, its inventory, memories and diary from this browser. Downloaded AI model files are kept.</p>
              {name && (
                <label className="field">
                  <span>
                    Type <strong>{name}</strong> to confirm
                  </span>
                  <input className="input" value={resetText} onChange={(e) => setResetText(e.target.value)} autoComplete="off" />
                </label>
              )}
            </>
          }
          confirmLabel="Reset"
          danger
          onCancel={() => {
            setConfirmReset(false);
            setResetText('');
          }}
          onConfirm={() => {
            if (name && resetText.trim() !== name) {
              ui.toast(`Type ${name} to confirm the reset.`, 'warn');
              return;
            }
            setConfirmReset(false);
            setResetText('');
            void store.resetAll().then(() => ui.toast('Game reset.', 'info'));
          }}
        />
      )}
    </div>
  );
}

export function SaveStatusText() {
  const { status } = useStore();
  switch (status.kind) {
    case 'loading':
      return <>Loading…</>;
    case 'saved':
      return (
        <>
          Saved <span className="status-time">{new Date(status.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span>
        </>
      );
    case 'pending':
    case 'saving':
      return <>Saving…</>;
    case 'error':
      return <>Not saved — {status.message}</>;
    case 'memory-only':
      return <>Not saving (storage unavailable)</>;
    case 'readonly':
      return <>Read-only in this tab</>;
    case 'conflict':
      return <>Changed in another tab</>;
  }
}
