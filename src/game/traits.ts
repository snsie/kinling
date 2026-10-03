// Catalog of supported physical traits, unlock rules and appearance helpers.
// The AI may only refer to traits by these identifiers; code decides everything else.
import { COLORS, EGGS, STARTER_COLORS } from './catalog';
import type {
  AffinityKey,
  Appearance,
  ColorId,
  EggType,
  KeepsakeId,
  LifeStage,
  MaterialCost,
  Proportions,
  SaveData,
  ShapeId,
  Stats,
  TraitId,
  TraitSlot,
} from './types';
import { COLOR_IDS, EAR_IDS, LIFE_STAGES, PATTERN_IDS, SHAPE_IDS, TAIL_IDS } from './types';
import { lifeStageFor } from './stage';

export type UnlockRequirement =
  | { kind: 'affinity'; affinity: AffinityKey; min: number }
  | { kind: 'stage'; min: LifeStage }
  | { kind: 'keepsake'; keepsake: KeepsakeId }
  | { kind: 'stat'; stat: Exclude<keyof Stats, 'bestScore'>; min: number; label: string };

export type TraitTheme = 'woodland' | 'aquatic' | 'celestial' | 'neutral';

export interface TraitDef {
  id: TraitId;
  slot: TraitSlot;
  name: string;
  description: string;
  theme: TraitTheme;
  /** All requirements must be met. Empty = available from the start. */
  unlock: UnlockRequirement[];
  /** Paid once, on first adoption. */
  cost: MaterialCost;
  /** Toggle traits (horns, fins, wings, glow) can be removed; slot traits are replaced. */
  toggle: boolean;
  incompatible?: { trait: TraitId; reason: string }[];
  effect?: string;
}

export const SHAPE_PRESETS: Record<ShapeId, Proportions> = {
  balanced: { plump: 0.5, head: 0.5, height: 0.5 },
  round: { plump: 0.85, head: 0.5, height: 0.4 },
  petite: { plump: 0.4, head: 0.65, height: 0.3 },
  tall: { plump: 0.35, head: 0.4, height: 0.85 },
};

const SHAPE_TEXT: Record<ShapeId, { name: string; description: string }> = {
  balanced: { name: 'Balanced build', description: 'Even, classic proportions.' },
  round: { name: 'Round build', description: 'Extra round and huggable.' },
  petite: { name: 'Petite build', description: 'Small body with a big head.' },
  tall: { name: 'Tall build', description: 'Longer body and legs.' },
};

const COLOR_UNLOCKS: Partial<Record<ColorId, { unlock: UnlockRequirement[]; cost: MaterialCost; theme: TraitTheme }>> = {
  moss: { unlock: [{ kind: 'affinity', affinity: 'woodland', min: 25 }], cost: { leaf: 6 }, theme: 'woodland' },
  lagoon: { unlock: [{ kind: 'affinity', affinity: 'aquatic', min: 25 }], cost: { shell: 4, dewdrop: 2 }, theme: 'aquatic' },
  starlight: { unlock: [{ kind: 'keepsake', keepsake: 'moonpetal' }], cost: { stardust: 3 }, theme: 'celestial' },
  sunset: {
    unlock: [{ kind: 'stat', stat: 'adventures', min: 5, label: 'adventures' }],
    cost: { petal: 5, pebble: 4 },
    theme: 'neutral',
  },
};

const EAR_TEXT = {
  rounded: { name: 'Rounded ears', description: 'Soft, round little ears.', theme: 'neutral' },
  floppy: { name: 'Floppy ears', description: 'Long ears that flop when it bounces.', theme: 'neutral' },
  leaf: { name: 'Leaf ears', description: 'Ears shaped like new spring leaves.', theme: 'woodland' },
  fluffy: { name: 'Fluffy ears', description: 'Big tufted ears full of fluff.', theme: 'neutral' },
} as const;

const TAIL_TEXT = {
  short: { name: 'Short tail', description: 'A tidy little nub of a tail.', theme: 'neutral' },
  curled: { name: 'Curled tail', description: 'A springy tail with a curl.', theme: 'woodland' },
  paddle: { name: 'Paddle tail', description: 'A flat, strong tail made for swimming.', theme: 'aquatic' },
} as const;

const PATTERN_TEXT = {
  none: { name: 'No markings', description: 'A plain, smooth coat.' },
  spots: { name: 'Spots', description: 'Freckle-like spots across the back.' },
  stripes: { name: 'Stripes', description: 'Soft stripes along the back.' },
} as const;

