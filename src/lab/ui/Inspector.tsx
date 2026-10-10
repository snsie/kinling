// Right column: every model call for the selected turn, word for word: the
// messages, the literal ChatML, what changed in the system prompt, the
// settings, the output and what the lab made of it. Any call can be edited
// and re-sent to compare.
import { useState } from 'react';
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { systemText } from '../build';
import { messageText, toChatML } from '../chatml';
import { diffLines, hasChanges } from '../diff';
import { lab, type LabState } from '../store';
import type { CallRecord, LabSession } from '../types';
import { PERSONALITY_KEYS, signed } from './controls';

type Tab = 'messages' | 'chatml' | 'diff' | 'settings';

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

function Messages({ messages }: { messages: ChatCompletionMessageParam[] }) {
  return (
    <div className="stack">
      {messages.map((m, i) => {
        const text = messageText(m);
        return (
          <details key={i} className={`msg ${m.role}`} open>
            <summary>
              {m.role} <span className="muted">· {text.length} chars</span>
            </summary>
            <pre className="text">{text}</pre>
          </details>
        );
      })}
    </div>
  );
}

function PromptDiff({ session, call }: { session: LabSession; call: CallRecord }) {
  const chats = session.calls.filter((c) => c.kind === 'chat');
  const idx = chats.findIndex((c) => c.id === call.id);
  const prev = idx > 0 ? chats[idx - 1] : null;
  if (!prev) return <p className="small muted">This is the first chat call; there is nothing to compare with yet.</p>;
  const prevTurn = session.turns.find((t) => t.id === prev.turnId);
  const diff = diffLines(systemText(prev.messages), systemText(call.messages));
  const changed = diff.filter((d) => d.kind !== 'same').length;
  const steps = session.traitSteps.filter((s) => s.at > prev.at && s.at < call.at && Object.values(s.applied).some((v) => v));
  return (
    <div className="stack">
      <p className="small" style={{ margin: 0 }}>
        System prompt compared with turn {prevTurn?.index ?? '?'}: {hasChanges(diff) ? `${changed} lines changed.` : 'no change.'}
      </p>
      {steps.length > 0 && !hasChanges(diff) && (
        <div className="note">Traits moved since then ({steps.length} change{steps.length > 1 ? 's' : ''}), but the system prompt is identical: the change never reached the model.</div>
      )}
      <pre className="text out">
        {diff.map((d, i) => (
          <span key={i} className={`diff-line ${d.kind}`}>
            {d.kind === 'added' ? '+ ' : d.kind === 'removed' ? '- ' : '  '}
            {d.text || ' '}
          </span>
        ))}
      </pre>
    </div>
  );
}

