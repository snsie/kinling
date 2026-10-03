// Static game data: palette, items, keepsakes, routes and eggs.
import type {
  AffinityKey,
  Appearance,
  ColorId,
  EggType,
  FoodId,
  KeepsakeId,
  LocationId,
  MaterialId,
  Personality,
  Preferences,
  RouteId,
  TraitId,
} from './types';

export interface ColorDef {
  name: string;
  /** Main fill. */
  base: string;
  /** Darker shade for outlines/shadows. */
  shade: string;
  /** Lighter tint for highlights. */
  light: string;
  /** Words players might use for this color (used by the offline request parser). */
  words: string[];
}

export const COLORS: Record<ColorId, ColorDef> = {
  peach: { name: 'Peach', base: '#F6B99A', shade: '#C9805F', light: '#FCDCCB', words: ['peach', 'apricot', 'orange'] },
  rose: { name: 'Rose', base: '#F4A7BB', shade: '#C96F88', light: '#FBD3DE', words: ['pink', 'rose', 'blush'] },
  butter: { name: 'Butter', base: '#F7D98B', shade: '#C6A44E', light: '#FCEDC2', words: ['yellow', 'butter', 'gold', 'golden'] },
  mint: { name: 'Mint', base: '#A9DDBE', shade: '#68A783', light: '#D6F0E0', words: ['mint', 'light green', 'pale green'] },
  sky: { name: 'Sky', base: '#A7CDEE', shade: '#6A96C0', light: '#D5E7F7', words: ['blue', 'sky', 'light blue'] },
  lilac: { name: 'Lilac', base: '#C9B3E8', shade: '#8E74B7', light: '#E6DAF5', words: ['purple', 'lilac', 'lavender', 'violet'] },
  cream: { name: 'Cream', base: '#F6EAD3', shade: '#C3AF8B', light: '#FFF8EA', words: ['white', 'cream', 'ivory', 'pale'] },
  cocoa: { name: 'Cocoa', base: '#B98B6E', shade: '#82593F', light: '#DCC0AC', words: ['brown', 'cocoa', 'chocolate', 'tan'] },
  moss: { name: 'Moss', base: '#8FB573', shade: '#5B7F43', light: '#C6DDB5', words: ['green', 'moss', 'mossy', 'forest green'] },
  lagoon: { name: 'Lagoon', base: '#6FC2C4', shade: '#3B8A8D', light: '#B5E3E3', words: ['teal', 'lagoon', 'aqua', 'turquoise', 'sea green'] },
  starlight: { name: 'Starlight', base: '#8E9BE0', shade: '#5A63A8', light: '#C7CEF4', words: ['indigo', 'starlight', 'night', 'periwinkle', 'starry'] },
  sunset: { name: 'Sunset', base: '#F08C7E', shade: '#B9564A', light: '#F9C6BE', words: ['red', 'coral', 'sunset', 'salmon'] },
};

export const STARTER_COLORS: ColorId[] = ['peach', 'rose', 'butter', 'mint', 'sky', 'lilac', 'cream', 'cocoa'];

export interface MaterialDef {
  name: string;
  plural: string;
  description: string;
  location: LocationId | 'both';
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  leaf: { name: 'Leaf', plural: 'Leaves', description: 'A crisp garden leaf.', location: 'garden' },
  petal: { name: 'Petal', plural: 'Petals', description: 'A soft, sweet-smelling petal.', location: 'garden' },
  pebble: { name: 'Pebble', plural: 'Pebbles', description: 'A round pebble, warm from the sun.', location: 'garden' },
  shell: { name: 'Shell', plural: 'Shells', description: 'A tiny snail-swirl shell.', location: 'pond' },
  reed: { name: 'Reed', plural: 'Reeds', description: 'A bendy pond reed.', location: 'pond' },
  dewdrop: { name: 'Dewdrop', plural: 'Dewdrops', description: 'A droplet that never quite dries.', location: 'pond' },
  stardust: { name: 'Stardust', plural: 'Stardust', description: 'A pinch of glittering dust. Rare!', location: 'both' },
};

export interface FoodDef {
  name: string;
  plural: string;
  description: string;
  /** How much hunger it restores. */
  hunger: number;
  happiness: number;
  /** Small affinity nudge from eating it. */
  affinity?: AffinityKey;
  /** Basic food that never runs out, so care is never blocked. */
  unlimited?: boolean;
}

