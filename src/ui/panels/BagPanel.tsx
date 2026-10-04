// Inventory, keepsakes and an "about" card with traits, affinities and growth.
import { useState } from 'react';
import { doCare } from '../../app/actions';
import { FOODS, KEEPSAKES, MATERIALS } from '../../game/catalog';
import { nextStageAt, lifeStageFor, STAGE_LABELS } from '../../game/stage';
import { nextEggAt, totalBond } from '../../game/eggs';
import { describeFeelings } from '../../game/feelings';
import { activeKinling, personalityWords } from '../../game/state';
import type { FoodId, KeepsakeId, MaterialId, SaveData } from '../../game/types';
import { FOOD_IDS, KEEPSAKE_IDS, MATERIAL_IDS } from '../../game/types';
import { ItemIcon } from '../../render/ItemIcon';
import { Bar, formatTime } from '../common';
import { Kinetic } from '../motion';

export function BagPanel({ save }: { save: SaveData }) {
  const c = activeKinling(save)!;
  const [selected, setSelected] = useState<KeepsakeId | null>(null);
  const found = new Map(save.inventory.keepsakes.map((k) => [k.id, k]));
  const stage = lifeStageFor(c.bond);
  const next = nextStageAt(c.bond);
  const pref = c.preferences;
  const feelings = describeFeelings(save, c.id);
  const nextEgg = nextEggAt(save);
  return (
    <div className="panel bag">
      <h2 className="panel__title">
        <Kinetic text="Bag" />
      </h2>

      <section className="tile bag__tile bag__tile--wide" aria-labelledby="bag-foods" data-reveal="">
        <h3 id="bag-foods">Snacks</h3>
        <ul className="inv-grid">
          {FOOD_IDS.map((f: FoodId) => {
            const n = save.inventory.foods[f];
            const unlimited = FOODS[f].unlimited;
            if (!unlimited && n === 0) return null;
            return (
              <li key={f} className="inv-item">
                <ItemIcon kind={f} size={36} />
                <span className="inv-item__name">{FOODS[f].name}</span>
                <span className="inv-item__count">{unlimited ? '∞' : `×${n}`}</span>
                <button className="btn btn--small" onClick={() => doCare('feed', f)} aria-label={`Feed ${FOODS[f].name}`}>
                  Feed
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="tile bag__tile bag__tile--wide" aria-labelledby="bag-mats" data-reveal="">
        <h3 id="bag-mats">Materials</h3>
        <ul className="inv-grid inv-grid--mats">
          {MATERIAL_IDS.map((m: MaterialId) => (
            <li key={m} className={`inv-item ${save.inventory.materials[m] === 0 ? 'inv-item--empty' : ''}`} title={MATERIALS[m].description}>
              <ItemIcon kind={m} size={32} />
              <span className="inv-item__name">{MATERIALS[m].plural}</span>
              <span className="inv-item__count">×{save.inventory.materials[m]}</span>
            </li>
          ))}
        </ul>
        <p className="hint">Materials are spent the first time your kinling adopts a new feature in Evolve.</p>
      </section>

      <section className="tile bag__tile" aria-labelledby="bag-keeps" data-reveal="">
        <h3 id="bag-keeps">
          Keepsakes ({found.size}/{KEEPSAKE_IDS.length})
        </h3>
        <ul className="keepsake-grid">
          {KEEPSAKE_IDS.map((k) => {
            const rec = found.get(k);
            return (
              <li key={k}>
                <button className={`keepsake ${rec ? '' : 'keepsake--missing'} ${selected === k ? 'keepsake--on' : ''}`} onClick={() => setSelected(rec ? k : null)} aria-label={rec ? KEEPSAKES[k].name : 'Undiscovered keepsake'} disabled={!rec}>
                  {rec ? <ItemIcon kind={k} size={44} /> : <span className="keepsake__q" aria-hidden="true">?</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {selected && found.get(selected) && (
          <div className="keepsake-detail" aria-live="polite">
            <strong>{KEEPSAKES[selected].name}</strong>
            <p>{KEEPSAKES[selected].description}</p>
            <p className="hint">
              Found {formatTime(found.get(selected)!.foundAt)} in {found.get(selected)!.location === 'garden' ? 'the garden' : found.get(selected)!.location === 'pond' ? 'the pond' : 'home'}.
              {KEEPSAKES[selected].unlocksHint ? ` Helps unlock: ${KEEPSAKES[selected].unlocksHint}.` : ''}
            </p>
          </div>
        )}
      </section>

      <section className="about card" aria-labelledby="bag-about" data-reveal="">
        <h3 id="bag-about">About {c.name}</h3>
        <p>
          {STAGE_LABELS[stage]} from a {c.egg} egg · {personalityWords(c.personality).join(', ')}
        </p>
        {feelings.length > 0 && (
          <p className="about__feelings">
            <span>Feelings:</span> {feelings.join('; ')}.
          </p>
        )}
        <div className="about__grid">
          <span>Curiosity</span>
          <Bar value={c.personality.curiosity} color="var(--sky)" label="Curiosity" />
          <span>Confidence</span>
          <Bar value={c.personality.confidence} color="var(--coral)" label="Confidence" />
          <span>Playfulness</span>
          <Bar value={c.personality.playfulness} color="var(--gold)" label="Playfulness" />
          <span>Woodland</span>
          <Bar value={c.affinities.woodland} color="var(--moss)" label="Woodland affinity" />
          <span>Aquatic</span>
          <Bar value={c.affinities.aquatic} color="var(--sky)" label="Aquatic affinity" />
          <span>Bond</span>
          <Bar value={c.bond} max={next?.bond ?? Math.max(200, c.bond)} color="var(--lilac)" label="Bond toward next stage" />
        </div>
        <p className="hint">{next ? `Grows into a ${STAGE_LABELS[next.stage]} at bond ${next.bond} (now ${Math.floor(c.bond)}).` : 'Fully grown!'}</p>
        <ul className="bullets">
          <li>Favorite food: {pref.knownFavoriteFood ? FOODS[pref.favoriteFood].name : 'not discovered yet — try different snacks'}</li>
          <li>Not fond of: {pref.knownDislikedFood ? FOODS[pref.dislikedFood].name : 'unknown'}</li>
          <li>Favorite place: {pref.knownFavoritePlace ? `the ${pref.favoritePlace}` : 'not discovered yet — explore!'}</li>
        </ul>
        {nextEgg !== null && (
          <p className="hint">
            A new egg arrives when your kinlings' bond adds up to {nextEgg} (now {Math.floor(totalBond(save))}).
          </p>
        )}
      </section>
    </div>
  );
}
