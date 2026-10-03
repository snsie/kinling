// Turning a finished minigame run into rewards. All reward logic lives here:
// results are re-validated, bounded and can only be claimed once.
import { FOODS, KEEPSAKES, LOCATION_NAMES, MATERIALS, ROUTE_KEEPSAKES, ROUTES } from './catalog';
import { adventureLine } from './dialogue';
import { clampNeeds } from './needs';
import type { Outcome, RewardSummary } from './outcome';
import { rejected } from './outcome';
import { addBond, refreshProgress } from './progress';
import { activeKinling, addAffinity, addFoods, addMaterials, draft, ensureDaily, kinlingById, LIMITS, nudgePersonality, recordEvent, recordMemory } from './state';
import { isWearing } from './traits';
import type { FoodId, KeepsakeId, Kinling, MaterialCost, MaterialId, RouteId, SaveData } from './types';
import { FOOD_IDS, MATERIAL_IDS, ROUTE_IDS } from './types';
import { createRng, pick } from './util';
import type { CollectibleKind } from '../minigame/arenas';
import { COLLECTIBLE_KINDS, routeCollectibles } from '../minigame/arenas';
import type { MinigameResult } from '../minigame/engine';
import { INITIAL_ITEMS, MAX_DURATION, SPAWN_EVERY } from '../minigame/engine';

export const MIN_ENERGY_TO_EXPLORE = 20;
/**
 * Upper bound on items one run can yield (initial items plus one spawn per
 * interval over the longest run); anything above is treated as invalid.
 */
export const MAX_ITEMS_PER_RUN = INITIAL_ITEMS + Math.ceil(MAX_DURATION / SPAWN_EVERY) + 2;

const ITEM_VALUE: Record<CollectibleKind, number> = {
  leaf: 1,
  petal: 1,
  pebble: 1,
  dewberry: 1,
  clover: 1,
  shell: 1,
  reed: 1,
  dewdrop: 2,
  pondPlum: 1,
  cress: 1,
  stardust: 3,
};

const ROUTE_MATERIALS: Record<RouteId, MaterialId[]> = {
  'garden-path': ['leaf', 'petal', 'pebble'],
  'pond-shallows': ['shell', 'reed', 'dewdrop'],
  'pond-deep': ['shell', 'dewdrop', 'reed'],
};

export function scoreRun(collected: Partial<Record<CollectibleKind, number>>, hits: number, golden: boolean): number {
  let score = 0;
  for (const [k, n] of Object.entries(collected) as [CollectibleKind, number][]) score += (ITEM_VALUE[k] ?? 0) * n;
  if (golden) score += 3;
  return Math.max(0, score - hits);
}

export function tierFor(score: number): RewardSummary['tier'] {
  if (score >= 15) return 'gold';
  if (score >= 9) return 'silver';
  if (score >= 4) return 'bronze';
  return 'none';
}

export interface RouteAvailability {
  route: RouteId;
  available: boolean;
  reason?: string;
}

export function routeAvailability(save: SaveData, route: RouteId, c: Kinling | null = activeKinling(save)): RouteAvailability {
  if (!c) return { route, available: false, reason: 'Hatch your kinling first.' };
  const def = ROUTES[route];
  if (def.requiresTrait && !isWearing(c.appearance, def.requiresTrait)) {
    return { route, available: false, reason: `Needs a paddle tail to swim here.` };
  }
  if (c.needs.energy < MIN_ENERGY_TO_EXPLORE) {
    return { route, available: false, reason: `${c.name} is too sleepy to explore. Rest first.` };
  }
  return { route, available: true };
}

export function isFirstVisit(save: SaveData, route: RouteId): boolean {
  return save.stats.bestScore[route] === 0 && tripsFor(save, route) === 0;
}

function tripsFor(save: SaveData, route: RouteId): number {
  if (route === 'garden-path') return save.stats.gardenTrips;
  if (route === 'pond-deep') return save.stats.deepTrips;
  return save.stats.pondTrips - save.stats.deepTrips;
}

