// Onboarding: AI choice → egg → customize (+ describe) → hatch → name →
// first care → a short garden walk with a guaranteed first keepsake.
// The model downloads in the background; every step works without it.
import { useEffect, useRef, useState } from 'react';
import { doCare, finishAdventure, presentFeedback } from '../../app/actions';
import { cancelDownload, disableAi, enableAndLoad, useAiStatus } from '../../app/aiControl';
import { playSfx } from '../../app/sfx';
import { store } from '../../app/store';
import { ui } from '../../app/ui';
import { ai } from '../../ai/engine';
import { translateAppearance } from '../../ai/companion';
import { formatMB, MODELS } from '../../ai/models';
import { COLORS, EGGS, KEEPSAKES } from '../../game/catalog';
import { applyCreationRequest, chooseEgg, creationOptions, hatch, nameCreature, setDraftAppearance, setStep } from '../../game/onboarding';
import type { RewardSummary } from '../../game/outcome';
import { lifeStageFor } from '../../game/stage';
import { getTrait } from '../../game/traits';
import type { Appearance, ColorId, EggType, OnboardingStep, SaveData } from '../../game/types';
import { COLOR_IDS, EGG_TYPES } from '../../game/types';
import type { MinigameResult } from '../../minigame/engine';
import { Creature } from '../../render/Creature';
import { Egg, type EggState } from '../../render/Egg';
import { ItemIcon } from '../../render/ItemIcon';
import { AiExplainer } from '../AiSetup';
import { CareBar } from '../CareBar';
import { Progress } from '../common';
import { randomSeed } from '../GameScreen';
import { Icon } from '../icons';
import { Minigame } from '../Minigame';
import { Kinetic, useReveal } from '../motion';
import { NeedsPanel } from '../Needs';
import { Stage } from '../Stage';
import { activeKinling } from '../../game/state';

const STEPS: { id: OnboardingStep; label: string }[] = [
  { id: 'welcome', label: 'Welcome' },
  { id: 'egg', label: 'Egg' },
  { id: 'customize', label: 'Look' },
  { id: 'hatch', label: 'Hatch' },
  { id: 'name', label: 'Name' },
  { id: 'firstCare', label: 'Care' },
  { id: 'garden', label: 'Garden' },
];

const NAME_IDEAS = ['Mochi', 'Pip', 'Bramble', 'Nori', 'Juniper', 'Pebble', 'Tofu', 'Biscuit', 'Fennel', 'Wren', 'Miso', 'Clover', 'Sprig', 'Puddle', 'Comet'];

function go(step: OnboardingStep) {
  store.update((s) => setStep(s, step));
}

export function Onboarding({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const step = save.onboarding.step;
  const index = STEPS.findIndex((s) => s.id === step);
  const headingRef = useRef<HTMLDivElement>(null);
  useReveal(headingRef);
  useEffect(() => {
    headingRef.current?.querySelector<HTMLElement>('h1, h2')?.focus();
  }, [step]);
  return (
    <main className="onboarding" id="main">
      <div className="onboarding__top">
        <ol className="steps" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s.id} className={`steps__item ${i < index ? 'steps__item--done' : ''} ${i === index ? 'steps__item--now' : ''}`} aria-current={i === index ? 'step' : undefined}>
              <span className="steps__dot" aria-hidden="true" />
              <span className="steps__label">{s.label}</span>
            </li>
          ))}
        </ol>
        <AiMiniStatus />
      </div>
      <div ref={headingRef} className="onboarding__body">
        {step === 'welcome' && <WelcomeStep reducedMotion={reducedMotion} />}
        {step === 'egg' && <EggStep reducedMotion={reducedMotion} current={save.onboarding.egg} />}
        {step === 'customize' && <CustomizeStep save={save} reducedMotion={reducedMotion} />}
        {step === 'hatch' && <HatchStep save={save} reducedMotion={reducedMotion} />}
        {step === 'name' && <NameStep save={save} reducedMotion={reducedMotion} />}
        {step === 'firstCare' && <FirstCareStep save={save} reducedMotion={reducedMotion} />}
        {step === 'garden' && <GardenStep save={save} reducedMotion={reducedMotion} />}
      </div>
    </main>
  );
}