function buildCatalog(): TraitDef[] {
  const defs: TraitDef[] = [];
  for (const color of COLOR_IDS) {
    const special = COLOR_UNLOCKS[color];
    defs.push({
      id: `color.${color}`,
      slot: 'bodyColor',
      name: `${COLORS[color].name} coat`,
      description: `${COLORS[color].name}-colored fur.`,
      theme: special?.theme ?? 'neutral',
      unlock: special?.unlock ?? [],
      cost: special?.cost ?? {},
      toggle: false,
    });
  }
  for (const shape of SHAPE_IDS) {
    defs.push({
      id: `shape.${shape}`,
      slot: 'proportions',
      ...SHAPE_TEXT[shape],
      theme: 'neutral',
      unlock: shape === 'tall' ? [{ kind: 'stage', min: 'sprout' }] : [],
      cost: {},
      toggle: false,
    });
  }
  for (const pattern of PATTERN_IDS) {
    defs.push({ id: `pattern.${pattern}`, slot: 'pattern', ...PATTERN_TEXT[pattern], theme: 'neutral', unlock: [], cost: {}, toggle: false });
  }
  for (const ear of EAR_IDS) {
    defs.push({
      id: `ears.${ear}`,
      slot: 'ears',
      ...EAR_TEXT[ear],
      unlock: ear === 'leaf' ? [{ kind: 'affinity', affinity: 'woodland', min: 15 }] : [],
      cost: ear === 'leaf' ? { leaf: 5, petal: 3 } : {},
      toggle: false,
    });
  }
  for (const tail of TAIL_IDS) {
    defs.push({
      id: `tail.${tail}`,
      slot: 'tail',
      ...TAIL_TEXT[tail],
      unlock:
        tail === 'paddle'
          ? [
              { kind: 'affinity', affinity: 'aquatic', min: 20 },
              { kind: 'stat', stat: 'pondTrips', min: 1, label: 'pond trips' },
            ]
          : [],
      cost: tail === 'paddle' ? { reed: 5, shell: 4 } : {},
      toggle: false,
      effect: tail === 'paddle' ? 'Lets your kinling swim the Deep Reeds route at the pond.' : undefined,
    });
  }
  defs.push(
    {
      id: 'feature.glow',
      slot: 'glow',
      name: 'Glowing markings',
      description: 'Markings that shimmer softly, like moonlight.',
      theme: 'celestial',
      unlock: [{ kind: 'keepsake', keepsake: 'moonpetal' }],
      cost: { stardust: 2, dewdrop: 3 },
      toggle: true,
    },
    {
      id: 'feature.horns',
      slot: 'horns',
      name: 'Small horns',
      description: 'Two little rounded horns, like acorn caps.',
      theme: 'woodland',
      unlock: [{ kind: 'affinity', affinity: 'woodland', min: 30 }],
      cost: { pebble: 6, leaf: 4 },
      toggle: true,
    },
    {
      id: 'feature.fins',
      slot: 'fins',
      name: 'Back fin',
      description: 'A frilly fin along the back, great for gliding through water.',
      theme: 'aquatic',
      unlock: [{ kind: 'affinity', affinity: 'aquatic', min: 30 }],
      cost: { shell: 6, reed: 4, dewdrop: 3 },
      toggle: true,
      incompatible: [{ trait: 'feature.wings', reason: 'Wings and a back fin both sit on the back, so only one fits.' }],
    },
    {
      id: 'feature.wings',
      slot: 'wings',
      name: 'Decorative wings',
      description: 'Tiny gauzy wings. Too small to fly, perfect for fluttering.',
      theme: 'celestial',
      unlock: [
        { kind: 'keepsake', keepsake: 'starlit-feather' },
        { kind: 'stage', min: 'sprout' },
      ],
      cost: { petal: 6, stardust: 3 },
      toggle: true,
      incompatible: [{ trait: 'feature.fins', reason: 'Wings and a back fin both sit on the back, so only one fits.' }],
    },
  );
  return defs;
}

export const TRAITS: readonly TraitDef[] = buildCatalog();
export const TRAIT_BY_ID: ReadonlyMap<string, TraitDef> = new Map(TRAITS.map((t) => [t.id, t]));
export const ALL_TRAIT_IDS = TRAITS.map((t) => t.id) as TraitId[];

export function isTraitId(value: unknown): value is TraitId {
  return typeof value === 'string' && TRAIT_BY_ID.has(value);
}

export function getTrait(id: TraitId): TraitDef {
  const def = TRAIT_BY_ID.get(id);
  if (!def) throw new Error(`Unknown trait ${id}`);
  return def;
}

export function starterTraitsFor(egg: EggType): TraitId[] {
  const shared = TRAITS.filter((t) => t.unlock.length === 0 && (t.slot !== 'bodyColor' || STARTER_COLORS.includes(colorOf(t.id)))).map(
    (t) => t.id,
  );
  return [...new Set([...shared, ...EGGS[egg].starterTraits])];
}

function colorOf(id: TraitId): ColorId {
  return id.slice('color.'.length) as ColorId;
}

