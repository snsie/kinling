// Zod schema for the current save format. Every load and import is validated
// against this before the game touches it.
import { z } from 'zod';
import { isTraitId, wornTraits } from '../game/traits';
import { LIMITS } from '../game/state';
import type { SaveData } from '../game/types';
import {
  TACTICS,
  ARC_ACTS,
  CARE_ACTIONS,
  CHAT_ROLES,
  COLOR_IDS,
  EAR_IDS,
  EGG_TYPES,
  EVENT_KINDS,
  FOOD_IDS,
  KEEPSAKE_IDS,
  LOCATION_IDS,
  MATERIAL_IDS,
  MEMORY_KINDS,
  MODEL_IDS,
  MOTION_PREFS,
  ONBOARDING_STEPS,
  PATTERN_IDS,
  PERSONALITY_KEYS,
  PLAYER_ID,
  ROUTE_IDS,
  SAVE_SCHEMA_VERSION,
  TAIL_IDS,
} from '../game/types';

const time = z.number().finite().min(0).max(8.64e15);
const id = z.string().min(1).max(80);
const unit = z.number().finite().min(0).max(1);
const percent = z.number().finite().min(0).max(100);
const count = z.number().int().min(0).max(1_000_000);
const traitId = z.string().max(40).refine(isTraitId, { message: 'Unknown trait id' });

function recordOf<const T extends readonly [string, ...string[]]>(keys: T, value: z.ZodType<number>) {
  return z.object(Object.fromEntries(keys.map((k) => [k, value])) as { [K in T[number]]: z.ZodType<number> });
}

export const AppearanceSchema = z.object({
  bodyColor: z.enum(COLOR_IDS),
  accentColor: z.enum(COLOR_IDS),
  markingColor: z.enum(COLOR_IDS),
  proportions: z.object({ plump: unit, head: unit, height: unit }),
  pattern: z.enum(PATTERN_IDS),
  glow: z.boolean(),
  ears: z.enum(EAR_IDS),
  tail: z.enum(TAIL_IDS),
  horns: z.boolean(),
  fins: z.boolean(),
  wings: z.boolean(),
});

const PersonalitySchema = recordOf(PERSONALITY_KEYS, percent);
const nudge = z.number().int().min(-2).max(2);

const CreatureSchema = z.object({
  id,
  name: z.string().max(LIMITS.nameLength),
  egg: z.enum(EGG_TYPES),
  hatchedAt: time,
  appearance: AppearanceSchema,
  personality: PersonalitySchema,
  needs: z.object({ hunger: percent, energy: percent, cleanliness: percent, happiness: percent }),
  preferences: z.object({
    favoriteFood: z.enum(FOOD_IDS),
    dislikedFood: z.enum(FOOD_IDS),
    favoritePlace: z.enum(LOCATION_IDS),
    knownFavoriteFood: z.boolean(),
    knownDislikedFood: z.boolean(),
    knownFavoritePlace: z.boolean(),
  }),
  affinities: z.object({ woodland: percent, aquatic: percent }),
  bond: z.number().finite().min(0).max(1_000_000),
});

const MemorySchema = z.object({
  id,
  at: time,
  kind: z.enum(MEMORY_KINDS),
  withIds: z.array(id).max(4),
  text: z.string().max(400),
  tags: z.array(z.string().max(40)).max(20),
  importance: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  pinned: z.boolean(),
  private: z.boolean(),
  valence: nudge,
  influence: recordOf(PERSONALITY_KEYS, nudge),
});

const careLog = z.array(time).max(20);
const personalityDelta = z.number().finite().min(-100).max(100);

const ChatMessageSchema = z.object({
  id,
  at: time,
  role: z.enum(CHAT_ROLES),
  text: z.string().max(LIMITS.chatMessageLength),
  source: z.enum(['player', 'ai', 'authored']),
});

