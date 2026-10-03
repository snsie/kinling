// Offline (rule-based) translation of appearance requests into catalog ids.
// Used when local AI is unavailable, and as a cross-check for AI proposals.
import { COLORS } from './catalog';
import type { EvolutionChange, EvolutionRequest, KeepSlot } from './evolution';
import type { ColorId, TraitId } from './types';
import { COLOR_IDS } from './types';

export interface ParsedRequest {
  request: EvolutionRequest;
  /** Short notes of what was understood, for display. */
  understood: string[];
  /** Mentioned features kinlings cannot grow. */
  unsupported: string[];
}

const THEMES: Record<'aquatic' | 'woodland' | 'celestial', { words: RegExp; traits: TraitId[] }> = {
  aquatic: { words: /\b(aquatic|water(y)?|sea|ocean|oceanic|fishy|fish|swim(my|ming)?|marine|pond|river|aqua)\b/, traits: ['tail.paddle', 'feature.fins', 'color.lagoon'] },
  woodland: { words: /\b(woodland|forest|woodsy|leafy|earthy|nature|tree|sylvan|mossy)\b/, traits: ['ears.leaf', 'feature.horns', 'color.moss'] },
  celestial: { words: /\b(celestial|starry|stars?|cosmic|space|moon(lit)?|magical|mystical|galaxy|heavenly)\b/, traits: ['feature.glow', 'feature.wings', 'color.starlight'] },
};

const UNSUPPORTED: [RegExp, string][] = [
  [/\bscales?\b|\bscaly\b/, 'scales'],
  [/\bantlers?\b/, 'antlers (small horns are possible)'],
  [/\bclaws?\b/, 'claws'],
  [/\btentacles?\b/, 'tentacles'],
  [/\bbeak\b/, 'a beak'],
  [/\bmane\b/, 'a mane'],
  [/\bspikes?\b|\bspiky\b/, 'spikes'],
  [/\b(extra|more|six|four) legs\b/, 'extra legs'],
  [/\btrunk\b/, 'a trunk'],
  [/\bhooves|hoof\b/, 'hooves'],
  [/\bfeathers\b/, 'feathers (decorative wings are possible)'],
];

const NEGATION = String.raw`(?:no|without|remove|lose|drop|get rid of|take off|take away|less|not?)\s+(?:the\s+|its\s+|any\s+|my\s+|your\s+)?`;

function colorFromWords(text: string): { id: ColorId; index: number; word: string }[] {
  const found: { id: ColorId; index: number; word: string }[] = [];
  for (const id of COLOR_IDS) {
    for (const word of COLORS[id].words) {
      const re = new RegExp(`\\b${word}\\b`, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(text))) found.push({ id, index: m.index, word });
    }
  }
  // Prefer longer phrases ("light blue" over "blue") when they overlap.
  found.sort((a, b) => a.index - b.index || b.word.length - a.word.length);
  const result: typeof found = [];
  let lastEnd = -1;
  for (const f of found) {
    if (f.index < lastEnd) continue;
    result.push(f);
    lastEnd = f.index + f.word.length;
  }
  return result;
}

