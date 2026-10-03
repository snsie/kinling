// Evolution: preview-first editor plus natural-language requests. Nothing
// changes until the player presses Apply; costs and unlocks are checked by
// planEvolution against the live save.
import { useEffect, useMemo, useState } from 'react';
import { doEvolve, doRevert } from '../../app/actions';
import { useAiStatus } from '../../app/aiControl';
import { ui, useUi } from '../../app/ui';
import { translateAppearance, type AppearanceTranslation } from '../../ai/companion';
import { COLORS, MATERIALS } from '../../game/catalog';
import { HEIGHT_LIMIT_LOCKED, KEEP_LABELS, planEvolution, type EvolutionChange, type EvolutionPlan, type EvolutionRequest } from '../../game/evolution';
import { lifeStageFor } from '../../game/stage';
import { describeRequirement, getTrait, TRAITS, withTrait, wornTraits, type TraitDef } from '../../game/traits';
import type { ColorId, MaterialCost, MaterialId, SaveData, TraitSlot } from '../../game/types';
import { COLOR_IDS } from '../../game/types';
import { Creature } from '../../render/Creature';
import { ItemIcon } from '../../render/ItemIcon';
import { Icon } from '../icons';
import { Kinetic } from '../motion';
import { activeKinling } from '../../game/state';

function CostChips({ cost, have }: { cost: MaterialCost; have?: SaveData['inventory']['materials'] }) {
  const entries = (Object.entries(cost) as [MaterialId, number][]).filter(([, n]) => n);
  if (!entries.length) return <span className="cost cost--free">Free</span>;
  return (
    <span className="cost" aria-label={`Costs ${entries.map(([id, n]) => `${n} ${MATERIALS[id].plural.toLowerCase()}`).join(', ')}`}>
      {entries.map(([id, n]) => (
        <span key={id} className={`cost__chip ${have && have[id] < n ? 'cost__chip--short' : ''}`}>
          <ItemIcon kind={id} size={16} />
          {n}
        </span>
      ))}
    </span>
  );
}

const SLOT_SECTIONS: { slot: TraitSlot; title: string }[] = [
  { slot: 'ears', title: 'Ears' },
  { slot: 'tail', title: 'Tail' },
  { slot: 'pattern', title: 'Markings' },
  { slot: 'glow', title: 'Glow' },
  { slot: 'horns', title: 'Horns' },
  { slot: 'fins', title: 'Fin' },
  { slot: 'wings', title: 'Wings' },
];