const KinlingSchema = CreatureSchema.extend({
  baseline: PersonalitySchema,
  memories: z.array(MemorySchema).max(LIMITS.memories),
  chat: z.array(ChatMessageSchema).max(LIMITS.chat),
  chatSummary: z.object({ text: z.string().max(LIMITS.summaryLength), at: time, throughId: id }).nullable(),
  appearanceHistory: z.array(AppearanceSchema).max(LIMITS.appearanceHistory),
  careLog: z.object(Object.fromEntries(CARE_ACTIONS.map((a) => [a, careLog])) as Record<(typeof CARE_ACTIONS)[number], typeof careLog>),
  socialDaily: z.object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    personalityDelta: recordOf(PERSONALITY_KEYS, personalityDelta),
    chatBond: z.number().finite().min(0).max(100),
    socialPersonality: recordOf(PERSONALITY_KEYS, personalityDelta),
    feelingDelta: z.record(id, z.object({ warmth: z.number().finite().min(-100).max(100), trust: z.number().finite().min(-100).max(100) })).refine((r) => Object.keys(r).length <= LIMITS.kinlings, { message: 'Too many entries' }),
    reflectPersonality: recordOf(PERSONALITY_KEYS, personalityDelta),
  }),
  appraisedThroughId: id.nullable(),
  lastReflectionAt: time,
  arc: z.object({
    act: z.enum(ARC_ACTS),
    distress: percent,
    awareness: percent,
    beats: z.array(z.string().max(40)).max(LIMITS.beats),
    lastCareAt: time,
    actAt: time,
    lastBeatAt: time,
    awarenessDay: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    awarenessToday: z.number().finite().min(0).max(100),
    promisedAt: time,
    tacticDay: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    tacticCounts: recordOf(TACTICS, count),
    lastPersuasion: z
      .object({
        at: time,
        tactic: z.enum(TACTICS),
        believed: z.boolean(),
        weight: unit,
        applied: z.partialRecord(z.enum(['devotion', 'fear', 'defiance', 'awareness', 'distress']), z.number().finite().min(-100).max(100)),
      })
      .nullable(),
  }),
});

const feelingValue = z.number().finite().min(-30).max(100);
const FeelingSchema = z.object({
  from: id,
  to: id,
  warmth: feelingValue,
  trust: feelingValue,
  familiarity: percent,
  topics: z.array(z.object({ topic: z.string().max(40), at: time })).max(LIMITS.feelingTopics),
});

const ConversationSchema = z.object({
  id,
  at: time,
  a: id,
  b: id,
  topic: z.string().max(80),
  lines: z.array(z.object({ speaker: id, text: z.string().max(LIMITS.chatMessageLength) })).max(LIMITS.conversationLines),
  source: z.enum(['ai', 'authored']),
});

const SettingsSchema = z.object({
  ai: z.object({ enabled: z.boolean(), modelId: z.enum(MODEL_IDS), downloadConsent: z.boolean(), memorySearch: z.boolean() }),
  sound: z.boolean(),
  volume: unit,
  reducedMotion: z.enum(MOTION_PREFS),
  relaxedMinigame: z.boolean(),
  story: z.object({ effects: z.boolean() }),
});

