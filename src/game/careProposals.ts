// Validation of proposed care/exploration actions (from AI or offline parsing).
// Proposals are only suggestions: the player confirms them, and each one is
// checked again against the live save when performed.
import { FOODS, ROUTES } from './catalog';
import { routeAvailability } from './adventure';
import { activeKinling, hasFood } from './state';
import type { FoodId, Kinling, RouteId, SaveData } from './types';
import { FOOD_IDS, ROUTE_IDS } from './types';

export type ProposedAction =
  | { type: 'feed'; food: FoodId }
  | { type: 'groom' }
  | { type: 'rest' }
  | { type: 'play' }
  | { type: 'explore'; route: RouteId };

export interface CheckedAction {
  action: ProposedAction;
  label: string;
  available: boolean;
  reason?: string;
}

export const MAX_PROPOSED_ACTIONS = 3;

export function actionLabel(a: ProposedAction): string {
  switch (a.type) {
    case 'feed':
      return `Feed ${FOODS[a.food].name}`;
    case 'groom':
      return 'Groom';
    case 'rest':
      return 'Rest';
    case 'play':
      return 'Play';
    case 'explore':
      return `Explore ${ROUTES[a.route].name}`;
  }
}

/** Coerce untrusted objects into known actions; unknown shapes are dropped. */
export function coerceActions(raw: unknown): ProposedAction[] {
  if (!Array.isArray(raw)) return [];
  const out: ProposedAction[] = [];
  for (const item of raw.slice(0, 6)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    switch (r.type) {
      case 'feed': {
        const food = (FOOD_IDS as readonly unknown[]).includes(r.food) ? (r.food as FoodId) : 'seedBun';
        out.push({ type: 'feed', food });
        break;
      }
      case 'groom':
      case 'rest':
      case 'play':
        out.push({ type: r.type });
        break;
      case 'explore':
        if ((ROUTE_IDS as readonly unknown[]).includes(r.route)) out.push({ type: 'explore', route: r.route as RouteId });
        break;
    }
  }
  // De-duplicate by type and keep the first few.
  const seen = new Set<string>();
  return out.filter((a) => (seen.has(a.type) ? false : (seen.add(a.type), true))).slice(0, MAX_PROPOSED_ACTIONS);
}

export function checkAction(save: SaveData, action: ProposedAction, c: Kinling | null = activeKinling(save)): CheckedAction {
  const label = actionLabel(action);
  if (!c) return { action, label, available: false, reason: 'No kinling yet.' };
  switch (action.type) {
    case 'feed':
      if (!hasFood(save, action.food)) return { action, label, available: false, reason: `No ${FOODS[action.food].name} in the bag.` };
      if (c.needs.hunger >= 95) return { action, label, available: false, reason: `${c.name} is already full.` };
      return { action, label, available: true };
    case 'play':
      if (c.needs.energy < 10) return { action, label, available: false, reason: 'Too sleepy to play.' };
      return { action, label, available: true };
    case 'explore': {
      const r = routeAvailability(save, action.route, c);
      return { action, label, available: r.available, reason: r.reason };
    }
    default:
      return { action, label, available: true };
  }
}

/** Offline guess at care instructions in player text. */
export function parseCareInstruction(text: string, save: SaveData): ProposedAction[] {
  const t = text.toLowerCase();
  const c = activeKinling(save);
  const actions: ProposedAction[] = [];
  if (/\b(eat|feed|snack|food|hungry|meal|dinner|lunch|breakfast)\b/.test(t)) {
    const food = (Object.keys(FOODS) as FoodId[]).find((f) => t.includes(FOODS[f].name.toLowerCase()) || t.includes(f.toLowerCase()))
      ?? (c && hasFood(save, c.preferences.favoriteFood) && c.preferences.knownFavoriteFood ? c.preferences.favoriteFood : 'seedBun');
    actions.push({ type: 'feed', food: /berr/.test(t) ? 'dewberry' : /plum/.test(t) ? 'pondPlum' : /clover/.test(t) ? 'clover' : /cress/.test(t) ? 'cress' : food });
  }
  if (/\b(nap|sleep|rest|bed|tired|lie down)\b/.test(t)) actions.push({ type: 'rest' });
  if (/\b(bath|wash|groom|brush|clean)\b/.test(t)) actions.push({ type: 'groom' });
  if (/\b(play|game|chase|fetch)\b/.test(t)) actions.push({ type: 'play' });
  if (/\b(deep reeds?|swim|paddle)\b/.test(t)) actions.push({ type: 'explore', route: 'pond-deep' });
  else if (/\bpond\b/.test(t)) actions.push({ type: 'explore', route: 'pond-shallows' });
  else if (/\b(garden|flowers?)\b/.test(t)) actions.push({ type: 'explore', route: 'garden-path' });
  return coerceActions(actions);
}

export function looksLikeCareInstruction(text: string): boolean {
  const t = text.toLowerCase();
  const verbs = /\b(you should|go|let'?s|time to|why don'?t you|how about|could you|can you|please|try|want to|wanna|need to|take a|have a|get some)\b/;
  const care = /\b(eat|feed|snack|nap|sleep|rest|bath|wash|groom|brush|clean up|play|explore|garden|pond|adventure|swim)\b/;
  return care.test(t) && (verbs.test(t) || /^\s*(eat|nap|sleep|rest|play|go|explore|swim|bath)/.test(t));
}

export function looksLikeAppearanceRequest(text: string): boolean {
  const t = text.toLowerCase();
  const nouns = /\b(ears?|tail|fur|coat|colou?r|spots|stripes|markings?|wings?|fins?|horns?|glow(ing)?|look|appearance|aquatic|woodland|celestial|evolve|evolution|shape|rounder|taller)\b/;
  const verbs = /\b(make|change|give|turn|grow|evolve|become|want|try|could|can|should|add|remove|get rid|look|be more|more)\b/;
  return nouns.test(t) && verbs.test(t);
}