export const FOODS: Record<FoodId, FoodDef> = {
  seedBun: { name: 'Seed Bun', plural: 'Seed Buns', description: 'A warm bun from the pantry. There are always more.', hunger: 28, happiness: 3, unlimited: true },
  dewberry: { name: 'Dewberry', plural: 'Dewberries', description: 'A plump, tart garden berry.', hunger: 22, happiness: 7, affinity: 'woodland' },
  clover: { name: 'Sweet Clover', plural: 'Sweet Clover', description: 'Crunchy clover with a honey taste.', hunger: 18, happiness: 6, affinity: 'woodland' },
  pondPlum: { name: 'Pond Plum', plural: 'Pond Plums', description: 'A floating purple fruit.', hunger: 24, happiness: 7, affinity: 'aquatic' },
  cress: { name: 'Water Cress', plural: 'Water Cress', description: 'Peppery greens from the shallows.', hunger: 16, happiness: 5, affinity: 'aquatic' },
  starDrop: { name: 'Star Drop', plural: 'Star Drops', description: 'A fizzy candy made from stardust.', hunger: 12, happiness: 14 },
};

export const FOOD_CAP = 20;
export const MATERIAL_CAP = 99;

export interface KeepsakeDef {
  name: string;
  description: string;
  location: LocationId | 'both';
  /** Only found on this route (e.g. deep pond). */
  route?: RouteId;
  /** Trait this keepsake helps unlock, for display. */
  unlocksHint?: string;
}

export const KEEPSAKES: Record<KeepsakeId, KeepsakeDef> = {
  'first-acorn': { name: 'Tiny Acorn Cap', description: 'Found on your very first garden walk together.', location: 'garden' },
  'ladybug-button': { name: 'Ladybug Button', description: 'A red button with seven painted spots.', location: 'garden' },
  'four-leaf-clover': { name: 'Four-Leaf Clover', description: 'Lucky! Pressed flat and kept safe.', location: 'garden' },
  moonpetal: { name: 'Moonpetal', description: 'A pale petal that glows faintly at night.', location: 'garden', unlocksHint: 'Glowing markings' },
  'swirl-shell': { name: 'Swirl Shell', description: 'A spiral shell that hums when held to an ear.', location: 'pond' },
  'kingfisher-feather': { name: 'Kingfisher Feather', description: 'Bright blue, dropped by a passing bird.', location: 'pond' },
  'wishing-stone': { name: 'Wishing Stone', description: 'A smooth stone with a hole worn through.', location: 'pond' },
  'river-pearl': { name: 'River Pearl', description: 'A pearl from the deep reeds, found while paddling.', location: 'pond', route: 'pond-deep' },
  'starlit-feather': { name: 'Starlit Feather', description: 'A shimmering feather that fell with a shooting star.', location: 'both', unlocksHint: 'Decorative wings' },
};

/** Keepsakes that can be found by collecting a golden item on each route, in order. */
export const ROUTE_KEEPSAKES: Record<RouteId, KeepsakeId[]> = {
  'garden-path': ['ladybug-button', 'moonpetal', 'four-leaf-clover'],
  'pond-shallows': ['swirl-shell', 'kingfisher-feather', 'wishing-stone'],
  'pond-deep': ['river-pearl', 'wishing-stone', 'kingfisher-feather'],
};

export interface RouteDef {
  id: RouteId;
  location: LocationId;
  name: string;
  description: string;
  obstacleHint: string;
  /** Current-appearance trait needed to take this route. */
  requiresTrait?: TraitId;
  affinity: AffinityKey;
  energyCost: number;
}

export const ROUTES: Record<RouteId, RouteDef> = {
  'garden-path': {
    id: 'garden-path',
    location: 'garden',
    name: 'Garden Path',
    description: 'Gather leaves, petals and berries among the flower beds.',
    obstacleHint: 'Buzzy bees startle, and thorny brambles slow you down.',
    affinity: 'woodland',
    energyCost: 14,
  },
  'pond-shallows': {
    id: 'pond-shallows',
    location: 'pond',
    name: 'Pond Shallows',
    description: 'Hop across lily pads to find shells, reeds and pond plums.',
    obstacleHint: 'Deep water blocks the way, and hopping frogs cause splashes.',
    affinity: 'aquatic',
    energyCost: 14,
  },
  'pond-deep': {
    id: 'pond-deep',
    location: 'pond',
    name: 'Deep Reeds',
    description: 'Paddle through open water where river pearls hide.',
    obstacleHint: 'A gentle current pushes you along, and drifting logs bump.',
    requiresTrait: 'tail.paddle',
    affinity: 'aquatic',
    energyCost: 16,
  },
};

