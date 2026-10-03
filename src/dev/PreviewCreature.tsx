// Dev-only visual harness for creature and egg art (not part of the build).
import { createRoot } from 'react-dom/client';
import { Creature } from '../render/Creature';
import { Egg, type EggState } from '../render/Egg';
import { EGGS } from '../game/catalog';
import type { Appearance, EarId, EggType, LifeStage, TailId } from '../game/types';
import type { CreatureAnim } from '../game/outcome';
import type { Mood } from '../game/needs';

const params = new URLSearchParams(location.search);
const still = params.has('still');
const section = params.get('section') ?? 'all';

const base: Appearance = {
  bodyColor: 'rose',
  accentColor: 'cream',
  markingColor: 'lilac',
  proportions: { plump: 0.5, head: 0.5, height: 0.5 },
  pattern: 'spots',
  glow: false,
  ears: 'fluffy',
  tail: 'curled',
  horns: false,
  fins: false,
  wings: false,
};

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <figure style={{ margin: 0, background: '#fffaf3', border: '1px solid #e8d6bd', borderRadius: 12, padding: 6, width: 150 }}>
      {children}
      <figcaption style={{ fontSize: 11, textAlign: 'center', marginTop: 2 }}>{label}</figcaption>
    </figure>
  );
}

function Grid({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ padding: '8px 16px' }}>
      <h2 style={{ fontSize: 15, margin: '6px 0' }}>{title}</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{children}</div>
    </section>
  );
}

const ears: EarId[] = ['rounded', 'floppy', 'leaf', 'fluffy'];
const tails: TailId[] = ['short', 'curled', 'paddle'];
const stages: LifeStage[] = ['hatchling', 'sprout', 'grown'];
const anims: CreatureAnim[] = ['idle', 'happy', 'eating', 'playing', 'sleeping', 'grooming', 'puzzled'];
const moods: Mood[] = ['joyful', 'content', 'sleepy', 'hungry', 'messy', 'glum'];
const eggs: EggType[] = ['woodland', 'aquatic', 'celestial'];
const eggStates: EggState[] = ['idle', 'wobble', 'crack', 'open'];