function AiMiniStatus() {
  const status = useAiStatus();
  if (status.kind === 'loading') {
    return (
      <div className="ai-mini" aria-live="polite">
        <span>Downloading AI model… {Math.round(status.progress * 100)}%</span>
        <Progress value={status.progress} label="AI model download progress" />
        <button className="link-btn" onClick={cancelDownload}>
          Cancel
        </button>
      </div>
    );
  }
  if (status.kind === 'ready') return <div className="ai-mini ai-mini--ok">AI ready ✓</div>;
  if (status.kind === 'error') return <div className="ai-mini ai-mini--bad" role="status">AI couldn't load — using Kinling's own words. You can retry in Settings later.</div>;
  return null;
}

const FEATURES = [
  { icon: Icon.egg, title: 'Hatch a kinling', text: 'Pick a woodland, aquatic or celestial egg and design who hatches.' },
  { icon: Icon.explore, title: 'Explore together', text: 'Short garden and pond trips gather materials and keepsakes.' },
  { icon: Icon.evolve, title: 'Shape how it grows', text: 'New ears, tails, fins and wings, always previewed before you apply.' },
  { icon: Icon.lock, title: 'Private by design', text: 'Saves stay in this browser, and the optional AI runs on your device.' },
];

function WelcomeStep({ reducedMotion }: { reducedMotion: boolean }) {
  const [support, setSupport] = useState<{ supported: boolean; reason?: string } | null>(null);
  useEffect(() => {
    void ai.checkSupport().then(setSupport);
  }, []);
  const next = () => go('egg');
  return (
    <div className="welcome">
      <section className="ob-card hero" aria-labelledby="welcome-title">
        <p className="eyebrow">A cozy creature companion</p>
        <h1 id="welcome-title" tabIndex={-1}>
          <Kinetic text="Welcome to Kinling" accent="Kinling" />
        </h1>
        <p className="lead">Hatch a little creature, care for it, explore the garden and pond together, and help it grow into whatever it wants to be.</p>
      </section>
      <div className="ob-card hero-art" aria-hidden="true">
        {EGG_TYPES.map((egg) => (
          <span key={egg} className="hero-art__egg">
            <Egg egg={egg} reducedMotion={reducedMotion} size="100%" />
          </span>
        ))}
      </div>
      <ul className="features" aria-label="What you can do">
        {FEATURES.map((f) => (
          <li key={f.title} className="feature" data-reveal="">
            <span className="feature__icon" aria-hidden="true">
              {f.icon(20)}
            </span>
            <strong>{f.title}</strong>
            <p>{f.text}</p>
          </li>
        ))}
      </ul>
      <section className="ob-card ai-choice" aria-labelledby="welcome-ai">
        <h2 id="welcome-ai">Would you like your kinling to talk with on-device AI?</h2>
        <AiExplainer />
        {support === null && <p className="hint">Checking whether this browser supports WebGPU…</p>}
        {support && !support.supported && (
          <div className="notice notice--warn">
            <p>
              <strong>On-device AI isn't available in this browser.</strong> {support.reason}
            </p>
            <p>No problem — your kinling has plenty of hand-written things to say, and the whole game works the same.</p>
            <button
              className="btn btn--primary btn--big"
              onClick={() => {
                disableAi();
                next();
              }}
            >
              Continue
            </button>
          </div>
        )}
        {support?.supported && (
          <div className="choice-grid">
            <button
              className="choice choice--featured"
              data-reveal=""
              onClick={() => {
                enableAndLoad('Qwen3-1.7B-q4f16_1-MLC');
                next();
              }}
            >
              <span className="pill pill--ok choice__badge" aria-hidden="true">
                Recommended
              </span>
              <strong>Download recommended model</strong>
              <span>{MODELS['Qwen3-1.7B-q4f16_1-MLC'].label} · about {formatMB(MODELS['Qwen3-1.7B-q4f16_1-MLC'].downloadMB)}</span>
              <span className="hint">Best conversations. Downloads while you set up.</span>
              <span className="choice__go" aria-hidden="true">
                Start setup {Icon.arrow('right', 16)}
              </span>
            </button>
            <button
              className="choice"
              data-reveal=""
              onClick={() => {
                enableAndLoad('Qwen3-0.6B-q4f16_1-MLC');
                next();
              }}
            >
              <strong>Download smaller model</strong>
              <span>{MODELS['Qwen3-0.6B-q4f16_1-MLC'].label} · about {formatMB(MODELS['Qwen3-0.6B-q4f16_1-MLC'].downloadMB)}</span>
              <span className="hint">For older or low-memory devices.</span>
            </button>
            <button
              className="choice choice--plain"
              data-reveal=""
              onClick={() => {
                disableAi();
                next();
              }}
            >
              <strong>Play without AI</strong>
              <span>Hand-written dialogue. You can turn AI on later in Settings.</span>
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

function EggStep({ reducedMotion, current }: { reducedMotion: boolean; current: EggType | null }) {
  const [hover, setHover] = useState<EggType | null>(null);
  return (
    <section className="ob-card">
      <h1 tabIndex={-1}>
        <Kinetic text="Choose an egg" />
      </h1>
      <p className="lead">Each egg starts with different features and favorite things. Any kinling can still evolve in any direction later.</p>
      <div className="egg-grid">
        {EGG_TYPES.map((egg) => {
          const def = EGGS[egg];
          const extras = def.starterTraits.map((t) => getTrait(t).name).join(', ');
          return (
            <button
              key={egg}
              className={`egg-card egg-card--${egg} ${current === egg ? 'egg-card--on' : ''}`}
              data-reveal=""
              onClick={() => {
                playSfx('pop');
                store.update((s) => chooseEgg(s, egg));
              }}
              onMouseEnter={() => setHover(egg)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(egg)}
              onBlur={() => setHover(null)}
            >
              <span className="egg-card__art">
                <Egg egg={egg} state={hover === egg ? 'wobble' : 'idle'} reducedMotion={reducedMotion} size="100%" />
              </span>
              <strong>{def.name}</strong>
              <span>{def.description}</span>
              <span className="hint">Starts with: {extras}</span>
            </button>
          );
        })}
      </div>
      <div className="row">
        <button className="btn btn--ghost" onClick={() => go('welcome')}>
          Back
        </button>
      </div>
    </section>
  );
}

function CustomizeStep({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const egg = save.onboarding.egg!;
  const a = save.onboarding.draftAppearance!;
  const opts = creationOptions(egg);
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const set = (patch: Partial<Appearance>) => store.update((s) => setDraftAppearance(s, { ...a, ...patch, proportions: { ...a.proportions, ...(patch.proportions ?? {}) } }));

  const describe = async () => {
    if (!desc.trim()) return;
    setBusy(true);
    try {
      const t = await translateAppearance(save, desc.trim(), 'create');
      const res = applyCreationRequest(egg, a, t.request);
      store.update((s) => setDraftAppearance(s, res.appearance));
      const parts: string[] = [];
      if (res.applied.length) parts.push(`Applied: ${res.applied.join(', ')}.`);
      if (res.later.length) parts.push(`Not available at hatching (can evolve later): ${res.later.join(', ')}.`);
      if (t.unsupported.length) parts.push(`Kinlings can't grow ${t.unsupported.join(', ')}.`);
      if (!parts.length) parts.push("I couldn't match that to any options. Try colors, spots or stripes, ears or tail.");
      setNote(`${t.source === 'ai' ? 'AI' : 'Word matcher'}: ${parts.join(' ')}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ob-card ob-card--split">
      <div className="ob-preview">
        <div className="ob-preview__art">
          <Creature appearance={a} stage="hatchling" reducedMotion={reducedMotion} title="Preview of your kinling" size="100%" />
        </div>
        <p className="hint">Live preview — this is who will hatch.</p>
      </div>
      <div className="ob-controls">
        <h1 tabIndex={-1}>
          <Kinetic text="Imagine your kinling" />
        </h1>
        <Swatches label="Fur color" options={opts.colors} value={a.bodyColor} onPick={(c) => set({ bodyColor: c })} />
        <Swatches label="Belly & paws" options={[...COLOR_IDS]} value={a.accentColor} onPick={(c) => set({ accentColor: c })} small />
        <Choice label="Markings" options={opts.patterns.map((p) => [p, p === 'none' ? 'None' : p === 'spots' ? 'Spots' : 'Stripes'])} value={a.pattern} onPick={(p) => set({ pattern: p })} />
        {a.pattern !== 'none' && <Swatches label="Marking color" options={[...COLOR_IDS]} value={a.markingColor} onPick={(c) => set({ markingColor: c })} small />}
        {opts.glow && (
          <label className="toggle">
            <input type="checkbox" checked={a.glow} onChange={(e) => set({ glow: e.target.checked })} />
            <span>Glowing markings (celestial)</span>
          </label>
        )}
        <Choice label="Ears" options={opts.ears.map((e) => [e, getTrait(`ears.${e}`).name])} value={a.ears} onPick={(e) => set({ ears: e })} />
        <Choice label="Tail" options={opts.tails.map((t) => [t, getTrait(`tail.${t}`).name])} value={a.tail} onPick={(t) => set({ tail: t })} />
        <div className="sliders">
          {(['plump', 'head', 'height'] as const).map((k) => (
            <label key={k} className="slider">
              <span>{k === 'plump' ? 'Roundness' : k === 'head' ? 'Head size' : 'Height'}</span>
              <input type="range" min={0} max={k === 'height' ? 0.65 : 1} step={0.05} value={a.proportions[k]} onChange={(e) => set({ proportions: { ...a.proportions, [k]: Number(e.target.value) } })} />
            </label>
          ))}
        </div>
        <form
          className="ob-describe"
          onSubmit={(e) => {
            e.preventDefault();
            void describe();
          }}
        >
          <label htmlFor="ob-desc" className="field-label">
            Or describe it (optional)
          </label>
          <div className="row">
            <input id="ob-desc" className="input" value={desc} maxLength={200} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. pink with cream belly, yellow spots and floppy ears" />
            <button className="btn" disabled={busy || !desc.trim()}>
              {busy ? 'Reading…' : 'Apply'}
            </button>
          </div>
          {note && (
            <p className="hint" role="status">
              {note}
            </p>
          )}
        </form>
        <div className="row row--between">
          <button className="btn btn--ghost" onClick={() => go('egg')}>
            Back
          </button>
          <button className="btn btn--primary btn--big" onClick={() => go('hatch')}>
            Ready to hatch
          </button>
        </div>
      </div>
    </section>
  );
}

function Swatches({ label, options, value, onPick, small }: { label: string; options: ColorId[]; value: ColorId; onPick: (c: ColorId) => void; small?: boolean }) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      <div className={`swatches ${small ? 'swatches--small' : ''}`}>
        {options.map((c) => (
          <button key={c} type="button" className={`swatch ${small ? 'swatch--small' : ''} ${value === c ? 'swatch--on' : ''}`} style={{ background: COLORS[c].base, borderColor: COLORS[c].shade }} aria-pressed={value === c} aria-label={COLORS[c].name} title={COLORS[c].name} onClick={() => onPick(c)} />
        ))}
      </div>
    </fieldset>
  );
}

function Choice<T extends string>({ label, options, value, onPick }: { label: string; options: [T, string][]; value: T; onPick: (v: T) => void }) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      <div className="options options--small">
        {options.map(([v, text]) => (
          <button key={v} type="button" className={`chip ${value === v ? 'chip--on' : ''}`} aria-pressed={value === v} onClick={() => onPick(v)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function HatchStep({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const egg = save.onboarding.egg!;
  const [state, setState] = useState<EggState | 'hatched'>('idle');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const start = () => {
    if (state !== 'idle') return;
    const finish = () => {
      const out = hatch(store.save!, Date.now());
      if (!out.feedback.ok) return;
      setState('hatched');
      playSfx('sparkle');
      // Show the reveal briefly before moving on to naming.
      timers.current.push(setTimeout(() => store.update(() => out.save), reducedMotion ? 600 : 1600));
    };
    if (reducedMotion) {
      finish();
      return;
    }
    playSfx('pop');
    setState('wobble');
    timers.current.push(setTimeout(() => setState('crack'), 1300));
    timers.current.push(setTimeout(() => setState('open'), 2300));
    timers.current.push(setTimeout(finish, 3000));
  };
  const a = save.onboarding.draftAppearance!;
  return (
    <section className="ob-card ob-card--center">
      <h1 tabIndex={-1}>
        <Kinetic text={state === 'hatched' ? 'Hello, little one!' : 'Your egg is warm and wiggly'} accent={state === 'hatched' ? 'little one!' : undefined} />
      </h1>
      <div className="hatch-stage" aria-live="polite">
        {state === 'hatched' ? (
          <div className="hatch-reveal">
            <Creature appearance={a} stage="hatchling" anim="happy" reducedMotion={reducedMotion} title="Your newly hatched kinling" size="100%" />
          </div>
        ) : (
          <Egg egg={egg} state={state === 'idle' ? 'idle' : state} reducedMotion={reducedMotion} size="100%" title={`${EGGS[egg].name}${state === 'crack' ? ', cracking' : ''}`} />
        )}
      </div>
      {state === 'idle' && (
        <div className="row row--center">
          <button className="btn btn--ghost" onClick={() => go('customize')}>
            Back
          </button>
          <button className="btn btn--primary btn--big" onClick={start}>
            Hatch!
          </button>
        </div>
      )}
      {state !== 'idle' && state !== 'hatched' && <p className="hint">Crack… crack…</p>}
    </section>
  );
}

function NameStep({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const c = activeKinling(save)!;
  const [name, setName] = useState('');
  const [player, setPlayer] = useState('');
  const [idea] = useState(() => NAME_IDEAS[Math.floor(Math.random() * NAME_IDEAS.length)]!);
  const submit = () => {
    const out = nameCreature(store.save!, name || idea, player, Date.now());
    if (!out.feedback.ok) {
      ui.toast(out.feedback.toast ?? 'Please choose a name.', 'warn');
      return;
    }
    store.update(() => out.save);
    presentFeedback(out.feedback);
  };
  return (
    <section className="ob-card ob-card--split">
      <div className="ob-preview">
        <div className="ob-preview__art">
          <Creature appearance={c.appearance} stage="hatchling" anim="idle" mood="joyful" reducedMotion={reducedMotion} title="Your kinling" size="100%" />
        </div>
        <p className="speech speech--static">*blinks* …hi?</p>
      </div>
      <form
        className="ob-controls"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h1 tabIndex={-1}>
          <Kinetic text="What's its name?" />
        </h1>
        <label className="field">
          <span className="field-label">Kinling's name</span>
          <input className="input input--big" value={name} onChange={(e) => setName(e.target.value)} maxLength={16} placeholder={idea} autoComplete="off" />
        </label>
        <div className="options options--small" aria-label="Name ideas">
          {NAME_IDEAS.slice(0, 6).map((n) => (
            <button key={n} type="button" className="chip" onClick={() => setName(n)}>
              {n}
            </button>
          ))}
        </div>
        <label className="field">
          <span className="field-label">What should it call you? (optional)</span>
          <input className="input" value={player} onChange={(e) => setPlayer(e.target.value)} maxLength={24} placeholder="Your name or nickname" autoComplete="off" />
        </label>
        <p className="hint">Names stay in this browser only.</p>
        <button className="btn btn--primary btn--big" type="submit">
          That's {name.trim() || idea}!
        </button>
      </form>
    </section>
  );
}

function FirstCareStep({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const c = activeKinling(save)!;
  const done = save.stats.feeds + save.stats.plays + save.stats.grooms + save.stats.rests > 0;
  useEffect(() => {
    if (!done) ui.say(`${c.name} is a little hungry and full of wiggles. Try a snack or a game!`, 'authored');
  }, [done, c.name]);
  return (
    <section className="ob-care">
      <div className="ob-care__intro">
        <h1 tabIndex={-1}>
          <Kinetic text="First things first" />
        </h1>
        <p className="lead">Newly hatched kinlings are hungry and playful. Feed {c.name} or play together.</p>
      </div>
      <Stage save={save} reducedMotion={reducedMotion} />
      <NeedsPanel needs={c.needs} />
      <CareBar save={save} />
      {done ? (
        <div className="ob-next card" role="status">
          <p>
            {c.name} looks happy! Care actions always work right away, and you can use them any time from home.
          </p>
          <button className="btn btn--primary btn--big" onClick={() => go('garden')}>
            Next: a walk in the garden
          </button>
        </div>
      ) : (
        <div className="row row--center">
          <button className="btn btn--primary" onClick={() => doCare('feed', 'dewberry')}>
            Feed a dewberry
          </button>
          <button className="btn" onClick={() => doCare('play')}>
            Play a game
          </button>
        </div>
      )}
    </section>
  );
}

function GardenStep({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const c = activeKinling(save)!;
  const [phase, setPhase] = useState<'intro' | 'play' | 'done'>('intro');
  const [rewards, setRewards] = useState<RewardSummary | null>(null);
  const [seed] = useState(randomSeed);
  const onFinish = (result: MinigameResult) => {
    const out = finishAdventure(result);
    setRewards(out?.rewards ?? null);
    setPhase('done');
  };
  if (phase === 'play') {
    return <Minigame config={{ route: 'garden-path', seed, tutorial: true }} appearance={c.appearance} stage={lifeStageFor(c.bond)} name={c.name} reducedMotion={reducedMotion} onFinish={onFinish} />;
  }
  if (phase === 'done') {
    const keepsake = rewards?.keepsakes[0];
    return (
      <section className="ob-card ob-card--center">
        <h1 tabIndex={-1}>
          <Kinetic text="What a lovely walk!" accent="lovely" />
        </h1>
        {keepsake && (
          <div className="keepsake-reveal keepsake-reveal--big">
            <ItemIcon kind={keepsake} size={88} />
            <div>
              <strong>Your first keepsake: {KEEPSAKES[keepsake].name}</strong>
              <p>{KEEPSAKES[keepsake].description} It now sits on the shelf at home.</p>
            </div>
          </div>
        )}
        <p>
          Exploring gathers materials and builds affinities that unlock new ways for {c.name} to evolve. The pond is waiting too — and with a paddle tail, the Deep Reeds.
        </p>
        <button className="btn btn--primary btn--big" onClick={() => go('done')}>
          Go home
        </button>
      </section>
    );
  }
  return (
    <section className="ob-card ob-card--center">
      <h1 tabIndex={-1}>
        <Kinetic text="A short garden walk" />
      </h1>
      <p className="lead">Guide {c.name} around the garden to gather leaves, petals and berries. Watch out for the bee, and look for a golden glint — something special is hiding there!</p>
      <p className="hint">Move with arrow keys / WASD, or tap where to go.</p>
      <button className="btn btn--primary btn--big" onClick={() => setPhase('play')}>
        Let's go!
      </button>
    </section>
  );
}
