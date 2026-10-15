// Care controls. These act instantly through game rules; AI never gates them.
import { useState } from 'react';
import { doCare } from '../app/actions';
import { ui, useUi } from '../app/ui';
import { MIN_ENERGY_TO_PLAY } from '../game/care';
import { FOODS, TOYS } from '../game/catalog';
import { activeKinling, hasFood } from '../game/state';
import type { FoodId, SaveData, ToyId } from '../game/types';
import { FOOD_IDS, TOY_IDS } from '../game/types';
import { ItemIcon } from '../render/ItemIcon';
import { Icon } from './icons';
import { PlayTask } from './PlayTask';

export function CareBar({ save, disabled }: { save: SaveData; disabled?: boolean }) {
  const [open, setOpen] = useState<'feed' | 'play' | null>(null);
  const { playTask } = useUi();
  const c = activeKinling(save)!;
  const foods = FOOD_IDS.filter((f) => hasFood(save, f));
  const anyToys = TOY_IDS.some((t) => save.inventory.toys[t] > 0);
  const feed = (f: FoodId) => {
    doCare('feed', f);
    setOpen(null);
  };
  const play = () => {
    // Too sleepy: let the game rules say so instead of opening the toy box.
    if (c.needs.energy < MIN_ENERGY_TO_PLAY) {
      setOpen(null);
      doCare('play');
      return;
    }
    setOpen((v) => (v === 'play' ? null : 'play'));
  };
  const pickToy = (t: ToyId) => {
    setOpen(null);
    ui.setPlayTask(t);
  };
  const busy = disabled || playTask !== null;
  return (
    <section className="care card" aria-label="Care">
      <div className="care__buttons">
        <button className="care-btn" onClick={() => setOpen((v) => (v === 'feed' ? null : 'feed'))} aria-expanded={open === 'feed'} aria-controls="food-picker" disabled={busy}>
          <span className="care-btn__icon">{Icon.feed()}</span>
          <span>Feed</span>
        </button>
        <button className="care-btn" onClick={() => doCare('groom')} disabled={busy}>
          <span className="care-btn__icon">{Icon.groom()}</span>
          <span>Groom</span>
        </button>
        <button className="care-btn" onClick={() => doCare('rest')} disabled={busy}>
          <span className="care-btn__icon">{Icon.rest()}</span>
          <span>Rest</span>
        </button>
        <button className="care-btn" onClick={play} aria-expanded={open === 'play'} aria-controls="toy-picker" disabled={busy}>
          <span className="care-btn__icon">{Icon.play()}</span>
          <span>Play</span>
        </button>
      </div>
      {playTask && !disabled && <PlayTask key={playTask} toy={playTask} name={c.name} />}
      {open === 'feed' && !playTask && (
        <div className="food-picker" id="food-picker" role="group" aria-label="Choose a food">
          {foods.map((f) => {
            const fav = c.preferences.knownFavoriteFood && c.preferences.favoriteFood === f;
            const count = FOODS[f].unlimited ? '∞' : String(save.inventory.foods[f]);
            return (
              <button key={f} className="food-btn" onClick={() => feed(f)} aria-label={`Feed ${FOODS[f].name}${fav ? ' (favorite)' : ''}, ${FOODS[f].unlimited ? 'unlimited' : `${count} left`}`}>
                <ItemIcon kind={f} size={30} />
                <span className="food-btn__name">{FOODS[f].name}</span>
                <span className="food-btn__count">{fav ? '♥ ' : ''}×{count}</span>
              </button>
            );
          })}
        </div>
      )}
      {open === 'play' && !playTask && (
        <div className="food-picker" id="toy-picker" role="group" aria-label="Choose a toy">
          {TOY_IDS.map((t) => {
            const n = save.inventory.toys[t];
            return (
              <button key={t} className="food-btn" onClick={() => pickToy(t)} disabled={n === 0} title={TOYS[t].description} aria-label={`${TOYS[t].verb} the ${TOYS[t].name}, ${n} left`}>
                <ItemIcon kind={t} size={30} />
                <span className="food-btn__name">{TOYS[t].name}</span>
                <span className="food-btn__count">×{n}</span>
              </button>
            );
          })}
          {!anyToys && <p className="hint food-picker__note">No toys left. Explore to find more.</p>}
        </div>
      )}
    </section>
  );
}