function splitKeep(text: string): { change: string; keep: string } {
  const keepRe = /\b(?:but\s+)?(?:keep(?:ing)?|don'?t change|do not change|leave|preserve|still have|stay(?:ing)?)\b/g;
  const m = keepRe.exec(text);
  if (!m) return { change: text, keep: '' };
  const after = text.slice(m.index + m[0].length);
  // The keep clause runs until a new instruction starts.
  const stop = /\b(?:and then|but make|and make|also make|then make|and give|but give|and add)\b|[.;!?]/.exec(after);
  const keep = stop ? after.slice(0, stop.index) : after;
  const rest = stop ? after.slice(stop.index) : '';
  return { change: text.slice(0, m.index) + ' ' + rest, keep };
}

function keepSlots(keep: string): KeepSlot[] {
  const slots = new Set<KeepSlot>();
  if (!keep.trim()) return [];
  if (/\b(fur|coat|colou?r)\b/.test(keep) || colorFromWords(keep).some((c) => !/\b(spots?|stripes?|belly)\b/.test(keep.slice(c.index, c.index + 30)))) slots.add('bodyColor');
  if (/\bears?\b/.test(keep)) slots.add('ears');
  if (/\btail\b/.test(keep)) slots.add('tail');
  if (/\b(spots?|stripes?|markings?|pattern)\b/.test(keep)) slots.add('pattern');
  if (/\bglow/.test(keep)) slots.add('glow');
  if (/\bhorns?\b/.test(keep)) slots.add('horns');
  if (/\bfins?\b/.test(keep)) slots.add('fins');
  if (/\bwings?\b/.test(keep)) slots.add('wings');
  if (/\b(shape|size|build|proportions?|figure)\b|\bbody\b(?!\s+colou?r)/.test(keep)) slots.add('proportions');
  if (/\b(belly|tummy|accent)\b/.test(keep)) slots.add('accentColor');
  if (/\beverything( else)?\b|\bthe rest\b/.test(keep)) {
    // "keep everything else" — handled by only applying explicit changes.
  }
  return [...slots];
}

export function parseAppearanceRequest(raw: string): ParsedRequest {
  const text = ` ${raw.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ')} `;
  const { change, keep } = splitKeep(text);
  const keepList = keepSlots(keep);
  const changes: EvolutionChange[] = [];
  const understood: string[] = [];
  const touched = new Set<string>();
  const add = (trait: TraitId, remove = false, note?: string) => {
    const slot = trait.split('.')[0] === 'feature' ? trait : trait.split('.')[0]!;
    if (touched.has(slot)) return;
    touched.add(slot);
    changes.push(remove ? { trait, remove: true } : { trait });
    if (note) understood.push(note);
  };
  let rest = change;

  // Removals of toggle features.
  for (const [word, trait] of [
    ['horns?', 'feature.horns'],
    ['fins?', 'feature.fins'],
    ['wings?', 'feature.wings'],
    ['glow(?:ing)?(?: markings)?', 'feature.glow'],
  ] as const) {
    const re = new RegExp(`\\b${NEGATION}${word}\\b`);
    if (re.test(rest)) {
      add(trait, true, `remove ${trait.split('.')[1]}`);
      rest = rest.replace(re, ' ');
    }
  }
  if (new RegExp(`\\b${NEGATION}(?:spots|stripes|markings|pattern)\\b|\\bplain\\b`).test(rest)) {
    add('pattern.none', false, 'no markings');
    rest = rest.replace(new RegExp(`\\b${NEGATION}(?:spots|stripes|markings|pattern)\\b|\\bplain\\b`), ' ');
  }

  // Explicit ears and tails.
  const EAR_WORDS = 'fluffy|fluffier|tufted|floppy|floppier|droopy|long|leaf|leafy|leaf-shaped|round|rounded|small round';
  // "fluffy ears", or noun first: "make its ears floppy"
  const ear = new RegExp(`\\b(${EAR_WORDS})\\s+ears?\\b`).exec(rest) ?? new RegExp(`\\bears?\\s+(?:\\w+\\s+){0,3}?(${EAR_WORDS})\\b`).exec(rest);
  if (ear) {
    const w = ear[1]!;
    const id: TraitId = /fluff|tuft/.test(w) ? 'ears.fluffy' : /flop|droop|long/.test(w) ? 'ears.floppy' : /leaf/.test(w) ? 'ears.leaf' : 'ears.rounded';
    add(id, false, `${id.split('.')[1]} ears`);
    rest = rest.replace(ear[0], ' ');
  }
  const TAIL_WORDS = 'paddle|paddle-like|flat|beaver|swimming|swim|curl(?:ed|y)?|curly|spiral|short|shorter|stubby|little|nub';
  const tail = new RegExp(`\\b(${TAIL_WORDS})\\s+tail\\b`).exec(rest) ?? new RegExp(`\\btail\\s+(?:\\w+\\s+){0,3}?(${TAIL_WORDS})\\b`).exec(rest);
  if (tail) {
    const w = tail[1]!;
    const id: TraitId = /paddle|flat|beaver|swim/.test(w) ? 'tail.paddle' : /curl|spiral/.test(w) ? 'tail.curled' : 'tail.short';
    add(id, false, `${id.split('.')[1]} tail`);
    rest = rest.replace(tail[0], ' ');
  }

  // Features.
  if (/\b(horns?|horned)\b/.test(rest)) add('feature.horns', false, 'small horns');
  if (/\b(fins?|finned)\b/.test(rest)) add('feature.fins', false, 'a back fin');
  if (/\b(wings?|winged)\b/.test(rest)) add('feature.wings', false, 'decorative wings');
  if (/\b(glow|glowing|glowy|shimmer|shimmery|luminous|sparkly)\b/.test(rest)) add('feature.glow', false, 'glowing markings');
  rest = rest.replace(/\b(small|tiny|little)\s+(horns?|wings?|fins?)\b/g, ' ');

  // Colors: marking, accent or body color depending on the nearby noun.
  const request: EvolutionRequest = { changes, keep: keepList };
  for (const col of colorFromWords(rest)) {
    const after = rest.slice(col.index + col.word.length, col.index + col.word.length + 18);
    if (/^\s*(spots?|stripes?|markings?|dots|pattern)/.test(after)) {
      if (!request.markingColor) {
        request.markingColor = col.id;
        understood.push(`${COLORS[col.id].name.toLowerCase()} markings`);
      }
      const pat = /^\s*(spots?|dots|stripes?)/.exec(after);
      if (pat) add(/stripe/.test(pat[1]!) ? 'pattern.stripes' : 'pattern.spots', false, /stripe/.test(pat[1]!) ? 'stripes' : 'spots');
    } else if (/^\s*(belly|tummy|paws|accents?|chest)/.test(after)) {
      if (!request.accentColor) {
        request.accentColor = col.id;
        understood.push(`${COLORS[col.id].name.toLowerCase()} belly`);
      }
    } else if (!touched.has('color')) {
      add(`color.${col.id}`, false, `${COLORS[col.id].name.toLowerCase()} fur`);
    }
  }
  if (!touched.has('pattern')) {
    if (/\b(spots|spotted|spotty|dots|dotted|freckles?|freckled)\b/.test(rest)) add('pattern.spots', false, 'spots');
    else if (/\b(stripes|striped|stripy)\b/.test(rest)) add('pattern.stripes', false, 'stripes');
  }

  // Body shape. "a little more aquatic" is about degree, not size.
  const shapeText = rest.replace(/\b(?:just\s+)?a\s+(?:little\s+|tiny\s+)?bit\b/g, ' ').replace(/\b(?:a\s+)?little\s+(?:more|less)\b/g, ' ');
  if (/\b(round|rounder|chubby|chubbier|plump|plumper|pudgy|fluffier body|bigger|chonky)\b/.test(shapeText)) add('shape.round', false, 'a rounder build');
  else if (/\b(petite|smaller|tiny|small|little|tinier)\b/.test(shapeText)) add('shape.petite', false, 'a petite build');
  else if (/\b(tall|taller|lanky|leggy|stretchier)\b/.test(shapeText)) add('shape.tall', false, 'a taller build');
  else if (/\b(balanced|normal shape|regular shape)\b/.test(shapeText)) add('shape.balanced', false, 'a balanced build');

  // Themes fill in anything not explicitly requested or kept.
  for (const [theme, def] of Object.entries(THEMES) as [keyof typeof THEMES, (typeof THEMES)[keyof typeof THEMES]][]) {
    if (!def.words.test(rest)) continue;
    understood.push(`more ${theme}`);
    for (const t of def.traits) {
      const slot = t.startsWith('feature.') ? t : t.split('.')[0]!;
      const keepSlot = (t.startsWith('color.') ? 'bodyColor' : t.startsWith('feature.') ? t.split('.')[1] : t.split('.')[0]) as KeepSlot;
      if (touched.has(slot) || keepList.includes(keepSlot)) continue;
      // Wings and fins cannot coexist; skip the second one quietly.
      if ((t === 'feature.wings' && touched.has('feature.fins')) || (t === 'feature.fins' && touched.has('feature.wings'))) continue;
      add(t);
    }
  }

  const unsupported = UNSUPPORTED.filter(([re]) => re.test(text)).map(([, label]) => label);
  return { request, understood, unsupported };
}