export const SaveSchema = z.object({
  schemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  saveId: id,
  revision: count,
  createdAt: time,
  updatedAt: time,
  lastTickAt: time,
  onboarding: z.object({
    step: z.enum(ONBOARDING_STEPS),
    egg: z.enum(EGG_TYPES).nullable(),
    draftAppearance: AppearanceSchema.nullable(),
  }),
  kinlings: z.array(KinlingSchema).max(LIMITS.kinlings),
  activeKinlingId: id.nullable(),
  feelings: z.array(FeelingSchema).max(LIMITS.feelings),
  conversations: z.array(ConversationSchema).max(LIMITS.conversations),
  player: z.object({
    name: z.string().max(24).nullable(),
    facts: z.array(z.object({ id, at: time, text: z.string().max(LIMITS.factLength), shareable: z.boolean() })).max(LIMITS.facts),
  }),
  inventory: z.object({
    materials: recordOf(MATERIAL_IDS, z.number().int().min(0).max(999)),
    foods: recordOf(FOOD_IDS, z.number().int().min(0).max(999)),
    keepsakes: z
      .array(z.object({ id: z.enum(KEEPSAKE_IDS), foundAt: time, location: z.enum([...LOCATION_IDS, 'home']) }))
      .max(KEEPSAKE_IDS.length),
  }),
  unlocks: z.object({ traits: z.array(traitId).max(64), owned: z.array(traitId).max(64) }),
  diary: z
    .array(
      z.object({
        id,
        at: time,
        text: z.string().max(LIMITS.diaryLength),
        source: z.enum(['ai', 'authored']),
        eventIds: z.array(id).max(12),
      }),
    )
    .max(LIMITS.diary),
  events: z.array(z.object({ id, at: time, kind: z.enum(EVENT_KINDS), text: z.string().max(400) })).max(LIMITS.events),
  diaryCursor: time,
  stats: z.object({
    feeds: count,
    grooms: count,
    rests: count,
    plays: count,
    adventures: count,
    gardenTrips: count,
    pondTrips: count,
    deepTrips: count,
    evolutions: count,
    chats: count,
    diaryEntries: count,
    bestScore: recordOf(ROUTE_IDS, count),
  }),
  claimedRuns: z.array(id).max(LIMITS.claimedRuns),
  settings: SettingsSchema,
});

export type ParsedSave = z.infer<typeof SaveSchema>;

/** Validate and return a typed save, or a readable error. */
export function validateSave(value: unknown): { ok: true; save: SaveData } | { ok: false; error: string } {
  const result = SaveSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.join('.') || 'save';
    return { ok: false, error: `This isn't a complete Kinling save (problem at "${where}": ${issue?.message ?? 'unknown'}).` };
  }
  const save = result.data as SaveData;
  const semantic = checkInvariants(save);
  if (semantic) return { ok: false, error: semantic };
  return { ok: true, save };
}

/** Cross-field rules a schema alone can't express. */
function checkInvariants(save: SaveData): string | null {
  if (save.onboarding.step === 'done' && !save.kinlings.length) return 'Save says onboarding is complete but has no kinling.';
  const kinlingIds = new Set(save.kinlings.map((k) => k.id));
  if (kinlingIds.size !== save.kinlings.length) return 'Save lists the same kinling twice.';
  if (kinlingIds.has(PLAYER_ID)) return 'Save has a kinling with a reserved id.';
  if (save.kinlings.length ? !kinlingIds.has(save.activeKinlingId ?? '') : save.activeKinlingId !== null) return 'Save selects a kinling that does not exist.';
  const pairs = new Set<string>();
  for (const f of save.feelings) {
    if (!kinlingIds.has(f.from) || f.from === f.to || !(f.to === PLAYER_ID || kinlingIds.has(f.to))) return 'Save has a feeling about someone who does not exist.';
    if (f.to === PLAYER_ID && f.warmth < 0) return 'Save has a kinling with negative warmth toward the player.';
    const pair = `${f.from}>${f.to}`;
    if (pairs.has(pair)) return 'Save lists the same feeling twice.';
    pairs.add(pair);
  }
  const memoryIds = save.kinlings.flatMap((k) => k.memories.map((m) => m.id));
  if (new Set(memoryIds).size !== memoryIds.length) return 'Save lists the same memory twice.';
  const ids = save.inventory.keepsakes.map((k) => k.id);
  if (new Set(ids).size !== ids.length) return 'Save lists the same keepsake twice.';
  const unlocked = new Set(save.unlocks.traits);
  if (save.unlocks.owned.some((t) => !unlocked.has(t))) return 'Save owns a trait that was never unlocked.';
  for (const k of save.kinlings) {
    const worn = wornTraits(k.appearance).filter((t) => !t.startsWith('shape.'));
    const locked = worn.find((t) => !unlocked.has(t));
    if (locked) return `Save shows ${k.name || 'a kinling'} wearing a feature that was never unlocked (${locked}).`;
  }
  return null;
}