export function nearestShape(p: Proportions): ShapeId {
  let best: ShapeId = 'balanced';
  let bestDist = Infinity;
  for (const shape of SHAPE_IDS) {
    const q = SHAPE_PRESETS[shape];
    const d = (q.plump - p.plump) ** 2 + (q.head - p.head) ** 2 + (q.height - p.height) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = shape;
    }
  }
  return best;
}

/** Trait ids currently worn by an appearance (toggles only when active). */
export function wornTraits(a: Appearance): TraitId[] {
  const ids: TraitId[] = [
    `color.${a.bodyColor}`,
    `shape.${nearestShape(a.proportions)}`,
    `pattern.${a.pattern}`,
    `ears.${a.ears}`,
    `tail.${a.tail}`,
  ];
  if (a.glow) ids.push('feature.glow');
  if (a.horns) ids.push('feature.horns');
  if (a.fins) ids.push('feature.fins');
  if (a.wings) ids.push('feature.wings');
  return ids;
}

/** Trait ids that matter for cost/unlock checks: shape presets are free so they are excluded unless locked. */
export function isWearing(a: Appearance, id: TraitId): boolean {
  return wornTraits(a).includes(id);
}

export function withTrait(a: Appearance, id: TraitId, remove = false): Appearance {
  const next: Appearance = { ...a, proportions: { ...a.proportions } };
  const [prefix, value] = id.split('.') as [string, string];
  switch (prefix) {
    case 'color':
      next.bodyColor = value as ColorId;
      break;
    case 'shape':
      next.proportions = { ...SHAPE_PRESETS[value as ShapeId] };
      break;
    case 'pattern':
      next.pattern = value as Appearance['pattern'];
      break;
    case 'ears':
      next.ears = value as Appearance['ears'];
      break;
    case 'tail':
      next.tail = value as Appearance['tail'];
      break;
    case 'feature':
      if (value === 'glow') next.glow = !remove;
      if (value === 'horns') next.horns = !remove;
      if (value === 'fins') next.fins = !remove;
      if (value === 'wings') next.wings = !remove;
      break;
  }
  return next;
}

/** Unlocks are shared, so a requirement counts as met when any kinling meets it. */
export function requirementMet(save: SaveData, req: UnlockRequirement): boolean {
  switch (req.kind) {
    case 'affinity':
      return save.kinlings.some((k) => k.affinities[req.affinity] >= req.min);
    case 'stage':
      return save.kinlings.some((k) => LIFE_STAGES.indexOf(lifeStageFor(k.bond)) >= LIFE_STAGES.indexOf(req.min));
    case 'keepsake':
      return save.inventory.keepsakes.some((k) => k.id === req.keepsake);
    case 'stat':
      return save.stats[req.stat] >= req.min;
  }
}

export function describeRequirement(save: SaveData | null, req: UnlockRequirement): string {
  switch (req.kind) {
    case 'affinity': {
      const now = Math.floor(Math.max(0, ...(save?.kinlings ?? []).map((k) => k.affinities[req.affinity])));
      return `${req.affinity === 'woodland' ? 'Woodland' : 'Aquatic'} affinity ${req.min} (now ${now})`;
    }
    case 'stage':
      return `Grow to the ${req.min} stage`;
    case 'keepsake': {
      return `Find a special keepsake while exploring`;
    }
    case 'stat': {
      const now = save ? save.stats[req.stat] : 0;
      return `${req.min} ${req.label} (now ${now})`;
    }
  }
}

/** Traits whose unlock requirements are newly satisfied. */
export function newlyUnlockedTraits(save: SaveData): TraitId[] {
  const have = new Set(save.unlocks.traits);
  return TRAITS.filter((t) => !have.has(t.id) && t.unlock.length > 0 && t.unlock.every((r) => requirementMet(save, r))).map(
    (t) => t.id,
  );
}

export function traitLabel(id: TraitId): string {
  return TRAIT_BY_ID.get(id)?.name ?? id;
}

export function costIsEmpty(cost: MaterialCost): boolean {
  return Object.values(cost).every((v) => !v);
}

export function describeAppearance(a: Appearance): string {
  const parts = [
    `${COLORS[a.bodyColor].name.toLowerCase()} fur`,
    `${a.ears} ears`,
    `a ${a.tail} tail`,
    a.pattern === 'none' ? 'no markings' : `${COLORS[a.markingColor].name.toLowerCase()} ${a.pattern}`,
  ];
  if (a.glow) parts.push('glowing markings');
  if (a.horns) parts.push('small horns');
  if (a.fins) parts.push('a back fin');
  if (a.wings) parts.push('tiny decorative wings');
  const shape = nearestShape(a.proportions);
  if (shape !== 'balanced') parts.push(`a ${shape} build`);
  return parts.join(', ');
}
