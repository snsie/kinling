// High-level creature AI. Every function has an authored/offline fallback so
// the game is fully playable without a model. Player-initiated requests wait
// their turn for the single model; automatic reactions are skipped when it is
// busy. Model output only ever becomes display text or a *proposal* that game
// code validates.
import { offlineChatReply } from '../game/dialogue';
import { slotOf, type EvolutionRequest } from '../game/evolution';
import { parseAppearanceRequest } from '../game/requestParser';
import type { ProposedAction } from '../game/careProposals';
import { parseCareInstruction } from '../game/careProposals';
import { authoredDiary } from '../game/social';
import type { GameEvent, SaveData } from '../game/types';
import { ai, AiInterruptedError } from './engine';
import { careMessages, careSchema, chatMessages, cleanReply, diaryMessages, evolutionMessages, evolutionSchema, greetingMessages, reactionMessages, toneIsSafe } from './prompts';
import { mergeKeep, parseCareProposal, parseEvolutionProposal } from './proposals';

export interface TextResult {
  text: string;
  source: 'ai' | 'authored';
  interrupted?: boolean;
}

/** Fallbacks are silent for players; keep a trace in the console for debugging. */
function logFallback(where: string, err: unknown) {
  console.warn(`[kinling ai] ${where} fell back to authored text:`, err);
}

function usable(text: string): boolean {
  return text.length >= 2 && toneIsSafe(text);
}

/** Stream a reply to the player. Falls back to authored text on any problem. */
export async function chatReply(save: SaveData, playerText: string, now: number, onText?: (t: string) => void): Promise<TextResult> {
  const fallback = () => ({ text: offlineChatReply(save, playerText), source: 'authored' as const });
  if (!ai.isLoaded) return fallback();
  try {
    const raw = await ai.completeQueued({ messages: chatMessages(save, playerText, now), maxTokens: 80, temperature: 0.8, onText: (t) => onText?.(cleanReply(t)) });
    const text = cleanReply(raw);
    return usable(text) ? { text, source: 'ai' } : fallback();
  } catch (err) {
    if (err instanceof AiInterruptedError) {
      const text = cleanReply(err.partial);
      return text ? { text, source: 'ai', interrupted: true } : { text: '…', source: 'authored', interrupted: true };
    }
    logFallback('chat', err);
    return fallback();
  }
}

/** Optional short reaction to a completed action. Returns null when AI is unavailable or busy. */
export async function reactTo(save: SaveData, eventText: string, now: number, onText?: (t: string) => void): Promise<TextResult | null> {
  if (!ai.isReady || ai.isBusy) return null;
  try {
    const raw = await ai.complete({ messages: reactionMessages(save, eventText, now), maxTokens: 48, temperature: 0.85, onText: (t) => onText?.(cleanReply(t, 1)), timeoutMs: 20_000 });
    const text = cleanReply(raw, 1);
    return usable(text) ? { text, source: 'ai' } : null;
  } catch (err) {
    if (!(err instanceof AiInterruptedError)) logFallback('reaction', err);
    return null;
  }
}

export async function greet(save: SaveData, now: number, onText?: (t: string) => void): Promise<TextResult | null> {
  if (!ai.isReady || ai.isBusy) return null;
  try {
    const raw = await ai.complete({ messages: greetingMessages(save, now), maxTokens: 60, temperature: 0.85, onText: (t) => onText?.(cleanReply(t)), timeoutMs: 20_000 });
    const text = cleanReply(raw);
    return usable(text) ? { text, source: 'ai' } : null;
  } catch (err) {
    logFallback('greeting', err);
    return null;
  }
}

export async function writeDiary(save: SaveData, events: GameEvent[], onText?: (t: string) => void): Promise<TextResult> {
  const fallback = () => ({ text: authoredDiary(save, events), source: 'authored' as const });
  if (!ai.isLoaded) return fallback();
  try {
    const raw = await ai.completeQueued({ messages: diaryMessages(save, events), maxTokens: 120, temperature: 0.7, onText: (t) => onText?.(cleanReply(t, 3, 420)) });
    const text = cleanReply(raw, 3, 420);
    return usable(text) && text.length > 20 ? { text, source: 'ai' } : fallback();
  } catch (err) {
    logFallback('diary', err);
    return fallback();
  }
}

export interface AppearanceTranslation {
  request: EvolutionRequest;
  reply: string;
  source: 'ai' | 'offline';
  understood: string[];
  unsupported: string[];
  invalid: string[];
}

/**
 * Translate a natural-language look request into catalog ids. The offline
 * parser always runs too: its "keep" constraints are merged in, and it is the
 * answer whenever the model is unavailable or returns nothing usable.
 */
export async function translateAppearance(save: SaveData, text: string, mode: 'evolve' | 'create'): Promise<AppearanceTranslation> {
  const offline = parseAppearanceRequest(text);
  const offlineResult: AppearanceTranslation = { ...offline, reply: '', source: 'offline', invalid: [] };
  if (!ai.isLoaded) return offlineResult;
  try {
    const raw = await ai.completeQueued({ messages: evolutionMessages(save, text, mode), maxTokens: 200, temperature: 0.2, jsonSchema: evolutionSchema(), timeoutMs: 40_000 });
    const proposal = parseEvolutionProposal(raw);
    if (!proposal || (proposal.request.changes.length === 0 && offline.request.changes.length > 0)) return offlineResult;
    const explicit = offline.request.changes.map((ch) => slotOf(ch.trait));
    const keep = mergeKeep(proposal.request.keep, offline.request.keep, explicit);
    return {
      request: { ...proposal.request, keep, accentColor: offline.request.accentColor, markingColor: offline.request.markingColor },
      reply: toneIsSafe(proposal.reply) ? proposal.reply : '',
      source: 'ai',
      understood: offline.understood,
      unsupported: offline.unsupported,
      invalid: proposal.invalid,
    };
  } catch (err) {
    logFallback('appearance', err);
    return offlineResult;
  }
}

export interface CareTranslation {
  actions: ProposedAction[];
  reply: string;
  source: 'ai' | 'offline';
}

export async function translateCare(save: SaveData, text: string, now: number): Promise<CareTranslation> {
  const offline: CareTranslation = { actions: parseCareInstruction(text, save), reply: '', source: 'offline' };
  if (!ai.isLoaded) return offline;
  try {
    const raw = await ai.completeQueued({ messages: careMessages(save, text, now), maxTokens: 160, temperature: 0.3, jsonSchema: careSchema(), timeoutMs: 40_000 });
    const proposal = parseCareProposal(raw);
    if (!proposal) return offline;
    const actions = proposal.actions.length ? proposal.actions : offline.actions;
    return { actions, reply: toneIsSafe(proposal.reply) ? proposal.reply : '', source: 'ai' };
  } catch (err) {
    logFallback('care', err);
    return offline;
  }
}