function Parsed({ call }: { call: CallRecord }) {
  const p = call.parsed as Record<string, unknown> | undefined;
  if (!p) return null;
  if (call.kind === 'chat' && typeof p.reply === 'string') {
    if (p.reply === call.output.trim()) return null;
    return (
      <div>
        <h3>Shown as the reply (after cleanup)</h3>
        <pre className="text out">{p.reply}</pre>
      </div>
    );
  }
  if (call.kind === 'evolve') {
    if (typeof p.error === 'string') return <div className="note">{p.error}</div>;
    const proposed = (p.proposed ?? {}) as Record<string, number>;
    const applied = (p.applied ?? {}) as Record<string, number>;
    return (
      <div>
        <h3>Trait proposal</h3>
        <table className="deltas">
          <thead>
            <tr>
              <th>Trait</th>
              <th>Model asked</th>
              <th>Applied</th>
            </tr>
          </thead>
          <tbody>
            {PERSONALITY_KEYS.map((key) => (
              <tr key={key}>
                <td>{key}</td>
                <td className="num">{signed(proposed[key] ?? 0)}</td>
                <td className="num">{signed(applied[key] ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {typeof p.reason === 'string' && p.reason && <p className="reason">“{p.reason}”</p>}
      </div>
    );
  }
  return null;
}

function RerunEditor({ call, onClose, busy }: { call: CallRecord; onClose: () => void; busy: boolean }) {
  const [texts, setTexts] = useState(() => call.messages.map(messageText));
  const [temperature, setTemperature] = useState(call.body.temperature);
  return (
    <div className="stack">
      {call.messages.map((m, i) => (
        <div key={i} className="stack">
          <label className="small muted" htmlFor={`${call.id}-m${i}`}>
            {m.role}
          </label>
          <textarea
            id={`${call.id}-m${i}`}
            className="template"
            rows={m.role === 'system' ? 12 : 3}
            value={texts[i]}
            spellCheck={false}
            onChange={(e) => setTexts(texts.map((t, j) => (j === i ? e.target.value : t)))}
          />
        </div>
      ))}
      <div className="row">
        <label className="small muted" htmlFor={`${call.id}-temp`}>
          Temperature
        </label>
        <input id={`${call.id}-temp`} type="number" min={0} max={2} step={0.05} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} style={{ width: 72 }} />
        <button
          className="btn primary"
          disabled={busy}
          onClick={() => {
            const messages = call.messages.map((m, i) => ({ ...m, content: texts[i] ?? '' }) as ChatCompletionMessageParam);
            void lab.rerun(call, messages, temperature);
          }}
        >
          Re-run
        </button>
        <button className="btn" onClick={onClose}>
          Close
        </button>
        <span className="small muted">Results appear below; the session is not changed.</span>
      </div>
    </div>
  );
}

function CallCard({ session, call, busy }: { session: LabSession; call: CallRecord; busy: boolean }) {
  const [tab, setTab] = useState<Tab>('messages');
  const [editing, setEditing] = useState(false);
  const reruns = session.calls.filter((c) => c.sourceId === call.id);
  const chatml = toChatML(call.messages);
  const tabs: [Tab, string][] = [
    ['messages', `Messages (${call.messages.length})`],
    ['chatml', 'Raw ChatML'],
    ...(call.kind === 'chat' ? ([['diff', 'Prompt diff']] as [Tab, string][]) : []),
    ['settings', 'Settings'],
  ];
  return (
    <div className="call">
      <div className="call-head">
        <span className={`badge ${call.kind}`}>{call.kind}</span>
        <span className="small mono">{call.variant || call.modelId}</span>
        <span className="small muted">
          {call.usage ? `${call.usage.promptTokens} prompt + ${call.usage.completionTokens} output tokens` : `${chatml.length} chars in`}
          {call.ms !== undefined && ` · ${(call.ms / 1000).toFixed(1)}s`}
          {!call.done && ' · generating…'}
        </span>
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={() => copy(chatml)}>
          Copy prompt
        </button>
        <button className="btn small" onClick={() => setEditing(!editing)} disabled={!call.done}>
          Edit & re-run
        </button>
      </div>
      <div className="call-body">
        {editing ? (
          <RerunEditor call={call} busy={busy} onClose={() => setEditing(false)} />
        ) : (
          <>
            <div className="tabs" role="tablist">
              {tabs.map(([id, label]) => (
                <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'messages' && <Messages messages={call.messages} />}
            {tab === 'chatml' && (
              <div className="stack">
                <span className="small muted">The text the model actually reads ({chatml.length} chars), using Qwen3's chat template with thinking turned off.</span>
                <pre className="text out">{chatml}</pre>
              </div>
            )}
            {tab === 'diff' && <PromptDiff session={session} call={call} />}
            {tab === 'settings' && <pre className="text out">{JSON.stringify(call.body, (k, v) => (k === 'schema' && typeof v === 'string' ? JSON.parse(v) : v), 2)}</pre>}
          </>
        )}
        <div>
          <h3>Output{call.error ? <span style={{ color: 'var(--del-ink)' }}> · {call.error}</span> : null}</h3>
          <pre className="text out">{call.output || (call.done ? '(empty)' : '…')}</pre>
          {call.output.startsWith('<think>\n\n</think>') && (
            <span className="small muted">The leading empty think block is inserted by WebLLM (thinking off), not generated by the model.</span>
          )}
        </div>
        <Parsed call={call} />
        {reruns.length > 0 && (
          <div className="reruns">
            {reruns.map((r) => (
              <CallCard key={r.id} session={session} call={r} busy={busy} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function Inspector({ state }: { state: LabState }) {
  const s = state.session;
  if (!s) return <div className="empty">Model calls will appear here.</div>;
  const turnId = state.selectedTurnId ?? s.turns.at(-1)?.id ?? null;
  const turn = s.turns.find((t) => t.id === turnId);
  const calls = s.calls.filter((c) => c.turnId === turnId && c.kind !== 'rerun');
  return (
    <>
      <div className="row spread">
        <h2 style={{ margin: 0 }}>Inspector{turn ? ` · turn ${turn.index}` : ''}</h2>
        {s.turns.length > 0 && (
          <select aria-label="Turn" value={turnId ?? ''} onChange={(e) => lab.selectTurn(e.target.value)}>
            {s.turns.map((t) => (
              <option key={t.id} value={t.id}>
                Turn {t.index}: {t.playerText.slice(0, 40)}
              </option>
            ))}
          </select>
        )}
      </div>
      {calls.length === 0 && <div className="empty">Send a message to see what goes into the model and what comes out.</div>}
      {calls.map((c) => (
        <CallCard key={c.id} session={s} call={c} busy={!!state.busy} />
      ))}
    </>
  );
}
