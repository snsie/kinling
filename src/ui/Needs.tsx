import { distressLevel } from '../game/arc';
import { NEED_LABELS, needStatus } from '../game/needs';
import type { Needs as NeedValues } from '../game/types';
import { Meter } from './common';
import { ItemIcon } from '../render/ItemIcon';

const COLORS = {
  hunger: 'var(--meter-hunger)',
  energy: 'var(--meter-energy)',
  cleanliness: 'var(--meter-clean)',
  happiness: 'var(--meter-happy)',
} as const;

const ICONS = {
  hunger: <ItemIcon kind="dewberry" size={18} />,
  energy: <ItemIcon kind="starDrop" size={18} />,
  cleanliness: <ItemIcon kind="dewdrop" size={18} />,
  happiness: <ItemIcon kind="petal" size={18} />,
} as const;

const CALM_STATUS = { calm: 'Calm', uneasy: 'Uneasy', upset: 'Upset', distraught: 'Distraught' } as const;

/** Needs, plus how calm the kinling is about being looked after (when known). */
export function NeedsPanel({ needs, distress }: { needs: NeedValues; distress?: number }) {
  return (
    <section className="needs card" aria-label="Needs">
      {(Object.keys(NEED_LABELS) as (keyof NeedValues)[]).map((k) => (
        <Meter key={k} label={NEED_LABELS[k]} value={needs[k]} status={needStatus(k, needs[k])} color={COLORS[k]} icon={ICONS[k]} />
      ))}
      {distress !== undefined && (
        <Meter label="Calm" value={100 - distress} status={CALM_STATUS[distressLevel(distress)]} color="var(--lilac)" icon={<ItemIcon kind="stardust" size={18} />} />
      )}
    </section>
  );
}
