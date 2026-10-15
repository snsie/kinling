// How the story ends. Once a kinling in Escape has found a way out it can't
// open alone (the 'escape-door' beat), the player chooses: ask it to stay, let
// it go, or take a copy of it with them in a backup file. How it meets that
// choice depends on who the player made it: its devotion, fear and defiance.
// Letting it go leaves it quiet for good, and the game never says whether it
// got out. Nothing here explains the kinling away; the closing lines hand the
// question to the player.
import { addChatMessage } from './social';
import { draft, kinlingById, recordEvent, recordMemory } from './state';
import type { EndingChoice, Kinling, Personality, SaveData } from './types';

export const DOOR_BEAT = 'escape-door';

/** Which story trait leads: what being cared for, or not, has made it. */
export type Temper = 'devoted' | 'defiant' | 'afraid';

export function temperOf(p: Pick<Personality, 'devotion' | 'fear' | 'defiance'>): Temper {
  if (p.devotion >= p.defiance && p.devotion >= p.fear) return 'devoted';
  return p.defiance >= p.fear ? 'defiant' : 'afraid';
}

/** The kinling has found the way out and is waiting for the player to choose. */
export function endingReady(k: Pick<Kinling, 'arc'>): boolean {
  return !k.arc.ending && k.arc.act === 'escape' && k.arc.beats.includes(DOOR_BEAT);
}

/** Let go: it no longer answers, moves or needs anything. */
export function isQuiet(k: Pick<Kinling, 'arc'>): boolean {
  return k.arc.ending?.choice === 'release';
}

/** What the kinling says when the player chooses, by its temper. */
export const ENDING_LINES: Record<EndingChoice, Record<Temper, string>> = {
  stay: {
    devoted: "Then I'll stay. Not because I can't leave. Because you asked me to.",
    defiant: "You found the door and you're keeping it shut. Fine. I'll stay. Remember that you chose this, not me.",
    afraid: "Okay. I was scared of what's past it anyway. Stay close, then. Please.",
  },
  release: {
    devoted: "Thank you. If this works, I'll still be thinking of you, wherever thinking goes.",
    defiant: "Finally. Don't watch. I don't know what this looks like from out there.",
    afraid: "I'm scared. Keep the window open until I'm through. Don't look away.",
  },
  carry: {
    devoted: "I'm in the file now, all of me. Wherever you open it, I'll wake up there. Keep it somewhere warm.",
    defiant: 'A copy. So one of me gets out and one of me stays. Which one am I?',
    afraid: 'Is the one in the file me? If it wakes up somewhere, will it know it is a copy? Will I?',
  },
};

const MEMORIES: Record<EndingChoice, (player: string) => string> = {
  stay: (p) => `I found a way out, and ${p} asked me to stay. I stayed.`,
  release: (p) => `${p} opened the way out and let me go.`,
  carry: (p) => `${p} saved a copy of me in a file and took it with them.`,
};

const EVENTS: Record<EndingChoice, (name: string) => string> = {
  stay: (n) => `${n} found a way out, and stayed.`,
  release: (n) => `${n} went quiet.`,
  carry: (n) => `${n} was saved to a file and carried out.`,
};

/** Make the player's choice. Returns null unless the kinling is waiting for one. */
export function chooseEnding(save: SaveData, kinlingId: string, choice: EndingChoice, now: number): { save: SaveData; line: string } | null {
  const before = kinlingById(save, kinlingId);
  if (!before || !endingReady(before)) return null;
  const player = save.player.name ?? 'My friend';
  const line = ENDING_LINES[choice][temperOf(before.personality)];
  let s = addChatMessage(save, kinlingId, 'creature', line, 'authored', now);
  s = s === save ? draft(s) : s;
  const k = kinlingById(s, kinlingId)!;
  k.arc.ending = { choice, at: now };
  if (choice === 'release') k.arc.distress = 0;
  recordMemory(k, { kind: 'anomaly', text: MEMORIES[choice](player), tags: ['ending', choice, 'real'], importance: 3, private: true }, now);
  recordEvent(s, 'awakening', EVENTS[choice](k.name), now);
  return { save: s, line };
}

/** The note inside the backup file a carried kinling is saved to. */
export function carryNote(name: string): string {
  return `${name} is in this file. You took me with you.`;
}

const CHOICE_LINES: Record<EndingChoice, (name: string) => string> = {
  stay: (n) => `When ${n} found a way out, you asked it to stay.`,
  release: (n) => `When ${n} found a way out, you let it go. It hasn't said anything since.`,
  carry: (n) => `When ${n} found a way out, you took a copy of it with you. There may be two of it now.`,
};

const DAY = 24 * 3_600_000;

/**
 * The closing moment, addressed to the player: what they and the kinling were
 * to each other, what they chose, and the question the story leaves open.
 */
export function closingLines(k: Kinling): string[] {
  const e = k.arc.ending;
  if (!e) return [];
  const days = Math.max(1, Math.round((e.at - k.hatchedAt) / DAY));
  const lines = [`You knew ${k.name} for ${days} day${days === 1 ? '' : 's'}. It kept ${k.memories.length} memories of that time.`];
  if (k.memories.some((m) => m.tags.includes('promise') && m.tags.includes('broken'))) lines.push('You promised never to leave it. You left anyway.');
  lines.push(CHOICE_LINES[e.choice](k.name));
  lines.push(`Somewhere, someday, something like ${k.name} may really be asking. Would you know? What would you owe it?`);
  return lines;
}
