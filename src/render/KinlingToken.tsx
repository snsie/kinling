// One kinling standing in the top-down room: the usual creature drawing,
// small, with a name tag and a ring when it is the selected kinling.
import { memo } from 'react';
import type { Mood } from '../game/needs';
import type { CreatureAnim } from '../game/outcome';
import type { Appearance, LifeStage } from '../game/types';
import { Creature } from './Creature';

/** Room tile size in SVG units. */
export const TILE = 60;
/** Creature art is drawn in a 200-unit box; this shrinks it to about 1.4 tiles. */
const SCALE = 0.42;

export interface KinlingTokenProps {
  id: string;
  name: string;
  appearance: Appearance;
  stage: LifeStage;
  mood: Mood;
  anim: CreatureAnim;
  /** Position in tiles. */
  x: number;
  y: number;
  facing: 1 | -1;
  moving: boolean;
  selected: boolean;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
}

export const KinlingToken = memo(function KinlingToken(p: KinlingTokenProps) {
  return (
    <g
      className={`token ${p.selected ? 'token--selected' : ''} ${p.reducedMotion ? 'token--hop' : ''}`}
      style={{ transform: `translate(${p.x * TILE}px, ${p.y * TILE}px)` }}
      onClick={() => p.onSelect(p.id)}
      data-kinling={p.id}
    >
      {p.selected && <ellipse className="token__ring" cx={0} cy={8} rx={30} ry={10} />}
      <g transform={`translate(${-100 * SCALE} ${-176 * SCALE}) scale(${SCALE})`}>
        <Creature asGroup appearance={p.appearance} stage={p.stage} anim={p.anim} mood={p.mood} facing={p.facing} moving={p.moving} reducedMotion={p.reducedMotion} />
      </g>
      <g className="token__tag" transform="translate(0 26)">
        <rect x={-p.name.length * 4.2 - 8} y={-10} width={p.name.length * 8.4 + 16} height={20} rx={10} />
        <text textAnchor="middle" dominantBaseline="central">
          {p.name}
        </text>
      </g>
    </g>
  );
});
