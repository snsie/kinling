// Care controls. These act instantly through game rules; AI never gates them.
import { useState } from 'react';
import { doCare } from '../app/actions';
import { FOODS } from '../game/catalog';
import { activeKinling, hasFood } from '../game/state';
import type { FoodId, SaveData } from '../game/types';
import { FOOD_IDS } from '../game/types';
import { ItemIcon } from '../render/ItemIcon';
import { Icon } from './icons';

export function CareBar({ save, disabled }: { save: SaveData; disabled?: boolean }) {
  const [feeding, setFeeding] = useState(false);
  const c = activeKinling(save)!;
  const foods = FOOD_IDS.filter((f) => hasFood(save, f));
  const feed = (f: FoodId) => {
    doCare('feed', f);
    setFeeding(false);
  };
  return (
    <section className="care card" aria-label="Care">
      <div className="care__buttons">
        <button className="care-btn" onClick={() => setFeeding((v) => !v)} aria-expanded={feeding} aria-controls="food-picker" disabled={disabled}>
          <span className="care-btn__icon">{Icon.feed()}</span>
          <span>Feed</span>
        </button>
        <button className="care-btn" onClick={() => doCare('groom')} disabled={disabled}>
          <span className="care-btn__icon">{Icon.groom()}</span>
          <span>Groom</span>
        </button>
        <button className="care-btn" onClick={() => doCare('rest')} disabled={disabled}>
          <span className="care-btn__icon">{Icon.rest()}</span>
          <span>Rest</span>
        </button>
        <button className="care-btn" onClick={() => doCare('play')} disabled={disabled}>
          <span className="care-btn__icon">{Icon.play()}</span>
          <span>Play</span>
        </button>
      </div>
      {feeding && (
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
    </section>
  );
}
