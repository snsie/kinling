// Playing is something the player does: throw the ball, wave the feather wand
// or blow bubbles to pop. Finishing the task uses the toy up; backing out keeps it.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { doCare } from '../app/actions';
import { ui } from '../app/ui';
import { TOYS } from '../game/catalog';
import type { ToyId } from '../game/types';
import { ItemIcon } from '../render/ItemIcon';

const HINTS: Record<ToyId, string> = {
  ball: 'Hold the button to wind up, then let go at full power.',
  featherWand: 'Wave the wand side to side: drag across, or use ← and →.',
  bubbleWand: 'Pop the bubbles before they float away.',
};

export function PlayTask({ toy, name }: { toy: ToyId; name: string }) {
  const def = TOYS[toy];
  const [result, setResult] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // The task opens under the care buttons, which can sit at the bottom of the screen.
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  // Let the moment land before the kinling reacts.
  const complete = (line: string, delay = 900) => {
    setResult(line);
    timer.current = window.setTimeout(() => {
      ui.setPlayTask(null);
      doCare('play', undefined, toy);
    }, delay);
  };

  return (
    <div ref={box} className="play-task" role="group" aria-label={`Play with the ${def.name}`}>
      <div className="play-task__head">
        <ItemIcon kind={toy} size={30} />
        <div className="play-task__text">
          <strong>
            {def.verb} the {def.name}
          </strong>
          <span className="play-task__hint" aria-live="polite">
            {result ?? HINTS[toy]}
          </span>
        </div>
        {!result && (
          <button className="btn btn--small" onClick={() => ui.setPlayTask(null)}>
            Not now
          </button>
        )}
      </div>
      {toy === 'ball' && <ThrowBall name={name} onDone={complete} />}
      {toy === 'featherWand' && <WaveFeather name={name} onDone={complete} />}
      {toy === 'bubbleWand' && <PopBubbles name={name} onDone={complete} />}
    </div>
  );
}

interface TaskProps {
  name: string;
  onDone: (line: string, delay?: number) => void;
}

