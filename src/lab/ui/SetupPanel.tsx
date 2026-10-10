// Left column: model, session, the kinling's traits and every prompt setting.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ai } from '../../ai/engine';
import { embedder, EMBED_DOWNLOAD_MB } from '../../ai/embedder';
import { formatMB, MODELS } from '../../ai/models';
import { EGGS } from '../../game/catalog';
import { personalityVoice } from '../../game/persona';
import { EGG_TYPES, MODEL_IDS, type EggType, type ModelId, type Personality } from '../../game/types';
import { lab, type LabState } from '../store';
import { DEFAULT_CHAT_TEMPLATE, DEFAULT_EVOLVE_SYSTEM, DEFAULT_EVOLVE_USER, labKinling, TEMPLATE_VARS } from '../templates';
import type { ChatConfig, EvolveConfig, LabSession } from '../types';
import { Check, Num, PERSONALITY_KEYS, signed, Slider, Template, TRAIT_COLORS } from './controls';

const subscribeAi = (l: () => void) => ai.subscribe(l);
const aiStatus = () => ai.getStatus();
const subscribeEmbed = (l: () => void) => embedder.subscribe(l);
const embedStatus = () => embedder.getStatus();

function readModelPref(): ModelId {
  try {
    const v = localStorage.getItem('kinling-lab-model');
    if (v && (MODEL_IDS as readonly string[]).includes(v)) return v as ModelId;
  } catch {
    // storage unavailable
  }
  return 'Qwen3-1.7B-q4f16_1-MLC';
}

