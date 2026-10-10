// Middle column: the trait chart, the conversation with each turn's trait
// changes, the message box and the script runner.
import { useEffect, useRef, useState } from 'react';
import { lab, type LabState } from '../store';
import type { LabSession, LabTurn } from '../types';
import { PERSONALITY_KEYS, signed, TRAIT_COLORS } from './controls';
import { TraitChart } from './TraitChart';

function TurnView({ session, turn, selected }: { session: LabSession; turn: LabTurn; selected: boolean }) {
  const chat = session.calls.find((c) => c.turnId === turn.id && c.kind === 'chat');
  const steps = session.traitSteps.filter((s) => s.turnId === turn.id && !s.manual);
  const evolves = session.calls.filter((c) => c.turnId === turn.id && c.kind === 'evolve');
  const pendingEvolve = evolves.find((c) => !c.done);
  const failedEvolve = evolves.find((c) => c.done && !steps.some((s) => s.callId === c.id));
  return (
    <div className="turn" aria-current={selected} onClick={() => lab.selectTurn(turn.id)}>
      <span className="turn-no">Turn {turn.index}</span>
      <div className="bubble player">{turn.playerText}</div>
      {turn.reply ? (
        <div className="bubble kin">{turn.reply}</div>
      ) : chat?.error ? (
        <div className="bubble kin pending">{chat.error}</div>
      ) : (
        <div className="bubble kin pending">{chat?.output || '…'}</div>
      )}
      {(steps.length > 0 || pendingEvolve || failedEvolve) && (
        <div className="steps">
          {steps.map((s) => {
            const keys = PERSONALITY_KEYS.filter((key) => s.proposed[key] || s.applied[key]);
            return (
              <div key={s.id} className="chips">
                {keys.length === 0 && <span className="chip">no change</span>}
                {keys.map((key) => {
                  const a = s.applied[key] ?? 0;
                  const p = s.proposed[key] ?? 0;
                  return (
                    <span key={key} className={`chip${a !== p ? ' clipped' : ''}`} title={a !== p ? `Model asked ${signed(p)}; limits applied ${signed(a)}` : undefined}>
                      <span className="trait-swatch" style={{ background: TRAIT_COLORS[key] }} />
                      {key} {signed(a)}
                      {a !== p && <span className="muted"> (asked {signed(p)})</span>}
                    </span>
                  );
                })}
                {s.reason && <span className="reason">“{s.reason}”</span>}
              </div>
            );
          })}
          {pendingEvolve && <span className="muted small">Evolving: {pendingEvolve.output || '…'}</span>}
          {failedEvolve && !pendingEvolve && <span className="muted small">Evolve call gave no usable proposal{failedEvolve.error ? ` (${failedEvolve.error})` : ''}.</span>}
        </div>
      )}
    </div>
  );
}

function Composer({ state }: { state: LabState }) {
  const [text, setText] = useState('');
  const [script, setScript] = useState('');
  const busy = !!state.busy;
  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    void lab.send(t);
  };
  return (
    <div className="composer">
      {state.error && (
        <div className="error" role="alert">
          <span>{state.error}</span>
          <button className="btn link small" onClick={() => lab.dismissError()}>
            Dismiss
          </button>
        </div>
      )}
      <textarea
        aria-label="Message"
        placeholder="Say something to your kinling (Enter sends, Shift+Enter for a new line)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      <div className="row spread">
        <div className="row">
          <button className="btn primary" onClick={send} disabled={busy || !text.trim()}>
            Send
          </button>
          <button className="btn" onClick={() => void lab.evolve()} disabled={busy || !state.session?.turns.length} title="Run the evolve call on the conversation so far">
            Evolve now
          </button>
          {busy && (
            <button className="btn" onClick={() => lab.stop()}>
              Stop
            </button>
          )}
        </div>
        <span className="small muted">
          {state.busy}
          {state.scriptProgress && ` ${state.scriptProgress.done + 1}/${state.scriptProgress.total}`}
        </span>
      </div>
      <details>
        <summary className="small">Script: send several messages in a row</summary>
        <div className="stack" style={{ marginTop: 6 }}>
          <textarea className="template" rows={5} placeholder="One player message per line" value={script} onChange={(e) => setScript(e.target.value)} spellCheck={false} />
          <div className="row">
            <button className="btn" onClick={() => void lab.runScript(script.split('\n'))} disabled={busy || !script.trim()}>
              Run script
            </button>
            <span className="small muted">Use Restart + the same script to compare settings on an identical conversation.</span>
          </div>
        </div>
      </details>
    </div>
  );
}

export function ConversationPanel({ state }: { state: LabState }) {
  const s = state.session;
  const end = useRef<HTMLDivElement>(null);
  const lastTurn = s?.turns.at(-1);
  const lastCall = s?.calls.at(-1);
  useEffect(() => {
    if (!state.selectedTurnId) end.current?.scrollIntoView({ block: 'end' });
  }, [lastTurn?.id, lastTurn?.reply, lastCall?.output, state.selectedTurnId]);

  if (!s) return <div className="empty">Hatch a new kinling or copy one from the game to start.</div>;
  const selected = state.selectedTurnId ?? lastTurn?.id ?? null;
  return (
    <>
      <TraitChart session={s} onSelectTurn={(id) => lab.selectTurn(id)} />
      <div className="turns">
        {s.turns.length === 0 && <div className="empty">No messages yet. Say hello!</div>}
        {s.turns.map((t) => (
          <TurnView key={t.id} session={s} turn={t} selected={t.id === selected} />
        ))}
        <div ref={end} />
      </div>
      <Composer state={state} />
    </>
  );
}