/** Validate and normalise an untrusted result object. Returns null if it is unusable. */
export function sanitizeResult(raw: MinigameResult): MinigameResult | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.runId !== 'string' || raw.runId.length === 0 || raw.runId.length > 80) return null;
  if (!ROUTE_IDS.includes(raw.route)) return null;
  const allowed = new Set<string>(routeCollectibles(raw.route));
  const collected: Partial<Record<CollectibleKind, number>> = {};
  let total = 0;
  for (const kind of COLLECTIBLE_KINDS) {
    const n = (raw.collected as Record<string, unknown>)?.[kind];
    if (n === undefined) continue;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) return null;
    if (n > 0 && !allowed.has(kind)) return null;
    if (n > 0) collected[kind] = n;
    total += n;
  }
  if (total > MAX_ITEMS_PER_RUN) return null;
  const hits = typeof raw.hits === 'number' && Number.isFinite(raw.hits) ? Math.max(0, Math.min(99, Math.floor(raw.hits))) : 0;
  return {
    runId: raw.runId,
    route: raw.route,
    seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? raw.seed >>> 0 : 0,
    collected,
    golden: raw.golden === true,
    hits,
    completed: raw.completed === true,
    tutorial: raw.tutorial === true,
    durationMs: typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs) ? Math.max(0, raw.durationMs) : 0,
  };
}

export interface AdventureOutcome extends Outcome {
  rewards?: RewardSummary;
}

