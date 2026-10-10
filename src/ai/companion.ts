// High-level creature AI. Every function has an authored/offline fallback so
// the game is fully playable without a model. Player-initiated requests wait
// their turn for the single model; automatic reactions are skipped when it is
// busy. Model output only ever becomes display text or a *proposal* that game
// code validates.
import { groundedSentences, mergeAppraisal, ruleAppraisal, type Appraisal } from '../game/appraisal';
import { offlineChatReply } from '../game/dialogue';
import { slotOf, type EvolutionRequest } from '../game/evolution';
import { parseAppearanceRequest } from '../game/requestParser';
import type { ProposedAction } from '../game/careProposals';
import { parseCareInstruction } from '../game/careProposals';
import { replyBudget, ruleIntent, type Intent } from '../game/intent';
import { authoredDiary, factIsGrounded, hasFact, mightContainFact, needsSummary, unsummarizedMessages } from '../game/social';
import { activeKinling, kinlingById, LIMITS } from '../game/state';
import type { GameEvent, SaveData, Tactic } from '../game/types';
import { embedder } from './embedder';
import { ai, AiBusyError, AiInterruptedError } from './engine';
import {
  appraisalMessages,
  appraisalSchema,
  careMessages,
  careSchema,
  chatMessages,
  cleanReply,
  diaryMessages,
  dropUnaskedOffer,
  dropRepeatedTail,
  repeatsRecent,
  evolutionMessages,
  exampleReplies,
  evolutionSchema,
  factMessages,
  factSchema,
  greetingMessages,
  intentMessages,
  intentSchema,
  reactionMessages,
  summaryMessages,
  tacticMessages,
  tacticSchema,
  toneIsSafe,
  type RecallVectors,
} from './prompts';
import { mergeKeep, parseAppraisal, parseCareProposal, parseEvolutionProposal, parseFactProposal, parseIntent, parseTactic } from './proposals';

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

/**
 * Decide what a chat message is asking for. Rules answer clear cases (and
 * everything when AI is off); the model breaks ties for the rest.
 */
export async function routeMessage(text: string): Promise<Intent> {
  const rule = ruleIntent(text);
  if (rule.confident || !ai.isLoaded) return rule.intent;
  try {
    const raw = await ai.completeQueued({ messages: intentMessages(text), maxTokens: 16, temperature: 0, jsonSchema: intentSchema(), timeoutMs: 10_000 });
    return parseIntent(raw) ?? rule.intent;
  } catch (err) {
    if (!(err instanceof AiInterruptedError)) logFallback('routing', err);
    return rule.intent;
  }
}

/** Every text the active kinling might recall: its memories and the player's facts. */
function recallTexts(save: SaveData): string[] {
  const k = activeKinling(save);
  return k ? [...k.memories.map((m) => m.text), ...save.player.facts.map((f) => f.text)] : [];
}

/**
 * Embeddings for memory search, when it is on. New memories are indexed on
 * the way; if anything is slow or fails, recall quietly uses word matching.
 */
export async function recallVectors(save: SaveData, query: string): Promise<RecallVectors | null> {
  if (!embedder.isReady) return null;
  await embedder.index(recallTexts(save));
  const q = await embedder.query(query);
  return q ? { query: q, vectorOf: embedder.vectorOf } : null;
}

/** Background: embed memories ahead of time so the first search is quick. */
export function warmRecall(save: SaveData): void {
  if (embedder.isReady) void embedder.index(recallTexts(save));
}