function ModelBox({ session }: { session: LabSession | null }) {
  const status = useSyncExternalStore(subscribeAi, aiStatus);
  const embed = useSyncExternalStore(subscribeEmbed, embedStatus);
  const [modelId, setModelId] = useState<ModelId>(readModelPref);
  useEffect(() => {
    try {
      localStorage.setItem('kinling-lab-model', modelId);
    } catch {
      // storage unavailable
    }
    void ai.refreshIdle(modelId);
  }, [modelId]);
  const loaded = (status.kind === 'ready' || status.kind === 'generating') && status.modelId === modelId;
  const wantsEmbeddings = session?.config.chat.promptMode === 'game' && session.config.chat.useEmbeddings;

  return (
    <section className="panel">
      <h2>Model</h2>
      <div className="row">
        <select value={modelId} onChange={(e) => setModelId(e.target.value as ModelId)} aria-label="Model" disabled={status.kind === 'loading'}>
          {MODEL_IDS.map((id) => (
            <option key={id} value={id}>
              {MODELS[id].label}
            </option>
          ))}
        </select>
        {status.kind === 'loading' ? (
          <button className="btn" onClick={() => ai.cancelLoad()}>
            Cancel
          </button>
        ) : loaded ? (
          <button className="btn" onClick={() => void ai.unload()}>
            Unload
          </button>
        ) : (
          <button className="btn primary" onClick={() => void ai.load(modelId)} disabled={status.kind === 'unsupported' || status.kind === 'checking'}>
            Load
          </button>
        )}
      </div>
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        {status.kind === 'disabled' && 'Checking…'}
        {status.kind === 'checking' && 'Checking WebGPU…'}
        {status.kind === 'unsupported' && status.reason}
        {status.kind === 'not-loaded' && (status.cached ? 'Downloaded. Ready to load.' : `Will download about ${formatMB(MODELS[modelId].downloadMB)}.`)}
        {status.kind === 'loading' && status.text}
        {status.kind === 'ready' && `Ready: ${status.variant}`}
        {status.kind === 'generating' && `Generating with ${status.variant}…`}
        {status.kind === 'error' && <span style={{ color: 'var(--del-ink)' }}>{status.message}</span>}
      </p>
      {status.kind === 'loading' && (
        <div className="progress" role="progressbar" aria-valuenow={Math.round(status.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${status.progress * 100}%` }} />
        </div>
      )}
      {wantsEmbeddings && (
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Memory embeddings:{' '}
          {embed.kind === 'ready' ? (
            'ready'
          ) : embed.kind === 'loading' ? (
            `${Math.round(embed.progress * 100)}%`
          ) : (
            <button className="btn small" onClick={() => void embedder.load()}>
              Load ({formatMB(EMBED_DOWNLOAD_MB)})
            </button>
          )}
          {embed.kind === 'error' && ` ${embed.message}`}
        </p>
      )}
      <p className="small muted" style={{ margin: '6px 0 0' }}>
        Close the game tab while experimenting: each tab keeps its own copy of the model in GPU memory.
      </p>
    </section>
  );
}

function NewKinlingForm({ onDone }: { onDone: () => void }) {
  const [egg, setEgg] = useState<EggType>('woodland');
  const [name, setName] = useState('Mochi');
  const [player, setPlayer] = useState('Sam');
  const [traits, setTraits] = useState<Personality>({ ...EGGS.woodland.personality });
  return (
    <div className="stack">
      <div className="field">
        <label htmlFor="new-egg">Egg</label>
        <select
          id="new-egg"
          value={egg}
          onChange={(e) => {
            const v = e.target.value as EggType;
            setEgg(v);
            setTraits({ ...EGGS[v].personality });
          }}
        >
          {EGG_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="new-name">Kinling name</label>
        <input id="new-name" type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="new-player">Your name</label>
        <input id="new-player" type="text" value={player} onChange={(e) => setPlayer(e.target.value)} />
      </div>
      {PERSONALITY_KEYS.map((key) => (
        <Slider key={key} label={key} value={traits[key]} onChange={(v) => setTraits({ ...traits, [key]: v })} />
      ))}
      <div className="row">
        <button
          className="btn primary"
          onClick={() => {
            lab.newFresh({ egg, name, player, personality: traits });
            onDone();
          }}
        >
          Hatch
        </button>
        <button className="btn" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function GamePicker({ state, onDone }: { state: LabState; onDone: () => void }) {
  useEffect(() => {
    void lab.loadGameSave();
  }, []);
  const save = state.gameSave;
  if (!save) return <p className="small muted">Reading the game save…</p>;
  return (
    <div className="stack">
      <p className="small muted" style={{ margin: 0 }}>
        Copies a kinling into the lab. Your game save is only read, never changed.
      </p>
      <div className="kin-list">
        {save.kinlings.map((k) => (
          <button
            key={k.id}
            className="btn kin-pick"
            onClick={() => {
              lab.importFromGame(k.id);
              onDone();
            }}
          >
            <strong>
              {k.name || '(unnamed)'} <span className="muted">· {k.egg}</span>
            </strong>
            <span className="small muted">
              {PERSONALITY_KEYS.map((key) => `${key} ${k.personality[key]}`).join(' · ')}
            </span>
            <span className="small muted">
              {k.memories.length} memories · {k.chat.length} chat messages
            </span>
          </button>
        ))}
      </div>
      <button className="btn" onClick={onDone}>
        Cancel
      </button>
    </div>
  );
}

function SessionBox({ state }: { state: LabState }) {
  const [mode, setMode] = useState<'new' | 'game' | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const s = state.session;
  return (
    <section className="panel">
      <h2>Session</h2>
      {state.sessions.length > 0 && (
        <select style={{ width: '100%', marginBottom: 6 }} aria-label="Open session" value={s?.id ?? ''} onChange={(e) => void lab.open(e.target.value)} disabled={!!state.busy}>
          {!s && <option value="">Choose a session…</option>}
          {state.sessions.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name} ({x.turns} turns)
            </option>
          ))}
        </select>
      )}
      {s && (
        <div className="field">
          <label htmlFor="session-name">Name</label>
          <input id="session-name" type="text" value={s.name} onChange={(e) => lab.rename(e.target.value)} />
        </div>
      )}
      {mode === 'new' && <NewKinlingForm onDone={() => setMode(null)} />}
      {mode === 'game' && <GamePicker state={state} onDone={() => setMode(null)} />}
      {!mode && (
        <div className="row">
          <button className="btn" onClick={() => setMode('new')} disabled={!!state.busy}>
            New kinling
          </button>
          <button className="btn" onClick={() => setMode('game')} disabled={!!state.busy}>
            From game…
          </button>
          {s && (
            <>
              <button className="btn" onClick={() => lab.restart()} disabled={!!state.busy} title="Same starting kinling, current settings, empty conversation">
                Restart
              </button>
              <button className="btn" onClick={() => lab.exportJson()}>
                Export
              </button>
            </>
          )}
          <button className="btn" onClick={() => file.current?.click()} disabled={!!state.busy}>
            Import…
          </button>
          {s && (
            <button
              className="btn"
              onClick={() => {
                if (confirm(`Delete the session "${s.name}"?`)) void lab.remove();
              }}
              disabled={!!state.busy}
            >
              Delete
            </button>
          )}
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lab.importJson(f);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </section>
  );
}

function KinlingBox({ session }: { session: LabSession }) {
  const k = labKinling(session);
  return (
    <section className="panel">
      <h2>
        {k.name} <span className="muted">· {k.egg} · {session.source === 'game' ? 'from game' : 'lab kinling'}</span>
      </h2>
      {PERSONALITY_KEYS.map((key) => {
        const drift = k.personality[key] - k.baseline[key];
        return (
          <Slider
            key={key}
            label={
              <>
                <span className="trait-swatch" style={{ background: TRAIT_COLORS[key] }} />
                {key}
              </>
            }
            value={k.personality[key]}
            onChange={(v) => lab.setTraits({ ...k.personality, [key]: v })}
            hint={`baseline ${k.baseline[key]} · drift ${signed(drift)}`}
          />
        );
      })}
      <div className="voice">
        <div className="small muted">What the game prompt says (personalityVoice):</div>
        {personalityVoice(k.personality).join(' ')}
      </div>
      <p className="small muted" style={{ marginBottom: 0 }}>
        {k.memories.length} memories ({k.memories.filter((m) => m.kind === 'reflection').length} reflections) · {k.chat.length} chat messages
      </p>
    </section>
  );
}

function ChatConfigBox({ cfg }: { cfg: ChatConfig }) {
  const set = (patch: Partial<ChatConfig>) => lab.updateConfig((c) => ({ ...c, chat: { ...c.chat, ...patch } }));
  return (
    <section className="panel">
      <h2>Chat prompt</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <div className="seg" role="group" aria-label="Prompt mode">
          <button aria-pressed={cfg.promptMode === 'game'} onClick={() => set({ promptMode: 'game' })}>
            Game prompt
          </button>
          <button aria-pressed={cfg.promptMode === 'custom'} onClick={() => set({ promptMode: 'custom' })}>
            Custom template
          </button>
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        {cfg.promptMode === 'game'
          ? "Sends exactly what the game's chatMessages() builds from this kinling's state, memories and chat."
          : 'Sends your template as the system prompt, then the recent messages word for word.'}
      </p>
      <Num label="Temperature" value={cfg.temperature} min={0} max={2} step={0.05} onChange={(v) => set({ temperature: v })} />
      <Num label="top_p" value={cfg.topP} min={0} max={1} step={0.05} onChange={(v) => set({ topP: v })} />
      <Num label="Frequency penalty" value={cfg.frequencyPenalty} min={0} max={2} step={0.05} onChange={(v) => set({ frequencyPenalty: v })} />
      <Num label="Max tokens" value={cfg.maxTokens} min={0} max={1024} step={10} onChange={(v) => set({ maxTokens: v })} hint="0 = the game's budget (80, or 150 for questions)" />
      <Check label="Clean replies like the game (2–3 sentences, no markup)" checked={cfg.cleanReplies} onChange={(v) => set({ cleanReplies: v })} />
      {cfg.promptMode === 'game' && <Check label="Memory search with embeddings" checked={cfg.useEmbeddings} onChange={(v) => set({ useEmbeddings: v })} />}
      {cfg.promptMode === 'custom' && (
        <>
          <Num label="History messages" value={cfg.historyMessages} min={0} max={40} onChange={(v) => set({ historyMessages: v })} />
          <Template label="System template" value={cfg.systemTemplate} onChange={(v) => set({ systemTemplate: v })} onReset={() => set({ systemTemplate: DEFAULT_CHAT_TEMPLATE })} rows={12} />
        </>
      )}
    </section>
  );
}

function EvolveConfigBox({ cfg }: { cfg: EvolveConfig }) {
  const set = (patch: Partial<EvolveConfig>) => lab.updateConfig((c) => ({ ...c, evolve: { ...c.evolve, ...patch } }));
  return (
    <section className="panel">
      <h2>Evolution (LLM trait deltas)</h2>
      <Check label="Ask the model for trait changes" checked={cfg.enabled} onChange={(v) => set({ enabled: v })} />
      <Num label="Every N turns" value={cfg.every} min={1} max={20} onChange={(v) => set({ every: v })} />
      <Num label="Exchanges shown ({{history}})" value={cfg.window} min={1} max={20} onChange={(v) => set({ window: v })} />
      <Num label="Proposal range ±" value={cfg.proposalRange} min={1} max={20} onChange={(v) => set({ proposalRange: v })} hint="Enforced by the JSON schema" />
      <Num label="Max applied step ±" value={cfg.maxStep} min={0} max={50} onChange={(v) => set({ maxStep: v })} />
      <Num label="Drift limit from baseline" value={cfg.driftLimit} min={0} max={100} onChange={(v) => set({ driftLimit: v })} />
      <Num label="Temperature" value={cfg.temperature} min={0} max={2} step={0.05} onChange={(v) => set({ temperature: v })} />
      <Num label="Max tokens" value={cfg.maxTokens} min={16} max={1024} step={10} onChange={(v) => set({ maxTokens: v })} />
      <Num label="Growth notes fed back" value={cfg.feedbackNotes} min={0} max={20} onChange={(v) => set({ feedbackNotes: v })} hint="How many recent reasons fill {{growthNotes}}" />
      <Check label="Save reasons as reflection memories (shows in the game prompt)" checked={cfg.recordReflections} onChange={(v) => set({ recordReflections: v })} />
      <Template label="System template" value={cfg.systemTemplate} onChange={(v) => set({ systemTemplate: v })} onReset={() => set({ systemTemplate: DEFAULT_EVOLVE_SYSTEM })} rows={12} />
      <Template label="User template" value={cfg.userTemplate} onChange={(v) => set({ userTemplate: v })} onReset={() => set({ userTemplate: DEFAULT_EVOLVE_USER })} rows={4} />
      <details style={{ marginTop: 8 }}>
        <summary className="small">Template variables</summary>
        <div className="vars" style={{ marginTop: 6 }}>
          {TEMPLATE_VARS.map((v) => (
            <span key={v.name} style={{ display: 'contents' }}>
              <code>{`{{${v.name}}}`}</code>
              <span className="muted">{v.about}</span>
            </span>
          ))}
        </div>
      </details>
    </section>
  );
}

export function SetupPanel({ state }: { state: LabState }) {
  const s = state.session;
  return (
    <>
      <div className="top">
        <h1>Personality Lab</h1>
        <a className="small" href="./">
          Game
        </a>
      </div>
      <ModelBox session={s} />
      <SessionBox state={state} />
      {s && <KinlingBox session={s} />}
      {s && <ChatConfigBox cfg={s.config.chat} />}
      {s && <EvolveConfigBox cfg={s.config.evolve} />}
    </>
  );
}
