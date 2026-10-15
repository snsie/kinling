// Prompt construction for each lab call. Pure: given a session, the messages
// that would be sent. The pipeline adds the model and the logging.
import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import { modelName } from '../ai/models';
import { chatMessages, type RecallVectors } from '../ai/prompts';
import { arcChat } from '../game/arc';
import { replyBudget, type ReplyBudget } from '../game/intent';
import { addChatMessage } from '../game/social';
import type { ModelId, SaveData } from '../game/types';
import { messageText } from './chatml';
import { evolveSchema } from './evolve';
import { labKinling, renderTemplate, templateVars } from './templates';
import type { LabSession } from './types';

export interface ChatPrompt {
  messages: ChatCompletionMessageParam[];
  budget: ReplyBudget;
  /** The save with the player's message added, as the game would hold it. */
  save: SaveData;
}

/**
 * The chat call for a player message. `modelId` is the model the lab has
 * loaded: the prompt names it the way the game names its own model.
 */
export function buildChatPrompt(session: LabSession, playerText: string, now: number, vectors?: RecallVectors | null, modelId?: ModelId | null): ChatPrompt {
  const cfg = session.config.chat;
  const budget = replyBudget(playerText);
  const before = labKinling(session).chat;
  const settings = modelId ? { ...session.save.settings, ai: { ...session.save.settings.ai, enabled: true, modelId } } : session.save.settings;
  let save = addChatMessage({ ...session.save, activeKinlingId: session.kinlingId, settings }, session.kinlingId, 'player', playerText, 'player', now);
  if (session.config.story.rules) save = arcChat(save, session.kinlingId, playerText, now);
  if (cfg.promptMode === 'game') return { messages: chatMessages(save, playerText, now, budget, vectors), budget, save };

  const system = renderTemplate(cfg.systemTemplate, templateVars({ ...session, save }, modelId ? modelName(modelId) : null));
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of cfg.historyMessages > 0 ? before.slice(-cfg.historyMessages) : []) {
    const role = m.role === 'player' ? 'user' : 'assistant';
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${m.text}`;
    else turns.push({ role, content: m.text });
  }
  while (turns.length && turns[0]!.role !== 'user') turns.shift();
  return { messages: [{ role: 'system', content: system }, ...turns, { role: 'user', content: playerText }], budget, save };
}

export function buildEvolvePrompt(session: LabSession): { messages: ChatCompletionMessageParam[]; schema: string } {
  const cfg = session.config.evolve;
  const vars = templateVars(session);
  return {
    messages: [
      { role: 'system', content: renderTemplate(cfg.systemTemplate, vars) },
      { role: 'user', content: renderTemplate(cfg.userTemplate, vars) },
    ],
    schema: evolveSchema(cfg.proposalRange),
  };
}

/** The system prompt of a chat call, for turn-to-turn diffs. */
export function systemText(messages: ChatCompletionMessageParam[]): string {
  const sys = messages.find((m) => m.role === 'system');
  return sys ? messageText(sys) : '';
}