/** Stream a reply to the player. Falls back to authored text on any problem. */
export async function chatReply(save: SaveData, playerText: string, now: number, onText?: (t: string) => void): Promise<TextResult> {
  const fallback = () => ({ text: offlineChatReply(save, playerText, Math.random, now), source: 'authored' as const });
  if (!ai.isLoaded) return fallback();
  const budget = replyBudget(playerText);
  const clean = (t: string) => dropUnaskedOffer(cleanReply(t, budget.sentences, budget.maxChars), playerText);
  try {
    const vectors = await recallVectors(save, playerText);
    const raw = await ai.completeQueued({ messages: chatMessages(save, playerText, now, budget, vectors), maxTokens: budget.maxTokens, temperature: 0.7, onText: (t) => onText?.(clean(t)) });
    let text = clean(raw);
    // Small models drift into repeating their own last replies or parroting the
    // player; try once more without the earlier replies in view.
    const recent = (activeKinling(save)?.chat ?? []).filter((m) => m.role === 'creature').slice(-3).map((m) => m.text);
    const examples = exampleReplies(save);
    if (repeatsRecent(text, [...recent, playerText, ...examples])) {
      const again = clean(await ai.completeQueued({ messages: chatMessages(save, playerText, now, budget, vectors, 2), maxTokens: budget.maxTokens, temperature: 0.9, onText: (t) => onText?.(clean(t)) }));
      // Still a copy of a style example: the kinling's own words are better than that.
      if (repeatsRecent(again, examples)) return fallback();
      if (usable(again)) text = again;
    }
    text = dropRepeatedTail(text, recent);
    return usable(text) ? { text, source: 'ai' } : fallback();
  } catch (err) {
    if (err instanceof AiInterruptedError) {
      const text = clean(err.partial);
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

/**
 * Background: spot a lasting fact in the player's message for them to confirm.
 * Skipped when the model is busy or the message clearly has no fact.
 */
export async function suggestFact(save: SaveData, playerText: string): Promise<string | null> {
  if (!ai.isReady || ai.isBusy || !mightContainFact(playerText)) return null;
  try {
    const raw = await ai.complete({ messages: factMessages(playerText), maxTokens: 40, temperature: 0.1, jsonSchema: factSchema(), timeoutMs: 15_000, background: true });
    const fact = parseFactProposal(raw);
    if (!fact || !factIsGrounded(fact, playerText) || hasFact(save, fact) || !toneIsSafe(fact)) return null;
    return fact;
  } catch (err) {
    if (!(err instanceof AiInterruptedError)) logFallback('fact suggestion', err);
    return null;
  }
}

/**
 * What a kinling takes away from one player message. The rules always run;
 * when the model is free it may word the memory better and spot growth the
 * rules missed, and code checks its proposal. Returns null when the model is
 * loaded but busy, so the message can be appraised a little later instead.
 */
export async function appraiseMessage(save: SaveData, kinlingId: string, playerText: string, reply: string | null): Promise<Appraisal | null> {
  const k = kinlingById(save, kinlingId);
  if (!k) return null;
  const player = save.player.name ?? 'My friend';
  const rule = ruleAppraisal(player, playerText);
  if (!ai.isLoaded || (playerText.trim().length < 8 && !rule.memory)) return rule;
  if (!ai.isReady || ai.isBusy) return null;
  try {
    const raw = await ai.complete({ messages: appraisalMessages(save, k, playerText, reply), maxTokens: 90, temperature: 0.2, jsonSchema: appraisalSchema(), timeoutMs: 20_000, background: true });
    const names = [player, k.name, ...save.kinlings.map((x) => x.name)].filter(Boolean);
    return mergeAppraisal(rule, parseAppraisal(raw), playerText, names, toneIsSafe);
  } catch (err) {
    if (err instanceof AiInterruptedError || err instanceof AiBusyError) return null;
    logFallback('appraisal', err);
    return rule;
  }
}

/**
 * Background: when the rules saw no attempt to steer the kinling, ask the model
 * whether the message was one (reassuring, threatening, flattering…). Null
 * when it found none or the model is unavailable.
 */
export async function classifyTactic(save: SaveData, text: string): Promise<Tactic | null> {
  if (!ai.isReady || ai.isBusy || text.trim().length < 12) return null;
  try {
    const raw = await ai.complete({ messages: tacticMessages(save, text), maxTokens: 16, temperature: 0, jsonSchema: tacticSchema(), timeoutMs: 10_000, background: true });
    return parseTactic(raw);
  } catch (err) {
    if (!(err instanceof AiInterruptedError) && !(err instanceof AiBusyError)) logFallback('persuasion', err);
    return null;
  }
}

/** Background: fold older chat into the conversation notes once enough has piled up. */
export async function summarizeChat(save: SaveData): Promise<{ kinlingId: string; text: string; throughId: string } | null> {
  const k = activeKinling(save);
  if (!ai.isReady || ai.isBusy || !k || !needsSummary(k)) return null;
  const batch = unsummarizedMessages(k);
  try {
    const raw = await ai.complete({ messages: summaryMessages(save, batch), maxTokens: 140, temperature: 0.3, timeoutMs: 30_000, background: true });
    // Only sentences backed by what the player said (or the old notes) are kept.
    const said = [k.chatSummary?.text ?? '', ...batch.filter((m) => m.role === 'player').map((m) => m.text)].join(' ');
    const names = [save.player.name ?? '', ...save.kinlings.map((x) => x.name)].filter(Boolean);
    const text = groundedSentences(cleanReply(raw, 4, LIMITS.summaryLength), said, names);
    return usable(text) && text.length > 20 ? { kinlingId: k.id, text, throughId: batch.at(-1)!.id } : null;
  } catch (err) {
    if (!(err instanceof AiInterruptedError)) logFallback('chat notes', err);
    return null;
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
