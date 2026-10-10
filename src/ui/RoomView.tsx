// The home room from above: furniture, wandering kinlings, their speech
// bubbles, a keyboard-friendly kinling picker, and a waiting egg.
import { memo, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { beginEggHatch, chooseKinling } from '../app/actions';
import { useRoom } from '../app/room';
import { useUi } from '../app/ui';
import { TOPIC_LABELS, isTopic } from '../game/chatter';
import { EGG_LEVEL, eggWaiting } from '../game/eggs';
import { deriveMood } from '../game/needs';
import { lifeStageFor } from '../game/stage';
import { activeKinling } from '../game/state';
import type { KeepsakeId, SaveData } from '../game/types';
import { FURNITURE_BY_ID, furnitureNear, COLS, ROWS } from '../room/layout';
import type { RoomKinling } from '../room/sim';
import { Creature } from '../render/Creature';
import { Egg } from '../render/Egg';
import { timeOfDayFor, type TimeOfDay } from '../render/Habitat';
import { ItemGlyph } from '../render/ItemIcon';
import { KinlingToken, TILE } from '../render/KinlingToken';
import '../styles/room.css';

const W = COLS * TILE;
const H = ROWS * TILE;

const SKY: Record<TimeOfDay, string> = { morning: '#FBE2C4', day: '#B9E0F6', evening: '#F3A77E', night: '#24305E' };
const TINT: Record<TimeOfDay, { color: string; opacity: number }> = {
  morning: { color: '#FFD3B4', opacity: 0.12 },
  day: { color: '#FFFFFF', opacity: 0 },
  evening: { color: '#E98F6A', opacity: 0.16 },
  night: { color: '#2E3570', opacity: 0.38 },
};

export function SpeechBubble({ name }: { name: string }) {
  const { speech } = useUi();
  if (!speech) return null;
  return (
    <div className={`speech ${speech.streaming ? 'speech--streaming' : ''}`} key={speech.key}>
      <span className="sr-only">{name} says: </span>
      {speech.text}
      {speech.streaming && <span className="speech__caret" aria-hidden="true" />}
    </div>
  );
}

/**
 * Place a bubble on a kinling at (x, y) in tiles: above it, or below it when
 * there's no room above. Near the sides it hangs off to one side, with its
 * tail still pointing at the kinling, so it never runs past the room's edge.
 */
function bubbleAt(x: number, y: number, maxPx: number): { style: CSSProperties; className: string } {
  const xPct = (x / COLS) * 100;
  const below = y < 3.5;
  const style: CSSProperties = { top: `${((below ? y + 0.75 : y - 1.25) / ROWS) * 100}%` };
  const classes = ['bubble-pos', below ? 'bubble-pos--below' : ''];
  if (xPct < 35) {
    classes.push('bubble-pos--left');
    style.left = `calc(${xPct}% - 26px)`;
    style.maxWidth = `min(${maxPx}px, calc(${100 - xPct}% + 20px))`;
  } else if (xPct > 65) {
    classes.push('bubble-pos--right');
    style.left = 'auto';
    style.right = `calc(${100 - xPct}% - 26px)`;
    style.maxWidth = `min(${maxPx}px, calc(${xPct}% + 20px))`;
  } else {
    style.left = `${xPct}%`;
    style.maxWidth = `min(${maxPx}px, ${2 * Math.min(xPct, 100 - xPct) - 4}%)`;
  }
  return { style, className: classes.filter(Boolean).join(' ') };
}

function snap(k: RoomKinling, reducedMotion: boolean): { x: number; y: number } {
  // With reduced motion kinlings hop from tile to tile instead of gliding.
  return reducedMotion ? { x: Math.floor(k.x) + 0.5, y: Math.floor(k.y) + 0.5 } : { x: k.x, y: k.y };
}

export function RoomView({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const { anim } = useUi();
  const { room, talk } = useRoom();
  const active = activeKinling(save)!;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const tod = timeOfDayFor(now);
  const placed = room?.kinlings ?? [];
  const byId = useMemo(() => new Map(save.kinlings.map((k) => [k.id, k])), [save.kinlings]);
  const keepsakes = useMemo(() => save.inventory.keepsakes.map((k) => k.id), [save.inventory.keepsakes]);
  const activeSpot = placed.find((k) => k.id === active.id);
  const line = talk ? talk.log.lines[talk.index] : null;
  const activeTalking = talk ? talk.log.a === active.id || talk.log.b === active.id : false;
  const speaker = line ? placed.find((k) => k.id === line.speaker) : null;
  const ordered = [...placed].sort((a, b) => a.y - b.y);

  const description = placed
    .map((p) => {
      const k = byId.get(p.id);
      if (!k) return '';
      const near = furnitureNear(p.x, p.y);
      const doing = p.mode === 'resting' ? 'is napping' : p.mode === 'talking' ? 'is chatting' : p.mode === 'walkTo' ? 'is walking' : 'is resting a moment';
      return `${k.name} ${doing}${near ? ` by the ${FURNITURE_BY_ID.get(near)!.label}` : ''}.`;
    })
    .join(' ');

  const chatting = talk ? `${byId.get(talk.log.a)?.name ?? 'A kinling'} and ${byId.get(talk.log.b)?.name ?? 'a kinling'} are chatting about ${isTopic(talk.log.topic) ? TOPIC_LABELS[talk.log.topic] : 'something'}.` : '';

  return (
    <div className="room-wrap">
      <div className="stage room">
        <svg viewBox={`0 0 ${W} ${H}`} className="room__svg" role="img" aria-label={`${active.name}'s cozy hollow. ${description}`}>
          <RoomScene keepsakes={keepsakes} tod={tod} bowlFull={anim === 'eating'} />
          {ordered.map((p) => {
            const k = byId.get(p.id);
            if (!k) return null;
            const pos = snap(p, reducedMotion);
            const isActive = k.id === active.id;
            const tokenAnim = isActive && anim !== 'idle' ? anim : p.mode === 'resting' ? 'sleeping' : 'idle';
            return (
              <KinlingToken
                key={k.id}
                id={k.id}
                name={k.name}
                appearance={k.appearance}
                stage={lifeStageFor(k.bond)}
                mood={k.arc.distress >= 45 ? 'glum' : deriveMood(k.needs)}
                anim={tokenAnim}
                x={pos.x}
                y={pos.y}
                facing={p.facing}
                moving={p.mode === 'walkTo' && !reducedMotion}
                selected={isActive && save.kinlings.length > 1}
                reducedMotion={reducedMotion}
                onSelect={chooseKinling}
              />
            );
          })}
          <rect className="room__tint" x={0} y={0} width={W} height={H} fill={TINT[tod].color} opacity={TINT[tod].opacity} />
        </svg>
        {line && speaker && (
          <div
            className={`room-bubble ${bubbleAt(speaker.x, speaker.y, 260).className}`}
            style={bubbleAt(speaker.x, speaker.y, 260).style}
            aria-hidden="true"
            key={`${talk!.log.id}-${talk!.index}`}
          >
            {line.text}
          </div>
        )}
        <div
          className={`stage__speech room__speech ${activeSpot ? bubbleAt(activeSpot.x, activeSpot.y, 380).className : ''}`}
          style={activeSpot ? bubbleAt(activeSpot.x, activeSpot.y, 380).style : undefined}
          aria-live="polite"
        >
          {!activeTalking && <SpeechBubble name={active.name} />}
        </div>
        <p className="sr-only" aria-live="polite">
          {chatting}
        </p>
      </div>
      {save.kinlings.length > 1 && <KinlingPicker save={save} reducedMotion={reducedMotion} />}
      {eggWaiting(save) && save.onboarding.step === 'done' && (
        <div className="egg-banner card">
          <span className="egg-banner__art">
            <Egg egg="woodland" state={reducedMotion ? 'idle' : 'wobble'} reducedMotion={reducedMotion} size="100%" />
          </span>
          <p>
            <strong>A new egg appeared!</strong> All your kinlings reached level {EGG_LEVEL}. Choose what kind of kinling hatches next.
          </p>
          <button className="btn btn--primary" onClick={beginEggHatch}>
            Hatch the egg
          </button>
        </div>
      )}
    </div>
  );
}

// The room re-renders ten times a second; the picker and scenery only change with the save.
const KinlingPicker = memo(function KinlingPicker({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const active = activeKinling(save)!;
  return (
    <div className="kin-picker" role="group" aria-label="Choose a kinling to care for">
      {save.kinlings.map((k) => (
        <button key={k.id} className={`kin-picker__btn ${k.id === active.id ? 'kin-picker__btn--on' : ''}`} aria-pressed={k.id === active.id} onClick={() => chooseKinling(k.id)}>
          <span className="kin-picker__face" aria-hidden="true">
            <Creature appearance={k.appearance} stage={lifeStageFor(k.bond)} mood={deriveMood(k.needs)} reducedMotion={reducedMotion} size="100%" />
          </span>
          {k.name}
        </button>
      ))}
    </div>
  );
});

const SHELF_SLOTS = [78, 112, 146, 180, 214];

/** Floor, walls and furniture, drawn from above. */
const RoomScene = memo(function RoomScene({ keepsakes, tod, bowlFull }: { keepsakes: KeepsakeId[]; tod: TimeOfDay; bowlFull: boolean }) {
  const T = TILE;
  return (
    <g aria-hidden="true">
      <defs>
        <pattern id="room-planks" width={T * 2} height={T / 2} patternUnits="userSpaceOnUse">
          <rect width={T * 2} height={T / 2} fill="#dcb98f" />
          <path d={`M0 ${T / 2 - 1} H${T * 2}`} stroke="#c49c70" strokeWidth={2} />
          <path d={`M${T * 0.7} 0 V${T / 2}`} stroke="#caa57a" strokeWidth={1.5} />
        </pattern>
        <radialGradient id="room-rug" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#f4c9a8" />
          <stop offset="70%" stopColor="#e9a98a" />
          <stop offset="100%" stopColor="#d98f72" />
        </radialGradient>
        <linearGradient id="room-water" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a8dcef" />
          <stop offset="100%" stopColor="#5fa8cf" />
        </linearGradient>
      </defs>

      {/* Floor and back wall */}
      <rect x={0} y={T} width={COLS * T} height={(ROWS - 1) * T} fill="url(#room-planks)" />
      <rect x={0} y={0} width={COLS * T} height={T} fill="#a8734c" />
      <rect x={0} y={T - 8} width={COLS * T} height={8} fill="#8a5a3a" />
      <rect x={0} y={T} width={COLS * T} height={10} fill="#000" opacity={0.08} />

      {/* Window */}
      <rect x={7 * T + 6} y={6} width={2 * T - 12} height={T - 18} rx={8} fill={SKY[tod]} stroke="#6f4a30" strokeWidth={5} />
      <path d={`M${8 * T} 8 V${T - 14} M${7 * T + 8} ${T / 2 - 4} H${9 * T - 8}`} stroke="#6f4a30" strokeWidth={3} />
      {tod === 'night' && <circle cx={8.6 * T} cy={20} r={6} fill="#fdf3c4" />}

      {/* Keepsake shelf */}
      <rect x={T + 4} y={T - 22} width={3 * T - 8} height={10} rx={3} fill="#c08a5b" stroke="#7d5235" strokeWidth={2} />
      {keepsakes.slice(0, SHELF_SLOTS.length).map((k, i) => (
        <g key={k} transform={`translate(${SHELF_SLOTS[i]! - 13} ${T - 48}) scale(0.82)`}>
          <ItemGlyph kind={k} />
        </g>
      ))}

      {/* Rug */}
      <ellipse cx={6 * T} cy={4.6 * T} rx={3.1 * T} ry={1.7 * T} fill="url(#room-rug)" />
      <ellipse cx={6 * T} cy={4.6 * T} rx={2.6 * T} ry={1.3 * T} fill="none" stroke="#fff3e3" strokeWidth={3} strokeDasharray="10 8" opacity={0.7} />

      {/* Food bowl */}
      <ellipse cx={6.5 * T} cy={1.62 * T} rx={24} ry={8} fill="#000" opacity={0.12} />
      <circle cx={6.5 * T} cy={1.5 * T} r={21} fill="#e8836b" stroke="#a8452f" strokeWidth={3} />
      <circle cx={6.5 * T} cy={1.5 * T} r={14} fill={bowlFull ? '#f2c76b' : '#fbe7d8'} />
      {bowlFull && <circle cx={6.5 * T - 4} cy={1.5 * T - 3} r={5} fill="#c9663f" />}

      {/* Bed */}
      <rect x={9 * T + 4} y={T + 6} width={2 * T - 8} height={2 * T - 10} rx={18} fill="#8a5a3a" />
      <rect x={9 * T + 10} y={T + 12} width={2 * T - 20} height={2 * T - 22} rx={14} fill="#f6efe2" />
      <rect x={9 * T + 18} y={T + 18} width={2 * T - 36} height={26} rx={12} fill="#ffffff" stroke="#e1d3bf" strokeWidth={2} />
      <path d={`M${9 * T + 10} ${1.95 * T} h${2 * T - 20} v${0.88 * T} a14 14 0 0 1 -14 14 h${-(2 * T - 48)} a14 14 0 0 1 -14 -14 z`} fill="#a7cdee" />
      <path d={`M${9 * T + 10} ${2.25 * T} h${2 * T - 20} M${9 * T + 10} ${2.55 * T} h${2 * T - 20}`} stroke="#ffffff" strokeWidth={4} opacity={0.6} />

      {/* Water tub */}
      <rect x={6} y={6 * T + 6} width={2 * T - 12} height={2 * T - 12} rx={30} fill="#9b6a45" stroke="#6f4a30" strokeWidth={4} />
      <ellipse cx={T} cy={7 * T} rx={T - 18} ry={T - 18} fill="url(#room-water)" />
      <path d={`M${T - 22} ${7 * T - 6} q 10 -6 20 0 t 20 0`} fill="none" stroke="#ffffff" strokeWidth={2.5} opacity={0.7} />

      {/* Potted plant */}
      <circle cx={11.5 * T} cy={7.5 * T} r={20} fill="#c56f4c" stroke="#8a4a2f" strokeWidth={3} />
      {[0, 72, 144, 216, 288].map((deg) => (
        <ellipse key={deg} cx={11.5 * T} cy={7.5 * T - 16} rx={9} ry={20} fill="#6fa257" stroke="#4c7a3a" strokeWidth={2} transform={`rotate(${deg} ${11.5 * T} ${7.5 * T})`} />
      ))}
      <circle cx={11.5 * T} cy={7.5 * T} r={7} fill="#8cc06f" />
    </g>
  );
});
