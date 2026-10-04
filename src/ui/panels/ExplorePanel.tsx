import { updateSettings } from '../../app/actions';
import { isFirstVisit, MIN_ENERGY_TO_EXPLORE, routeAvailability } from '../../game/adventure';
import { FOODS, KEEPSAKES, MATERIALS, ROUTE_KEEPSAKES, ROUTES } from '../../game/catalog';
import type { RewardSummary } from '../../game/outcome';
import { describeRequirement, getTrait } from '../../game/traits';
import type { FoodId, MaterialId, RouteId, SaveData } from '../../game/types';
import { ROUTE_IDS } from '../../game/types';
import { ItemIcon } from '../../render/ItemIcon';
import { Icon } from '../icons';
import { Kinetic } from '../motion';
import { activeKinling } from '../../game/state';

const ROUTE_IMAGES: Record<RouteId, string> = {
  'garden-path': './images/route-garden.jpg',
  'pond-shallows': './images/route-pond.jpg',
  'pond-deep': './images/route-reeds.jpg',
};

export function ExplorePanel({ save, onStart }: { save: SaveData; onStart: (route: RouteId) => void }) {
  const c = activeKinling(save)!;
  const paddle = getTrait('tail.paddle');
  return (
    <div className="panel explore">
      <h2 className="panel__title">
        <Kinetic text="Explore" />
      </h2>
      <p className="hint">Each trip takes about a minute. Adventures cost energy ({MIN_ENERGY_TO_EXPLORE}+ needed) and build affinity, which unlocks new evolutions.</p>
      <div className="route-list">
        {ROUTE_IDS.map((r) => {
          const def = ROUTES[r];
          const avail = routeAvailability(save, r);
          const first = isFirstVisit(save, r);
          const owned = ROUTE_KEEPSAKES[r].filter((k) => save.inventory.keepsakes.some((x) => x.id === k)).length;
          const lockedByTrait = def.requiresTrait && c.appearance.tail !== 'paddle';
          return (
            <article key={r} className={`route-card route-card--${def.location} ${avail.available ? '' : 'route-card--locked'}`} aria-labelledby={`route-${r}`} data-reveal="">
              <div className="route-card__art" aria-hidden="true">
                <img src={ROUTE_IMAGES[r]} alt="" className="route-card__img" loading="lazy" />
                {!avail.available && <span className="route-card__lockmark">{Icon.lock(16)}</span>}
              </div>
              <div className="route-card__body">
                <div className="route-card__head">
                  <h3 id={`route-${r}`}>{def.name}</h3>
                  {first && avail.available && <span className="pill pill--new">New!</span>}
                  {def.requiresTrait && <span className="pill">Paddle tail route</span>}
                </div>
                <p>{def.description}</p>
                <p className="hint">{def.obstacleHint}</p>
                <ul className="route-card__facts">
                  <li>Energy −{def.energyCost}</li>
                  <li>{def.affinity === 'woodland' ? 'Woodland' : 'Aquatic'} affinity ↑</li>
                  <li>
                    Keepsakes {owned}/{ROUTE_KEEPSAKES[r].length}
                  </li>
                  {save.stats.bestScore[r] > 0 && <li>Best {save.stats.bestScore[r]}</li>}
                </ul>
                {lockedByTrait && (
                  <p className="route-card__lock">
                    {save.unlocks.traits.includes('tail.paddle')
                      ? 'Your kinling can grow a paddle tail now — adopt it in Evolve to swim here.'
                      : `Needs a paddle tail. Unlock: ${paddle.unlock.map((u) => describeRequirement(save, u)).join('; ')}.`}
                  </p>
                )}
                <button className="btn btn--primary" disabled={!avail.available} onClick={() => onStart(r)} aria-describedby={avail.available ? undefined : `route-why-${r}`}>
                  {avail.available ? `Go to the ${def.name}` : 'Not available'}
                </button>
                {!avail.available && !lockedByTrait && (
                  <p className="hint" id={`route-why-${r}`}>
                    {avail.reason}
                  </p>
                )}
                {!avail.available && lockedByTrait && <span className="sr-only" id={`route-why-${r}`}>{avail.reason}</span>}
              </div>
            </article>
          );
        })}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={save.settings.relaxedMinigame} onChange={(e) => updateSettings((s) => void (s.relaxedMinigame = e.target.checked))} />
        <span>Relaxed mode: slower obstacles and 15 extra seconds</span>
      </label>
    </div>
  );
}

export function AdventureResults({
  rewards,
  route,
  line,
  onHome,
  onAgain,
  canAgain,
}: {
  rewards: RewardSummary;
  route: RouteId;
  line?: string;
  onHome: () => void;
  onAgain?: () => void;
  canAgain: boolean;
}) {
  const tierText = { none: 'A gentle stroll', bronze: 'Bronze haul', silver: 'Silver haul', gold: 'Golden haul!' }[rewards.tier];
  const mats = Object.entries(rewards.materials) as [MaterialId, number][];
  const foods = Object.entries(rewards.foods) as [FoodId, number][];
  return (
    <section className="results card" aria-labelledby="results-title">
      <h2 id="results-title" className={`results__tier results__tier--${rewards.tier}`}>
        <Kinetic text={tierText} />
      </h2>
      <p className="hint">
        {ROUTES[route].name} · score {rewards.score}
      </p>
      {line && <p className="results__line">“{line}”</p>}
      {rewards.keepsakes.length > 0 && (
        <div className="results__keepsakes">
          {rewards.keepsakes.map((k) => (
            <div key={k} className="keepsake-reveal">
              <ItemIcon kind={k} size={64} />
              <div>
                <strong>New keepsake: {KEEPSAKES[k].name}</strong>
                <p>{KEEPSAKES[k].description}</p>
                {KEEPSAKES[k].unlocksHint && <p className="hint">Helps unlock: {KEEPSAKES[k].unlocksHint}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      <h3 className="results__sub">Gathered</h3>
      {mats.length + foods.length === 0 ? (
        <p className="hint">Nothing this time — but it was a nice walk.</p>
      ) : (
        <ul className="loot">
          {mats.map(([id, n]) => (
            <li key={id}>
              <ItemIcon kind={id} size={30} /> {n} {n === 1 ? MATERIALS[id].name : MATERIALS[id].plural}
            </li>
          ))}
          {foods.map(([id, n]) => (
            <li key={id}>
              <ItemIcon kind={id} size={30} /> {n} {n === 1 ? FOODS[id].name : FOODS[id].plural}
            </li>
          ))}
        </ul>
      )}
      {rewards.affinity && (
        <p className="results__affinity">
          {rewards.affinity.key === 'woodland' ? 'Woodland' : 'Aquatic'} affinity +{rewards.affinity.amount}
        </p>
      )}
      <div className="row row--center">
        <button className="btn btn--primary" onClick={onHome} autoFocus>
          Return home
        </button>
        {onAgain && (
          <button className="btn" onClick={onAgain} disabled={!canAgain}>
            Go again
          </button>
        )}
      </div>
    </section>
  );
}