export function EvolvePanel({ save, reducedMotion }: { save: SaveData; reducedMotion: boolean }) {
  const c = activeKinling(save)!;
  const stage = lifeStageFor(c.bond);
  const aiStatus = useAiStatus();
  const { evolutionDraft } = useUi();
  const [changes, setChanges] = useState<EvolutionChange[]>([]);
  const [extras, setExtras] = useState<Pick<EvolutionRequest, 'accentColor' | 'markingColor' | 'proportions' | 'keep'>>({});
  const [text, setText] = useState('');
  const [translating, setTranslating] = useState(false);
  const [translation, setTranslation] = useState<AppearanceTranslation | null>(null);

  const request: EvolutionRequest = useMemo(() => ({ changes, ...extras }), [changes, extras]);
  const plan: EvolutionPlan = useMemo(() => planEvolution(save, c.id, request), [save, c.id, request]);

  const loadTranslation = (t: AppearanceTranslation, sourceText: string) => {
    setText(sourceText);
    setTranslation(t);
    setChanges(t.request.changes);
    setExtras({ keep: t.request.keep, accentColor: t.request.accentColor, markingColor: t.request.markingColor });
  };

  // Accept a request handed over from the chat.
  useEffect(() => {
    if (evolutionDraft) {
      loadTranslation(evolutionDraft.translation, evolutionDraft.text);
      ui.setEvolutionDraft(null);
    }
  }, [evolutionDraft]);

  const reset = () => {
    setChanges([]);
    setExtras({});
    setTranslation(null);
  };

  const suggest = async () => {
    if (!text.trim()) return;
    setTranslating(true);
    try {
      loadTranslation(await translateAppearance(save, text.trim(), 'evolve'), text.trim());
    } finally {
      setTranslating(false);
    }
  };

  const setSlot = (def: TraitDef, wantOn: boolean) => {
    setTranslation(null);
    setChanges((prev) => {
      const rest = prev.filter((ch) => getTrait(ch.trait).slot !== def.slot);
      const wornNow = wornTraits(c.appearance).includes(def.id);
      if (def.toggle) {
        if (wantOn === wornNow) return rest;
        return [...rest, wantOn ? { trait: def.id } : { trait: def.id, remove: true }];
      }
      if (wornNow) return rest;
      return [...rest, { trait: def.id }];
    });
    if (def.slot === 'proportions') setExtras((e) => ({ ...e, proportions: undefined }));
  };

  const apply = () => {
    if (doEvolve(request)) reset();
  };

  const preview = plan.preview;
  const unlocked = new Set(save.unlocks.traits);
  const owned = new Set(save.unlocks.owned);
  const tallUnlocked = unlocked.has('shape.tall');

  const optionState = (def: TraitDef) => {
    const inPreview = wornTraits(preview).includes(def.id);
    const wearing = wornTraits(c.appearance).includes(def.id);
    const locked = !unlocked.has(def.id);
    return { inPreview, wearing, locked, owned: owned.has(def.id) };
  };

  return (
    <div className="panel evolve">
      <h2 className="panel__title">
        <Kinetic text="Evolve" />
      </h2>
      <p className="hint">Care and exploring unlock new features. You choose what to adopt; materials are spent only the first time you adopt a feature.</p>

      <div className="evo-compare">
        <figure className="evo-compare__fig">
          <Creature appearance={c.appearance} stage={stage} reducedMotion={reducedMotion} title={`${c.name} now`} size="100%" />
          <figcaption>Now</figcaption>
        </figure>
        <span className="evo-compare__arrow" aria-hidden="true">
          →
        </span>
        <figure className="evo-compare__fig evo-compare__fig--preview">
          <Creature appearance={preview} stage={stage} anim={plan.changed ? 'happy' : 'idle'} reducedMotion={reducedMotion} title={`Preview of ${c.name}`} size="100%" />
          <figcaption>{plan.changed ? 'Preview' : 'No changes yet'}</figcaption>
        </figure>
      </div>

      <form
        className="evo-request"
        onSubmit={(e) => {
          e.preventDefault();
          void suggest();
        }}
      >
        <label htmlFor="evo-text" className="field-label">
          Describe a change
        </label>
        <div className="row">
          <input
            id="evo-text"
            className="input"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. Make it more aquatic, but keep its fluffy ears"
          />
          <button className="btn btn--primary" type="submit" disabled={translating || !text.trim()}>
            {translating ? 'Thinking…' : 'Suggest'}
          </button>
        </div>
        <p className="hint">{aiStatus.kind === 'ready' || aiStatus.kind === 'generating' ? 'Uses the on-device AI, then checks the catalog.' : 'AI is off, so a built-in word matcher reads your request.'}</p>
      </form>

      {translation && (
        <div className="notice" role="status">
          {translation.reply && <p className="evo-reply">“{translation.reply}”</p>}
          {translation.request.keep && translation.request.keep.length > 0 && <p className="hint">Keeping its {translation.request.keep.map((k) => KEEP_LABELS[k]).join(', ')}.</p>}
          {translation.unsupported.length > 0 && <p className="hint">Kinlings can't grow {translation.unsupported.join(', ')}.</p>}
          {translation.invalid.length > 0 && <p className="hint">Ignored {translation.invalid.length} suggestion(s) that aren't real features.</p>}
          {translation.request.changes.length === 0 && <p className="hint">I couldn't find matching features. Try naming ears, tails, colors, markings, horns, fins, wings or a theme like aquatic.</p>}
        </div>
      )}

      <PlanSummary plan={plan} save={save} onApply={apply} onReset={reset} />

      <section className="evo-editor" aria-label="Evolution catalog">
        <h3>Coat color</h3>
        <div className="swatches" role="group" aria-label="Coat color">
          {TRAITS.filter((t) => t.slot === 'bodyColor').map((def) => {
            const st = optionState(def);
            const color = def.id.slice(6) as ColorId;
            return (
              <button
                key={def.id}
                className={`swatch ${st.inPreview ? 'swatch--on' : ''} ${st.locked ? 'swatch--locked' : ''}`}
                style={{ background: COLORS[color].base, borderColor: COLORS[color].shade }}
                aria-pressed={st.inPreview}
                aria-label={`${COLORS[color].name}${st.locked ? ' (locked)' : ''}`}
                title={st.locked ? def.unlock.map((u) => describeRequirement(save, u)).join('; ') : COLORS[color].name}
                onClick={() => setSlot(def, true)}
              >
                {st.locked && <span className="swatch__lock">{Icon.lock(14)}</span>}
              </button>
            );
          })}
        </div>
        <div className="evo-two">
          <ColorRow label="Belly & paws" value={preview.accentColor} onPick={(id) => setExtras((e) => ({ ...e, accentColor: id === c.appearance.accentColor ? undefined : id }))} />
          <ColorRow label="Marking color" value={preview.markingColor} onPick={(id) => setExtras((e) => ({ ...e, markingColor: id === c.appearance.markingColor ? undefined : id }))} />
        </div>

        {SLOT_SECTIONS.map(({ slot, title }) => {
          const defs = TRAITS.filter((t) => t.slot === slot);
          return (
            <div key={slot} data-reveal="">
              <h3>{title}</h3>
              <div className="options" role="group" aria-label={title}>
                {defs.map((def) => {
                  const st = optionState(def);
                  const thumb = def.toggle ? withTrait(c.appearance, def.id, false) : withTrait(c.appearance, def.id);
                  return (
                    <button
                      key={def.id}
                      className={`option ${st.inPreview ? 'option--on' : ''} ${st.locked ? 'option--locked' : ''}`}
                      aria-pressed={st.inPreview}
                      onClick={() => setSlot(def, def.toggle ? !st.inPreview : true)}
                    >
                      <span className="option__thumb">
                        <Creature appearance={thumb} stage={stage} reducedMotion size="100%" />
                      </span>
                      <span className="option__name">
                        {st.locked && Icon.lock(14)} {def.name}
                      </span>
                      <span className="option__meta">
                        {st.wearing ? 'Wearing' : st.owned ? 'Owned' : st.locked ? 'Locked' : <CostChips cost={def.cost} have={save.inventory.materials} />}
                      </span>
                      {st.locked && <span className="option__req">{def.unlock.map((u) => describeRequirement(save, u)).join(' · ')}</span>}
                      {def.effect && <span className="option__effect">{def.effect}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <h3>Build</h3>
        <div className="options options--small" role="group" aria-label="Body build presets">
          {TRAITS.filter((t) => t.slot === 'proportions').map((def) => {
            const st = optionState(def);
            return (
              <button key={def.id} className={`chip ${st.inPreview ? 'chip--on' : ''} ${st.locked ? 'chip--locked' : ''}`} aria-pressed={st.inPreview} onClick={() => setSlot(def, true)} title={st.locked ? def.unlock.map((u) => describeRequirement(save, u)).join('; ') : def.description}>
                {st.locked && Icon.lock(12)} {def.name}
              </button>
            );
          })}
        </div>
        <div className="sliders">
          {(['plump', 'head', 'height'] as const).map((k) => (
            <label key={k} className="slider">
              <span>{k === 'plump' ? 'Roundness' : k === 'head' ? 'Head size' : 'Height'}</span>
              <input
                type="range"
                min={0}
                max={k === 'height' && !tallUnlocked ? HEIGHT_LIMIT_LOCKED : 1}
                step={0.05}
                value={preview.proportions[k]}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setChanges((prev) => prev.filter((ch) => !ch.trait.startsWith('shape.')));
                  setExtras((ex) => ({ ...ex, proportions: { ...preview.proportions, [k]: v } }));
                }}
              />
            </label>
          ))}
          {!tallUnlocked && <p className="hint">Taller builds unlock at the Sprout stage.</p>}
        </div>
      </section>

      <section className="evo-history" data-reveal="">
        <h3>Change your mind?</h3>
        <p className="hint">Return to the previous look at any time. Materials aren't refunded, but features you've adopted stay yours to wear again for free.</p>
        <button className="btn" onClick={() => doRevert()} disabled={c.appearanceHistory.length === 0}>
          {Icon.undo(18)} Revert to previous look {c.appearanceHistory.length ? `(${c.appearanceHistory.length} saved)` : ''}
        </button>
      </section>
    </div>
  );
}

function ColorRow({ label, value, onPick }: { label: string; value: ColorId; onPick: (c: ColorId) => void }) {
  return (
    <div>
      <h3>{label}</h3>
      <div className="swatches swatches--small" role="group" aria-label={label}>
        {COLOR_IDS.map((id) => (
          <button key={id} className={`swatch swatch--small ${value === id ? 'swatch--on' : ''}`} style={{ background: COLORS[id].base, borderColor: COLORS[id].shade }} aria-pressed={value === id} aria-label={COLORS[id].name} title={COLORS[id].name} onClick={() => onPick(id)} />
        ))}
      </div>
    </div>
  );
}

function PlanSummary({ plan, save, onApply, onReset }: { plan: EvolutionPlan; save: SaveData; onApply: () => void; onReset: () => void }) {
  const nothing = plan.accepted.length === 0 && plan.rejected.length === 0 && plan.unchanged.length === 0 && !plan.changed;
  if (nothing) return null;
  return (
    <section className="plan card" aria-label="Proposed changes" aria-live="polite">
      {plan.accepted.length > 0 && (
        <>
          <h3>Ready to adopt</h3>
          <ul className="plan__list">
            {plan.accepted.map((a) => (
              <li key={a.trait} className="plan__item">
                <span>{a.remove ? `Remove ${a.name.toLowerCase()}` : a.name}</span>
                {a.remove ? <span className="cost cost--free">Free</span> : a.owned ? <span className="cost cost--free">Owned · free</span> : <CostChips cost={a.cost} have={save.inventory.materials} />}
              </li>
            ))}
          </ul>
        </>
      )}
      {plan.changed && plan.accepted.length === 0 && <p>Color or shape adjustments (free).</p>}
      {plan.rejected.length > 0 && (
        <>
          <h3>Not possible right now</h3>
          <ul className="plan__list plan__list--rejected">
            {plan.rejected.map((r, i) => (
              <li key={`${r.trait}-${i}`} className="plan__item plan__item--rejected">
                <strong>{r.name}</strong>
                <span>{r.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {plan.unchanged.length > 0 && <p className="hint">Already has: {plan.unchanged.join(', ')}.</p>}
      {!plan.affordable && (
        <p className="notice notice--warn">
          Needs more materials:{' '}
          {(Object.entries(plan.missing) as [MaterialId, number][]).map(([id, n]) => `${n} ${n === 1 ? MATERIALS[id].name.toLowerCase() : MATERIALS[id].plural.toLowerCase()}`).join(', ')}. Explore to gather them.
        </p>
      )}
      <div className="row row--end">
        <button className="btn btn--ghost" onClick={onReset}>
          Clear
        </button>
        <button className="btn btn--primary" onClick={onApply} disabled={!plan.changed || !plan.affordable}>
          Apply {plan.accepted.some((a) => !a.owned && !a.remove) ? '& spend' : ''}
        </button>
      </div>
    </section>
  );
}