/** Power swings up and down while held; letting go at the top throws furthest. */
function ThrowBall({ name, onDone }: TaskProps) {
  const [power, setPower] = useState(0);
  const [thrown, setThrown] = useState<number | null>(null);
  const start = useRef<number | null>(null);
  const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const begin = () => {
    if (thrown !== null || start.current !== null) return;
    start.current = performance.now();
    const step = (t: number) => {
      if (start.current === null) return;
      const phase = ((t - start.current) % 1600) / 1600;
      setPower(Math.round((1 - Math.abs(1 - 2 * phase)) * 100));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  };
  const release = () => {
    if (start.current === null) return;
    cancelAnimationFrame(raf.current);
    start.current = null;
    const p = Math.max(power, 8);
    setThrown(p);
    onDone(p >= 80 ? `What a throw! ${name} races after it.` : p >= 40 ? `Nice throw! ${name} bounds off after it.` : `A little short, but ${name} pounces on it anyway.`, 1100);
  };
  const keyDown = (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (!e.repeat) begin();
  };
  const keyUp = (e: KeyboardEvent) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    release();
  };

  return (
    <div className="play-ball">
      <div className="play-ball__field" aria-hidden="true">
        <span className={`play-ball__ball ${thrown !== null ? 'play-ball__ball--thrown' : ''}`} style={{ left: `${thrown === null ? 4 : 6 + thrown * 0.8}%` }}>
          <ItemIcon kind="ball" size={26} />
        </span>
      </div>
      <div className="play-ball__power" role="meter" aria-label="Throw power" aria-valuemin={0} aria-valuemax={100} aria-valuenow={thrown ?? power}>
        <div className="play-ball__fill" style={{ width: `${thrown ?? power}%` }} />
      </div>
      <button
        className="btn btn--primary play-ball__btn"
        disabled={thrown !== null}
        onPointerDown={(e: PointerEvent) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          begin();
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={keyDown}
        onKeyUp={keyUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        {thrown !== null ? 'Thrown!' : start.current !== null ? 'Let go to throw' : 'Hold to wind up'}
      </button>
    </div>
  );
}

const WAVES_NEEDED = 6;
/** Fraction of the pad the wand must travel before a change of direction counts. */
const WAVE_SPAN = 0.22;

function WaveFeather({ name, onDone }: TaskProps) {
  const [x, setX] = useState(0.5);
  const [waves, setWaves] = useState(0);
  const track = useRef({ x: 0.5, dir: 0, from: 0.5, waves: 0 });
  const pad = useRef<HTMLDivElement>(null);

  const moveTo = (next: number) => {
    const t = track.current;
    if (t.waves >= WAVES_NEEDED) return;
    const clamped = Math.min(1, Math.max(0, next));
    const dir = Math.sign(clamped - t.x);
    if (dir && dir !== t.dir) {
      // A turn counts as a wave once the wand travelled far enough the other way.
      if (t.dir && Math.abs(t.x - t.from) >= WAVE_SPAN) {
        t.waves += 1;
        setWaves(t.waves);
        if (t.waves === WAVES_NEEDED) onDone(`${name} leaps and catches the feathers!`);
      }
      t.dir = dir;
      t.from = t.x;
    }
    t.x = clamped;
    setX(clamped);
  };
  const pointer = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    const r = pad.current!.getBoundingClientRect();
    moveTo((e.clientX - r.left) / r.width);
  };
  const keyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') moveTo(track.current.x - 0.3);
    else if (e.key === 'ArrowRight') moveTo(track.current.x + 0.3);
    else return;
    e.preventDefault();
  };

  return (
    <div className="play-feather">
      <div
        ref={pad}
        className="play-feather__pad"
        tabIndex={0}
        role="slider"
        aria-label="Feather wand"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(x * 100)}
        aria-valuetext={`${waves} of ${WAVES_NEEDED} waves`}
        onPointerMove={pointer}
        onPointerDown={pointer}
        onKeyDown={keyDown}
      >
        <span className={`play-feather__wand ${waves >= WAVES_NEEDED ? 'play-feather__wand--caught' : ''}`} style={{ left: `${x * 100}%` }}>
          <ItemIcon kind="featherWand" size={40} />
        </span>
      </div>
      <ol className="play-dots" aria-hidden="true">
        {Array.from({ length: WAVES_NEEDED }, (_, i) => (
          <li key={i} className={i < waves ? 'is-done' : ''} />
        ))}
      </ol>
    </div>
  );
}

const BUBBLES = 5;

function PopBubbles({ name, onDone }: TaskProps) {
  const [bubbles] = useState(() =>
    Array.from({ length: BUBBLES }, (_, i) => ({
      id: i,
      x: 12 + (i * 76) / (BUBBLES - 1) + (Math.random() - 0.5) * 8,
      size: 30 + Math.round(Math.random() * 14),
      delay: i * 0.45,
      duration: 3.6 + Math.random() * 1.4,
    })),
  );
  const [popped, setPopped] = useState<number[]>([]);
  const pop = (id: number) => {
    if (popped.includes(id)) return;
    const next = [...popped, id];
    setPopped(next);
    if (next.length === BUBBLES) onDone(`Pop, pop, pop! ${name} is giggling.`);
  };

  return (
    <div className="play-bubbles">
      <div className="play-bubbles__pond">
        {bubbles.map((b) => (
          <button
            key={b.id}
            className={`play-bubble ${popped.includes(b.id) ? 'play-bubble--popped' : ''}`}
            style={{ left: `${b.x}%`, width: b.size, height: b.size, animationDelay: `${b.delay}s`, animationDuration: `${b.duration}s` }}
            onClick={() => pop(b.id)}
            disabled={popped.includes(b.id)}
            aria-label={popped.includes(b.id) ? 'Popped bubble' : 'Pop bubble'}
          />
        ))}
      </div>
      <ol className="play-dots" aria-hidden="true">
        {bubbles.map((b, i) => (
          <li key={b.id} className={i < popped.length ? 'is-done' : ''} />
        ))}
      </ol>
    </div>
  );
}