export function resolveAdventure(save: SaveData, kinlingId: string, rawResult: MinigameResult, now: number): AdventureOutcome {
  const result = sanitizeResult(rawResult);
  if (!result) return rejected(save, 'That adventure result could not be read, so no rewards were given.');
  const c0 = kinlingById(save, kinlingId);
  if (!c0) return rejected(save, 'There is no kinling here.');
  if (save.claimedRuns.includes(result.runId)) return rejected(save, 'Rewards for this adventure were already collected.');
  const route = ROUTES[result.route];
  if (route.requiresTrait && !isWearing(c0.appearance, route.requiresTrait)) {
    return rejected(save, `${route.name} needs a paddle tail, so no rewards were given.`);
  }

  const s = draft(save);
  const c = kinlingById(s, kinlingId)!;
  ensureDaily(c, now);
  const bondBefore = c.bond;
  const firstVisit = isFirstVisit(s, result.route);
  const rand = createRng(result.seed ^ 0x9e3779b9);

  // Items gathered during the run.
  const materialGains: MaterialCost = {};
  const foodGains: Partial<Record<FoodId, number>> = {};
  for (const [kind, n] of Object.entries(result.collected) as [CollectibleKind, number][]) {
    if ((MATERIAL_IDS as readonly string[]).includes(kind)) materialGains[kind as MaterialId] = (materialGains[kind as MaterialId] ?? 0) + n;
    else if ((FOOD_IDS as readonly string[]).includes(kind)) foodGains[kind as FoodId] = (foodGains[kind as FoodId] ?? 0) + n;
  }

  const score = result.tutorial ? Math.max(4, scoreRun(result.collected, result.hits, result.golden)) : scoreRun(result.collected, result.hits, result.golden);
  // Leaving early keeps what you gathered but forfeits the tier bonus.
  const tier = result.completed ? tierFor(score) : 'none';
  const pool = ROUTE_MATERIALS[result.route];
  if (tier === 'silver') {
    const m = pick(pool, rand);
    materialGains[m] = (materialGains[m] ?? 0) + 1;
  }
  if (tier === 'gold') {
    for (let i = 0; i < 2; i++) {
      const m = pick(pool, rand);
      materialGains[m] = (materialGains[m] ?? 0) + 1;
    }
    materialGains.stardust = (materialGains.stardust ?? 0) + 1;
  }

  // Keepsakes: tutorial acorn, golden finds, and a rare starlit feather.
  const keepsakes: KeepsakeId[] = [];
  const owned = (id: KeepsakeId) => s.inventory.keepsakes.some((k) => k.id === id) || keepsakes.includes(id);
  if (result.tutorial && !owned('first-acorn')) keepsakes.push('first-acorn');
  if (result.golden && !result.tutorial) {
    const next = ROUTE_KEEPSAKES[result.route].find((id) => !owned(id));
    if (next) keepsakes.push(next);
    else materialGains.stardust = (materialGains.stardust ?? 0) + 2;
  }
  const adventuresAfter = s.stats.adventures + 1;
  if (tier === 'gold' && adventuresAfter >= 3 && !owned('starlit-feather')) keepsakes.push('starlit-feather');

  const gotMaterials = addMaterials(s.inventory, materialGains);
  const gotFoods = addFoods(s.inventory, foodGains);
  for (const id of keepsakes) s.inventory.keepsakes.push({ id, foundAt: now, location: route.location });

  // Needs: adventures are tiring but fun.
  const n = c.needs;
  n.energy -= route.energyCost;
  n.hunger -= 6;
  n.cleanliness -= route.location === 'garden' ? 9 : 5;
  const favoritePlace = c.preferences.favoritePlace === route.location;
  n.happiness += 10 + (favoritePlace ? 5 : 0);
  c.needs = clampNeeds(n);

  // Affinity grows with how much was explored.
  const affinityGain = result.tutorial ? 2 : Math.min(10, 4 + Math.floor(score / 3)) + (result.route === 'pond-deep' ? 1 : 0);
  const affinity = addAffinity(c, route.affinity, affinityGain);

  // Personality: small, deterministic, daily-capped nudges.
  nudgePersonality(
    c,
    {
      curiosity: firstVisit ? 2 : 1,
      confidence: tier === 'gold' ? 2 : tier === 'silver' ? 1 : result.hits >= 5 ? -1 : 0,
      playfulness: 1,
    },
    now,
  );

  addBond(c, result.tutorial ? 4 : 6 + (tier === 'gold' ? 3 : tier === 'silver' ? 2 : tier === 'bronze' ? 1 : 0));
  s.stats.adventures += 1;
  if (route.location === 'garden') s.stats.gardenTrips += 1;
  else s.stats.pondTrips += 1;
  if (result.route === 'pond-deep') s.stats.deepTrips += 1;
  s.stats.bestScore[result.route] = Math.max(s.stats.bestScore[result.route], score);
  s.claimedRuns.push(result.runId);
  if (s.claimedRuns.length > LIMITS.claimedRuns) s.claimedRuns.splice(0, s.claimedRuns.length - LIMITS.claimedRuns);

  // Events and memories come from what actually happened.
  const found = describeGains(gotMaterials, gotFoods);
  const desc = `${c.name} explored the ${route.name}${found ? ` and gathered ${found}` : ''}${keepsakes.length ? `, finding ${keepsakes.map((k) => `a ${KEEPSAKES[k].name}`).join(' and ')}` : ''}.`;
  recordEvent(s, 'adventure', desc, now);
  if (firstVisit) {
    recordMemory(c, { kind: 'adventure', text: `My first trip to the ${route.name} at ${LOCATION_NAMES[route.location]}.`, tags: [route.location, result.route, 'first', 'explore'], importance: 3 }, now);
  }
  if (tier === 'gold') {
    recordMemory(c, { kind: 'adventure', text: `We had an amazing haul at the ${route.name} (score ${score}).`, tags: [route.location, 'gold', 'explore'], importance: 2 }, now);
  }
  for (const k of keepsakes) {
    recordEvent(s, 'keepsake', `${c.name} found the ${KEEPSAKES[k].name} keepsake.`, now);
    recordMemory(c, { kind: 'keepsake', text: `I found a ${KEEPSAKES[k].name}: ${KEEPSAKES[k].description}`, tags: ['keepsake', k, route.location, ...KEEPSAKES[k].name.toLowerCase().split(' ')], importance: 3 }, now);
  }
  if (favoritePlace && !c.preferences.knownFavoritePlace) {
    c.preferences.knownFavoritePlace = true;
    recordMemory(c, { kind: 'preference', text: `I realized ${LOCATION_NAMES[route.location]} is my favorite place.`, tags: [route.location, 'favorite', 'place'], importance: 3 }, now);
  }

  const progress = refreshProgress(s, c, now, bondBefore);
  const rewards: RewardSummary = {
    materials: gotMaterials,
    foods: gotFoods,
    keepsakes,
    tier,
    score,
    affinity: affinity > 0 ? { key: route.affinity, amount: affinity } : null,
  };
  return {
    save: s,
    rewards,
    feedback: {
      ok: true,
      line: adventureLine(result.route, tier, keepsakes[0] ?? null),
      animation: 'happy',
      sound: keepsakes.length ? 'sparkle' : 'chime',
      aiEvent: desc + (tier !== 'none' ? ` It was a ${tier}-tier trip.` : ''),
      rewards,
      ...progress,
    },
  };
}

export function describeGains(materials: MaterialCost, foods: Partial<Record<FoodId, number>>): string {
  const parts: string[] = [];
  for (const [id, n] of Object.entries(materials) as [MaterialId, number][]) {
    if (n) parts.push(`${n} ${n === 1 ? MATERIALS[id].name.toLowerCase() : MATERIALS[id].plural.toLowerCase()}`);
  }
  for (const [id, n] of Object.entries(foods) as [FoodId, number][]) {
    if (n) parts.push(`${n} ${(n === 1 ? FOODS[id].name : FOODS[id].plural).toLowerCase()}`);
  }
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