function App() {
  const show = (s: string) => section === 'all' || section === s;
  return (
    <div>
      {show('parts') && (
        <Grid title="Ears × tails">
          {ears.flatMap((e) =>
            tails.map((t) => (
              <Cell key={`${e}-${t}`} label={`${e} / ${t}`}>
                <Creature appearance={{ ...base, ears: e, tail: t }} stage="sprout" reducedMotion={still} />
              </Cell>
            )),
          )}
        </Grid>
      )}
      {show('features') && (
        <Grid title="Patterns, glow and features">
          {(
            [
              ['none', { pattern: 'none' }],
              ['spots', { pattern: 'spots' }],
              ['stripes', { pattern: 'stripes', markingColor: 'cocoa' }],
              ['glow + spots', { glow: true, bodyColor: 'starlight', markingColor: 'butter' }],
              ['glow + stripes', { glow: true, pattern: 'stripes', bodyColor: 'lilac', markingColor: 'sky' }],
              ['glow, no pattern', { glow: true, pattern: 'none', bodyColor: 'starlight' }],
              ['horns', { horns: true, ears: 'leaf', bodyColor: 'moss', markingColor: 'cocoa' }],
              ['fins', { fins: true, ears: 'rounded', tail: 'paddle', bodyColor: 'lagoon', markingColor: 'sky', pattern: 'stripes' }],
              ['wings', { wings: true, bodyColor: 'lilac', markingColor: 'butter' }],
              ['horns + wings + glow', { horns: true, wings: true, glow: true, bodyColor: 'starlight', ears: 'fluffy', markingColor: 'butter' }],
              ['horns + fins', { horns: true, fins: true, ears: 'floppy', tail: 'paddle', bodyColor: 'sky', markingColor: 'lagoon' }],
              ['same mark/body', { markingColor: 'rose' }],
            ] as [string, Partial<Appearance>][]
          ).map(([label, patch]) => (
            <Cell key={label} label={label}>
              <Creature appearance={{ ...base, ...patch }} stage="sprout" reducedMotion={still} />
            </Cell>
          ))}
        </Grid>
      )}
      {show('shapes') && (
        <Grid title="Stages and extreme proportions">
          {stages.map((s) => (
            <Cell key={s} label={s}>
              <Creature appearance={base} stage={s} reducedMotion={still} />
            </Cell>
          ))}
          {(
            [
              ['plump 0', { plump: 0, head: 0.5, height: 0.5 }],
              ['plump 1', { plump: 1, head: 0.5, height: 0.5 }],
              ['height 0', { plump: 0.5, head: 0.5, height: 0 }],
              ['height 1', { plump: 0.5, head: 0.5, height: 1 }],
              ['head 0', { plump: 0.5, head: 0, height: 0.5 }],
              ['head 1', { plump: 0.5, head: 1, height: 0.5 }],
              ['all 0', { plump: 0, head: 0, height: 0 }],
              ['all 1', { plump: 1, head: 1, height: 1 }],
            ] as [string, Appearance['proportions']][]
          ).map(([label, p]) => (
            <Cell key={label} label={`${label} (grown, wings, paddle, fluffy)`}>
              <Creature appearance={{ ...base, proportions: p, wings: true, tail: 'paddle', horns: true }} stage="grown" reducedMotion={still} />
            </Cell>
          ))}
          <Cell label="all 1, fins + fluffy, grown">
            <Creature appearance={{ ...base, proportions: { plump: 1, head: 1, height: 1 }, fins: true, horns: true }} stage="grown" reducedMotion={still} />
          </Cell>
          <Cell label="hatchling all 0">
            <Creature appearance={{ ...base, proportions: { plump: 0, head: 0, height: 0 }, ears: 'floppy' }} stage="hatchling" reducedMotion={still} />
          </Cell>
        </Grid>
      )}
      {show('colors') && (
        <Grid title="Colors">
          {(['peach', 'rose', 'butter', 'mint', 'sky', 'lilac', 'cream', 'cocoa', 'moss', 'lagoon', 'starlight', 'sunset'] as const).map((c) => (
            <Cell key={c} label={c}>
              <Creature appearance={{ ...base, bodyColor: c, accentColor: c === 'cream' ? 'peach' : 'cream', markingColor: c === 'cocoa' ? 'cream' : 'cocoa' }} stage="sprout" reducedMotion={still} />
            </Cell>
          ))}
        </Grid>
      )}
      {show('anims') && (
        <Grid title="Animations and moods">
          {anims.map((a) => (
            <Cell key={a} label={`anim: ${a}`}>
              <Creature appearance={{ ...base, wings: a === 'happy' }} stage="sprout" anim={a} reducedMotion={still} />
            </Cell>
          ))}
          {moods.map((m) => (
            <Cell key={m} label={`mood: ${m}`}>
              <Creature appearance={base} stage="sprout" mood={m} reducedMotion={still} />
            </Cell>
          ))}
          <Cell label="facing -1 (sleeping)">
            <Creature appearance={base} stage="sprout" anim="sleeping" facing={-1} reducedMotion={still} />
          </Cell>
          <Cell label="moving">
            <Creature appearance={base} stage="sprout" moving reducedMotion={still} />
          </Cell>
          <Cell label="asGroup in scene">
            <svg viewBox="0 0 400 260" style={{ width: '100%', background: '#cfe3bf' }}>
              <g transform="translate(150 120) scale(0.5)">
                <Creature appearance={base} stage="sprout" asGroup moving reducedMotion={still} />
              </g>
            </svg>
          </Cell>
        </Grid>
      )}
      {show('eggs') && (
        <Grid title="Eggs">
          {eggs.flatMap((e) =>
            eggStates.map((s) => (
              <Cell key={`${e}-${s}`} label={`${EGGS[e].name} / ${s}`}>
                <Egg egg={e} state={s} reducedMotion={still} />
              </Cell>
            )),
          )}
        </Grid>
      )}
      {section === 'zoom' && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8 }}>
          {(
            [
              { ...base },
              { ...base, ears: 'floppy', tail: 'paddle', pattern: 'stripes', markingColor: 'cocoa', bodyColor: 'peach' },
              { ...base, ears: 'leaf', horns: true, bodyColor: 'moss', markingColor: 'cocoa', tail: 'curled' },
              { ...base, ears: 'rounded', fins: true, tail: 'paddle', bodyColor: 'lagoon', markingColor: 'sky', pattern: 'stripes' },
              { ...base, wings: true, glow: true, bodyColor: 'starlight', markingColor: 'butter' },
              { ...base, glow: true, pattern: 'none', bodyColor: 'lilac' },
            ] as Appearance[]
          ).map((a, i) => (
            <div key={i} style={{ width: 420, background: '#fffaf3', borderRadius: 12 }}>
              <Creature appearance={a} stage="sprout" reducedMotion={still} anim={(params.get('anim') as CreatureAnim) ?? 'idle'} />
            </div>
          ))}
        </div>
      )}
      {show('pivot') && (
        <Grid title="Pivot test (forced rotations)">
          <style>{`
            .pivot-test .kin-tail { animation: none !important; transform: rotate(35deg); }
            .pivot-test .kin-ear-l { animation: none !important; transform: rotate(-25deg); }
            .pivot-test .kin-ear-r { animation: none !important; transform: rotate(25deg); }
            .pivot-test .kin-head { animation: none !important; transform: rotate(18deg); }
            .pivot-test .kin-wing-l { animation: none !important; transform: rotate(-25deg); }
            .pivot-test .kin-eye { animation: none !important; transform: scaleY(0.4); }
          `}</style>
          {tails.map((t) => (
            <Cell key={t} label={`pivot ${t}`}>
              <div className="pivot-test">
                <Creature appearance={{ ...base, tail: t, wings: true }} stage="sprout" />
              </div>
            </Cell>
          ))}
          {tails.map((t) => (
            <Cell key={`n${t}`} label={`normal ${t}`}>
              <Creature appearance={{ ...base, tail: t, wings: true }} stage="sprout" reducedMotion />
            </Cell>
          ))}
        </Grid>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