export const LOCATION_NAMES: Record<LocationId, string> = {
  garden: 'the garden',
  pond: 'the pond',
};

export interface EggDef {
  id: EggType;
  name: string;
  description: string;
  personality: Personality;
  affinities: Record<AffinityKey, number>;
  preferences: Pick<Preferences, 'favoriteFood' | 'dislikedFood' | 'favoritePlace'>;
  /** Traits unlocked from the start for this egg in addition to the shared starters. */
  starterTraits: TraitId[];
  defaultAppearance: Appearance;
  shell: { base: string; spot: string; shade: string };
}

const BALANCED = { plump: 0.5, head: 0.5, height: 0.5 };

export const EGGS: Record<EggType, EggDef> = {
  woodland: {
    id: 'woodland',
    name: 'Woodland Egg',
    description: 'Speckled like a sunlit forest floor. Hatchlings love berries and leafy places.',
    personality: { curiosity: 55, confidence: 45, playfulness: 50 },
    affinities: { woodland: 15, aquatic: 0 },
    preferences: { favoriteFood: 'dewberry', dislikedFood: 'cress', favoritePlace: 'garden' },
    starterTraits: ['ears.leaf', 'color.moss'],
    defaultAppearance: {
      bodyColor: 'moss',
      accentColor: 'cream',
      markingColor: 'cocoa',
      proportions: { ...BALANCED },
      pattern: 'spots',
      glow: false,
      ears: 'leaf',
      tail: 'curled',
      horns: false,
      fins: false,
      wings: false,
    },
    shell: { base: '#CFE3B4', spot: '#8FB573', shade: '#7E9C63' },
  },
  aquatic: {
    id: 'aquatic',
    name: 'Aquatic Egg',
    description: 'Cool and glossy like a river stone. Hatchlings adore splashing and pond plums.',
    personality: { curiosity: 50, confidence: 40, playfulness: 60 },
    affinities: { woodland: 0, aquatic: 15 },
    preferences: { favoriteFood: 'pondPlum', dislikedFood: 'clover', favoritePlace: 'pond' },
    starterTraits: ['color.lagoon'],
    defaultAppearance: {
      bodyColor: 'lagoon',
      accentColor: 'cream',
      markingColor: 'sky',
      proportions: { plump: 0.6, head: 0.5, height: 0.45 },
      pattern: 'stripes',
      glow: false,
      ears: 'rounded',
      tail: 'short',
      horns: false,
      fins: false,
      wings: false,
    },
    shell: { base: '#BFE3EA', spot: '#6FC2C4', shade: '#5AA3A8' },
  },
  celestial: {
    id: 'celestial',
    name: 'Celestial Egg',
    description: 'Faintly glittering, as if it fell from the night sky. Hatchlings are dreamy and bold.',
    personality: { curiosity: 60, confidence: 50, playfulness: 45 },
    affinities: { woodland: 8, aquatic: 8 },
    preferences: { favoriteFood: 'clover', dislikedFood: 'pondPlum', favoritePlace: 'garden' },
    starterTraits: ['feature.glow', 'color.starlight'],
    defaultAppearance: {
      bodyColor: 'lilac',
      accentColor: 'cream',
      markingColor: 'butter',
      proportions: { plump: 0.45, head: 0.55, height: 0.5 },
      pattern: 'spots',
      glow: true,
      ears: 'fluffy',
      tail: 'short',
      horns: false,
      fins: false,
      wings: false,
    },
    shell: { base: '#D9D2F2', spot: '#F7D98B', shade: '#9D90CF' },
  },
};

export const BOND_STAGES: { stage: 'hatchling' | 'sprout' | 'grown'; minBond: number }[] = [
  { stage: 'hatchling', minBond: 0 },
  { stage: 'sprout', minBond: 60 },
  { stage: 'grown', minBond: 200 },
];
