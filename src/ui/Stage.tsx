// The home habitat with the animated creature and its speech bubble.
import { useEffect, useState } from 'react';
import { useUi } from '../app/ui';
import { deriveMood } from '../game/needs';
import { lifeStageFor } from '../game/stage';
import type { SaveData } from '../game/types';
import { Creature } from '../render/Creature';
import { Habitat, timeOfDayFor } from '../render/Habitat';

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

export function Stage({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const { anim } = useUi();
  const c = save.creature!;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const mood = deriveMood(c.needs);
  const stage = lifeStageFor(c.bond);
  return (
    <div className="stage">
      <Habitat
        keepsakes={save.inventory.keepsakes.map((k) => k.id)}
        timeOfDay={timeOfDayFor(now)}
        reducedMotion={reducedMotion}
        bowl={anim === 'eating' ? 'full' : 'empty'}
        label={`${c.name}'s cozy hollow`}
      >
        <Creature appearance={c.appearance} stage={stage} anim={anim} mood={mood} reducedMotion={reducedMotion} title={`${c.name}, looking ${mood}`} size="100%" />
      </Habitat>
      <div className="stage__speech" aria-live="polite">
        <SpeechBubble name={c.name} />
      </div>
    </div>
  );
}
