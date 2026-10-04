// Explains the on-device model and lets the player download, cancel, retry,
// switch or turn it off. Shared by onboarding and settings.
import { useEffect, useState } from 'react';
import { ai } from '../ai/engine';
import { formatMB, MODELS } from '../ai/models';
import { cancelDownload, deleteModelFiles, disableAi, enableAndLoad, switchModel, useAiStatus } from '../app/aiControl';
import { updateSettings, useStore } from '../app/actions';
import type { ModelId } from '../game/types';
import { MODEL_IDS } from '../game/types';
import { Progress } from './common';

export function AiExplainer() {
  return (
    <div className="ai-explainer">
      <p>
        Kinling can talk using a small AI model that runs <strong>entirely on your device</strong> through WebGPU. Your messages never leave this
        browser and there are no accounts or cloud services.
      </p>
      <ul className="bullets">
        <li>
          The model is downloaded once from Hugging Face (about {formatMB(MODELS['Qwen3-1.7B-q4f16_1-MLC'].downloadMB)}, or {formatMB(MODELS['Qwen3-0.6B-q4f16_1-MLC'].downloadMB)} for the
          smaller one) and stored in this browser for offline use. A larger {formatMB(MODELS['Qwen3-4B-q4f16_1-MLC'].downloadMB)} model is available in Settings for stronger devices.
        </li>
        <li>It needs a WebGPU-capable browser (recent Chrome or Edge, or Safari 26+) and about 1.5–2 GB of free graphics memory (about 3.5 GB for the largest model).</li>
        <li>Everything works without AI too: your kinling will use its own hand-written words, and all care, adventures and evolution are the same.</li>
      </ul>
    </div>
  );
}

export function AiSetup({ compact = false }: { compact?: boolean }) {
  const status = useAiStatus();
  const { save } = useStore();
  const settings = save?.settings.ai;
  const [support, setSupport] = useState<{ supported: boolean; reason?: string; f16: boolean; adapter?: string } | null>(null);
  const [cached, setCached] = useState<Record<string, boolean | null>>({});
  const selected: ModelId = settings?.modelId ?? 'Qwen3-1.7B-q4f16_1-MLC';

  useEffect(() => {
    let alive = true;
    void ai.checkSupport().then((s) => alive && setSupport(s));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!support?.supported) return;
    let alive = true;
    void Promise.all(MODEL_IDS.map(async (m) => [m, await ai.isCached(m)] as const)).then((pairs) => alive && setCached(Object.fromEntries(pairs)));
    return () => {
      alive = false;
    };
  }, [support, status.kind]);

  if (support && !support.supported) {
    return (
      <div className="notice notice--warn" role="status">
        <strong>Local AI isn't available here.</strong> {support.reason} Kinling will use its own words — everything else works the same.
      </div>
    );
  }

  const loading = status.kind === 'loading';
  const ready = status.kind === 'ready' || status.kind === 'generating';

  return (
    <div className="ai-setup">
      {!compact && <AiExplainer />}
      <fieldset className="model-pick" disabled={loading}>
        <legend>Model</legend>
        {MODEL_IDS.map((m) => (
          <label key={m} className={`model-option ${selected === m ? 'model-option--on' : ''}`}>
            <input
              type="radio"
              name="model"
              value={m}
              checked={selected === m}
              onChange={() => (settings?.enabled ? switchModel(m) : enableAndLoadPrompt(m))}
            />
            <span className="model-option__text">
              <span className="model-option__name">{MODELS[m].label}</span>
              <span className="model-option__desc">
                {MODELS[m].description} {cached[m] ? <em>Downloaded ✓</em> : null}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {support && !support.f16 && (
        <p className="hint">Your GPU lacks 16-bit shader support, so a compatible (slightly larger) variant of the model will be used.</p>
      )}

      {loading && status.kind === 'loading' && (
        <div className="ai-progress" aria-live="polite">
          <Progress value={status.progress} label="Model download and load progress" />
          <p className="hint">{status.text}</p>
          <p className="hint">You can keep playing while this finishes. Files that finish downloading are kept even if you cancel.</p>
          <button className="btn btn--ghost" onClick={cancelDownload}>
            Cancel download
          </button>
        </div>
      )}

      {status.kind === 'error' && (
        <div className="notice notice--error" role="alert">
          <p>{status.message}</p>
          <div className="row">
            <button className="btn btn--primary" onClick={() => enableAndLoad(selected)}>
              Retry
            </button>
            {selected !== 'Qwen3-0.6B-q4f16_1-MLC' && (
              <button className="btn" onClick={() => enableAndLoad('Qwen3-0.6B-q4f16_1-MLC')}>
                Try the smaller model
              </button>
            )}
            <button className="btn btn--ghost" onClick={disableAi}>
              Play without AI
            </button>
          </div>
        </div>
      )}

      {status.kind === 'not-loaded' && status.note && <p className="notice notice--warn">{status.note}</p>}

      {!loading && (
        <div className="row row--wrap">
          {!ready && (
            <button className="btn btn--primary" onClick={() => enableAndLoad(selected)}>
              {cached[selected] ? 'Load model' : `Download ${formatMB(MODELS[selected].downloadMB)} and turn on AI`}
            </button>
          )}
          {ready && <span className="pill pill--ok">AI ready: {MODELS[selected].label}</span>}
          {(settings?.enabled || ready) && (
            <button className="btn btn--ghost" onClick={disableAi}>
              Turn AI off
            </button>
          )}
          {cached[selected] && !compact && (
            <button
              className="btn btn--ghost"
              onClick={() => {
                if (confirm(`Delete the downloaded ${MODELS[selected].label} files from this browser? You can download them again later.`)) void deleteModelFiles(selected);
              }}
            >
              Delete model files
            </button>
          )}
        </div>
      )}
      {support?.adapter && !compact && <p className="hint">Graphics adapter: {support.adapter}</p>}
    </div>
  );
}

function enableAndLoadPrompt(m: ModelId) {
  // Selecting a model while AI is off only changes the choice; downloading stays explicit.
  updateSettings((st) => {
    st.ai.modelId = m;
  });
}
