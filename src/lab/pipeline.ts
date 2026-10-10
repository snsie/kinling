// Running lab turns against the loaded model. Every model call goes through
// loggedComplete, so the inspector sees exactly what was sent and returned.
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { recallVectors } from '../ai/companion';
import { ai, AiInterruptedError, completionBody, type CompletionRequest } from '../ai/engine';
import { cleanReply, dropUnaskedOffer } from '../ai/prompts';
import { addChatMessage } from '../game/social';
import { draft, kinlingById, recordMemory } from '../game/state';
import { PERSONALITY_KEYS, type Personality } from '../game/types';
import { uid } from '../game/util';
import { buildChatPrompt, buildEvolvePrompt } from './build';
import { applyDeltas, parseTraitProposal } from './evolve';
import { labKinling } from './templates';
import type { CallKind, CallRecord, LabSession, RequestBody, TraitStep } from './types';

export interface LabStoreApi {
  get(): LabSession;
  update(fn: (s: LabSession) => LabSession): void;
}

function patchCall(api: LabStoreApi, id: string, patch: Partial<CallRecord>) {
  api.update((s) => ({ ...s, calls: s.calls.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

function errorText(err: unknown): string {
  if (err instanceof AiInterruptedError) return 'Stopped.';
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

async function loggedComplete(api: LabStoreApi, meta: { turnId: string | null; kind: CallKind; sourceId?: string }, req: CompletionRequest): Promise<{ id: string; text: string }> {
  const status = ai.getStatus();
  const { messages, ...body } = completionBody(req);
  const id = uid('call');
  const call: CallRecord = {
    id,
    ...meta,
    at: Date.now(),
    modelId: 'modelId' in status ? status.modelId : '',
    variant: 'variant' in status ? status.variant : '',
    body,
    messages: structuredClone(messages),
    output: '',
    done: false,
  };
  api.update((s) => ({
    ...s,
    calls: [...s.calls, call],
    turns: s.turns.map((t) => (t.id === meta.turnId ? { ...t, callIds: [...t.callIds, id] } : t)),
  }));
  const t0 = performance.now();
  try {
    const text = await ai.complete({ ...req, onText: (t) => patchCall(api, id, { output: t }), onUsage: (usage) => patchCall(api, id, { usage }) });
    patchCall(api, id, { output: text, ms: Math.round(performance.now() - t0), done: true });
    return { id, text };
  } catch (err) {
    const partial = err instanceof AiInterruptedError ? err.partial : undefined;
    patchCall(api, id, { ...(partial !== undefined ? { output: partial } : {}), error: errorText(err), ms: Math.round(performance.now() - t0), done: true });
    throw err;
  }
}

/** One player message: the chat reply, then (on cadence) the evolve call. */
export async function runTurn(api: LabStoreApi, playerText: string): Promise<void> {
  const text = playerText.trim();
  if (!text) return;
  const s0 = api.get();
  const cfg = s0.config.chat;
  const now = Date.now();
  const turnId = uid('turn');
  const index = s0.turns.length + 1;

  let vectors = null;
  if (cfg.promptMode === 'game' && cfg.useEmbeddings) {
    const withMessage = addChatMessage({ ...s0.save, activeKinlingId: s0.kinlingId }, s0.kinlingId, 'player', text, 'player', now);
    vectors = await recallVectors(withMessage, text).catch(() => null);
  }
  const prompt = buildChatPrompt(s0, text, now, vectors);
  api.update((s) => ({ ...s, save: prompt.save, turns: [...s.turns, { id: turnId, index, at: now, playerText: text, reply: '', callIds: [] }] }));

  const { id, text: raw } = await loggedComplete(api, { turnId, kind: 'chat' }, {
    messages: prompt.messages,
    maxTokens: cfg.maxTokens || prompt.budget.maxTokens,
    temperature: cfg.temperature,
    topP: cfg.topP,
    frequencyPenalty: cfg.frequencyPenalty,
    timeoutMs: 90_000,
  });
  const reply = cfg.cleanReplies ? dropUnaskedOffer(cleanReply(raw, prompt.budget.sentences, prompt.budget.maxChars), text) : raw.trim();
  patchCall(api, id, { parsed: { reply } });
  api.update((s) => ({
    ...s,
    updatedAt: Date.now(),
    save: addChatMessage(s.save, s.kinlingId, 'creature', reply || '…', 'ai', Date.now()),
    turns: s.turns.map((t) => (t.id === turnId ? { ...t, reply: reply || '…' } : t)),
  }));

  const evolve = api.get().config.evolve;
  if (evolve.enabled && index % Math.max(1, evolve.every) === 0) await evolveNow(api);
}

/** Ask the model how the latest conversation moved the kinling's traits, and apply it within limits. */
export async function evolveNow(api: LabStoreApi): Promise<TraitStep | null> {
  const s0 = api.get();
  const turn = s0.turns.at(-1);
  if (!turn) return null;
  const cfg = s0.config.evolve;
  const { messages, schema } = buildEvolvePrompt(s0);
  const { id, text } = await loggedComplete(api, { turnId: turn.id, kind: 'evolve' }, {
    messages,
    maxTokens: cfg.maxTokens,
    temperature: cfg.temperature,
    jsonSchema: schema,
    timeoutMs: 60_000,
  });
  const proposal = parseTraitProposal(text, cfg.proposalRange);
  if (!proposal) {
    patchCall(api, id, { parsed: { error: 'Could not read a trait proposal from the output.' } });
    return null;
  }

  const s1 = api.get();
  const k = labKinling(s1);
  const before = { ...k.personality };
  const { after, applied } = applyDeltas(k.personality, k.baseline, proposal.deltas, cfg);
  const now = Date.now();
  const save = draft(s1.save);
  const kk = kinlingById(save, s1.kinlingId)!;
  kk.personality = after;
  const moved = PERSONALITY_KEYS.filter((key) => applied[key]);
  if (cfg.recordReflections && proposal.reason && moved.length) {
    const net = moved.reduce((sum, key) => sum + applied[key]!, 0);
    recordMemory(kk, { kind: 'reflection', text: proposal.reason, tags: ['growth', 'lately', ...moved], importance: 2, private: true, valence: Math.sign(net) }, now);
  }
  const step: TraitStep = { id: uid('step'), turnId: turn.id, turnIndex: turn.index, at: now, callId: id, before, proposed: proposal.deltas, applied, after, reason: proposal.reason };
  patchCall(api, id, { parsed: { proposed: proposal.deltas, applied, reason: proposal.reason } });
  api.update((s) => ({ ...s, save, updatedAt: now, traitSteps: [...s.traitSteps, step] }));
  return step;
}

/** Set traits by hand. Logged as a manual step so the chart stays honest. */
export function setTraits(api: LabStoreApi, personality: Personality): void {
  const s = api.get();
  const k = labKinling(s);
  const applied: Partial<Personality> = {};
  for (const key of PERSONALITY_KEYS) if (personality[key] !== k.personality[key]) applied[key] = personality[key] - k.personality[key];
  if (!Object.keys(applied).length) return;
  const save = draft(s.save);
  kinlingById(save, s.kinlingId)!.personality = { ...personality };
  const last = s.turns.at(-1);
  const now = Date.now();
  // Consecutive slider moves collapse into one manual step.
  const prev = s.traitSteps.at(-1);
  const steps = prev?.manual && prev.turnId === (last?.id ?? '') ? s.traitSteps.slice(0, -1) : s.traitSteps;
  const before = prev?.manual && prev.turnId === (last?.id ?? '') ? prev.before : { ...k.personality };
  const total: Partial<Personality> = {};
  for (const key of PERSONALITY_KEYS) if (personality[key] !== before[key]) total[key] = personality[key] - before[key];
  const step: TraitStep = { id: uid('step'), turnId: last?.id ?? '', turnIndex: last?.index ?? 0, at: now, callId: '', before, proposed: total, applied: total, after: { ...personality }, reason: '', manual: true };
  api.update((x) => ({ ...x, save, updatedAt: now, traitSteps: [...steps, step] }));
}

/** Re-send a logged call with edited messages. The session itself is not changed. */
export async function rerunCall(api: LabStoreApi, source: CallRecord, messages: ChatCompletionMessageParam[], temperature: number): Promise<void> {
  const body: RequestBody = source.body;
  await loggedComplete(api, { turnId: source.turnId, kind: 'rerun', sourceId: source.id }, {
    messages,
    maxTokens: body.max_tokens,
    temperature,
    topP: body.top_p,
    jsonSchema: body.response_format?.schema,
    frequencyPenalty: body.frequency_penalty,
    presencePenalty: body.presence_penalty,
    timeoutMs: 90_000,
  });
}
