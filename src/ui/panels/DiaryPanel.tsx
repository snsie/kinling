// Diary entries grounded in recorded events, plus memories and player facts.
import { useState } from 'react';
import { addFact, deleteMemory, pinMemory, removeFact, writeDiaryEntry } from '../../app/actions';
import { canWriteDiary, pendingDiaryEvents } from '../../game/social';
import type { SaveData } from '../../game/types';
import { formatTime } from '../common';
import { Icon } from '../icons';
import { Kinetic } from '../motion';

export function DiaryPanel({ save }: { save: SaveData }) {
  const c = save.creature!;
  const [writing, setWriting] = useState<string | null>(null);
  const [fact, setFact] = useState('');
  const ready = canWriteDiary(save);
  const pending = pendingDiaryEvents(save);
  const memories = [...save.memories].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.at - a.at);

  const write = async () => {
    setWriting('');
    try {
      await writeDiaryEntry((t) => setWriting(t));
    } finally {
      setWriting(null);
    }
  };

  return (
    <div className="panel diary">
      <h2 className="panel__title">
        <Kinetic text={`${c.name}'s diary`} />
      </h2>
      <div className="diary__write card">
        {ready ? (
          <>
            <p>
              {pending.length} thing{pending.length === 1 ? '' : 's'} happened since the last entry. Ready to write?
            </p>
            <button className="btn btn--primary" onClick={() => void write()} disabled={writing !== null}>
              {writing !== null ? 'Writing…' : "Write today's entry"}
            </button>
          </>
        ) : (
          <p className="hint">Do a few things together (care, explore, evolve) and {c.name} will have something to write about.</p>
        )}
        {writing !== null && <p className="diary__draft" aria-live="polite">{writing || '…'}</p>}
      </div>

      <ol className="diary__entries" reversed>
        {[...save.diary].reverse().map((d) => (
          <li key={d.id} className="diary-entry" data-reveal="">
            <div className="diary-entry__meta">
              <time dateTime={new Date(d.at).toISOString()}>{formatTime(d.at)}</time>
              <span className="pill pill--small">{d.source === 'ai' ? 'Written with on-device AI' : 'Written from today’s events'}</span>
            </div>
            <p>{d.text}</p>
          </li>
        ))}
        {save.diary.length === 0 && <li className="hint">No entries yet.</li>}
      </ol>

      <section className="tile diary__section" aria-labelledby="mem-title" data-reveal="">
        <h3 id="mem-title">Memories</h3>
        <p className="hint">Recorded from things that really happened in the game. Pinned memories are always kept and mentioned more often.</p>
        <ul className="memory-list">
          {memories.map((m) => (
            <li key={m.id} className={`memory ${m.pinned ? 'memory--pinned' : ''}`}>
              <span className="memory__text">{m.text}</span>
              <span className="memory__meta">{formatTime(m.at)}</span>
              <span className="memory__actions">
                <button className="icon-btn icon-btn--small" aria-pressed={m.pinned} onClick={() => pinMemory(m.id, !m.pinned)} aria-label={m.pinned ? 'Unpin memory' : 'Pin memory'} title={m.pinned ? 'Unpin' : 'Pin'}>
                  {Icon.pin(16)}
                </button>
                <button className="icon-btn icon-btn--small" onClick={() => deleteMemory(m.id)} aria-label="Forget memory" title="Forget">
                  {Icon.trash(16)}
                </button>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="tile diary__section" aria-labelledby="facts-title" data-reveal="">
        <h3 id="facts-title">Things you told {c.name}</h3>
        <p className="hint">Only things you add here (or say as “remember that…”) are saved as facts about you.</p>
        <ul className="memory-list">
          {save.player.facts.map((f) => (
            <li key={f.id} className="memory">
              <span className="memory__text">{f.text}</span>
              <span className="memory__actions">
                <button className="icon-btn icon-btn--small" onClick={() => removeFact(f.id)} aria-label={`Forget: ${f.text}`}>
                  {Icon.trash(16)}
                </button>
              </span>
            </li>
          ))}
          {save.player.facts.length === 0 && <li className="hint">Nothing yet.</li>}
        </ul>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (addFact(fact)) setFact('');
          }}
        >
          <label htmlFor="fact-text" className="sr-only">
            Something about you
          </label>
          <input id="fact-text" className="input" value={fact} maxLength={160} onChange={(e) => setFact(e.target.value)} placeholder="e.g. I love rainy days" />
          <button className="btn" type="submit" disabled={fact.trim().length < 3}>
            Add
          </button>
        </form>
      </section>
    </div>
  );
}
