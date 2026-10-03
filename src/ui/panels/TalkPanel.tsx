// Compact chat with the creature. Replies stream from the local model when
// available; otherwise authored lines are used. Proposed actions appear as
// buttons the player must press — the model never acts on its own.
import { useEffect, useRef, useState } from 'react';
import { runProposedAction, sendChat, stopGenerating } from '../../app/actions';
import { useAiStatus } from '../../app/aiControl';
import { ui, useUi, type ChatAttachment } from '../../app/ui';
import { checkAction } from '../../game/careProposals';
import { traitLabel } from '../../game/traits';
import type { RouteId, SaveData } from '../../game/types';
import { Icon } from '../icons';
import { Kinetic } from '../motion';

const QUICK = ['How are you feeling?', 'What should we do?', 'Tell me about your keepsakes', 'Remember that my favorite color is green'];

export function TalkPanel({ save, onExplore }: { save: SaveData; onExplore: (route: RouteId) => void }) {
  const c = save.creature!;
  const { chatStreaming, attachments } = useUi();
  const status = useAiStatus();
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const settled = useRef(false);
  const busy = chatStreaming !== null;
  const aiOn = status.kind === 'ready' || status.kind === 'generating';

  // Jump to the latest message on open; glide to new ones after that.
  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const glide = settled.current && !document.documentElement.classList.contains('reduce-motion');
    el.scrollTo({ top: el.scrollHeight, behavior: glide ? 'smooth' : 'auto' });
    settled.current = true;
  }, [save.chat.length, chatStreaming]);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    setText('');
    void sendChat(v);
  };

  return (
    <div className="panel talk">
      <div className="talk__head">
        <h2 className="panel__title">
          <Kinetic text={`Talk with ${c.name}`} />
        </h2>
        <span className={`pill ${aiOn ? 'pill--ok' : ''}`} title={aiOn ? 'Replies come from the on-device model' : 'Replies use hand-written lines'}>
          {aiOn ? 'On-device AI' : 'Own words'}
        </span>
      </div>
      <div className="chat-log" ref={logRef} role="log" aria-label="Conversation" aria-live="polite">
        {save.chat.length === 0 && !busy && <p className="hint chat-empty">Say hello! You can also ask {c.name} to do things, or describe a new look.</p>}
        {save.chat.map((m) => (
          <div key={m.id} className={`msg msg--${m.role}`}>
            <div className="msg__bubble">
              <span className="sr-only">{m.role === 'player' ? 'You' : c.name}: </span>
              {m.text}
            </div>
            {attachments[m.id] && <Attachment a={attachments[m.id]!} messageId={m.id} save={save} onExplore={onExplore} />}
          </div>
        ))}
        {busy && (
          <div className="msg msg--creature">
            <div className="msg__bubble msg__bubble--typing">
              {chatStreaming ? chatStreaming : <span className="typing" aria-label={`${c.name} is thinking`}><i /><i /><i /></span>}
            </div>
          </div>
        )}
      </div>
      <div className="quick" role="group" aria-label="Quick messages">
        {QUICK.map((q) => (
          <button key={q} className="chip" onClick={() => submit(q)} disabled={busy}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <label htmlFor="chat-text" className="sr-only">
          Message {c.name}
        </label>
        <input id="chat-text" className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder={`Say something to ${c.name}…`} autoComplete="off" />
        {busy ? (
          <button type="button" className="btn btn--ghost" onClick={stopGenerating} aria-label="Stop reply">
            {Icon.stop(18)} Stop
          </button>
        ) : (
          <button type="submit" className="btn btn--primary" disabled={!text.trim()} aria-label="Send">
            {Icon.send(18)}
          </button>
        )}
      </form>
      {!aiOn && <p className="hint">The on-device AI is off or still loading, so {c.name} answers with its own hand-written words. Manage AI in Settings.</p>}
    </div>
  );
}

function Attachment({ a, messageId, save, onExplore }: { a: ChatAttachment; messageId: string; save: SaveData; onExplore: (r: RouteId) => void }) {
  if (a.kind === 'evolution') {
    return (
      <div className="attach">
        <p className="hint">Idea: {a.translation.request.changes.map((ch) => (ch.remove ? `no ${traitLabel(ch.trait).toLowerCase()}` : traitLabel(ch.trait).toLowerCase())).join(', ')}</p>
        <button
          className="btn btn--small"
          onClick={() => {
            ui.setEvolutionDraft({ text: a.text, translation: a.translation });
            ui.setTab('evolve');
          }}
        >
          Preview in Evolve
        </button>
      </div>
    );
  }
  if (a.used) return <p className="hint attach">Done!</p>;
  return (
    <div className="attach" role="group" aria-label="Suggested actions">
      {a.actions.map((ca, i) => {
        const live = checkAction(save, ca.action);
        return (
          <button
            key={i}
            className="btn btn--small"
            disabled={!live.available}
            title={live.reason}
            onClick={() => {
              const res = runProposedAction(ca.action);
              if (res.explore) onExplore(res.explore.route);
              if (res.ok) ui.attach(messageId, { ...a, used: true });
            }}
          >
            {ca.label}
            {!live.available && live.reason ? ` — ${live.reason}` : ''}
          </button>
        );
      })}
    </div>
  );
}
