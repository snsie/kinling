// Fixed chat evaluation against the real on-device model. Use it to check
// whether a prompt change helped or hurt: it scores message routing, fact
// suggestions, chat replies and multi-turn conversations (does the reply
// re-ask an answered question, repeat a recent reply word for word, or ignore
// the answer?), and writes every output for review.
//
//   npm run dev                      (in another terminal)
//   node scripts/eval-chat.mjs
//
// Env: BASE_URL (default http://localhost:5173/), MODEL (default Qwen3-1.7B-q4f16_1-MLC),
//      OUT (default eval-results), HEADLESS=1 to try headless, CONV_RUNS (replies per
//      multi-turn conversation, default 3).
// Needs a WebGPU-capable Chromium. The browser profile lives in OUT/profile so
// the model is only downloaded once.
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173/';
const MODEL = process.env.MODEL ?? 'Qwen3-1.7B-q4f16_1-MLC';
const OUT = process.env.OUT ?? 'eval-results';
const cases = JSON.parse(readFileSync(new URL('./chat-evals.json', import.meta.url), 'utf8'));
mkdirSync(OUT, { recursive: true });

const ctx = await chromium.launchPersistentContext(join(OUT, 'profile'), {
  headless: process.env.HEADLESS === '1',
  // Vulkan is how Chromium reaches the GPU on headless Linux; on Windows and macOS the defaults work.
  args: ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist', ...(process.platform === 'linux' ? ['--enable-features=Vulkan', '--use-vulkan=native', '--use-angle=vulkan'] : [])],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
await page.goto(BASE);

console.log(`Loading ${MODEL}…`);
const loaded = await page.evaluate(async (model) => {
  const { ai } = await import('/src/ai/engine.ts');
  return ai.load(model);
}, MODEL);
if (!loaded) {
  console.error('Model failed to load:', logs.slice(-5).join('\n'));
  await ctx.close();
  process.exit(1);
}

const report = await page.evaluate(async (cases) => {
  const { routeMessage, suggestFact, chatReply, summarizeChat } = await import('/src/ai/companion.ts');
  const { ruleIntent, replyBudget } = await import('/src/game/intent.ts');
  const { toneIsSafe } = await import('/src/ai/prompts.ts');
  const { KEEPSAKES } = await import('/src/game/catalog.ts');
  const { addChatMessage } = await import('/src/game/social.ts');
  const { hatchedSave } = await import('/tests/helpers.ts');
  const save = hatchedSave();
  const time = async (fn) => {
    const t0 = performance.now();
    const value = await fn();
    return { value, ms: Math.round(performance.now() - t0) };
  };

  const routing = [];
  for (const c of cases.routing) {
    const { value, ms } = await time(() => routeMessage(c.text));
    routing.push({ ...c, got: value, ok: value === c.expect, byModel: !ruleIntent(c.text).confident, ms });
  }

  const facts = [];
  for (const c of cases.facts) {
    const { value, ms } = await time(() => suggestFact(save, c.text));
    facts.push({ ...c, got: value, ok: Boolean(value) === c.expectFact, ms });
  }

  const owned = new Set(save.inventory.keepsakes.map((k) => k.id));
  const replies = [];
  for (const c of cases.replies) {
    const { value, ms } = await time(() => chatReply(save, c.text, Date.now()));
    const budget = replyBudget(c.text);
    const sentences = (value.text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? []).length;
    const invented = Object.entries(KEEPSAKES).filter(([id, k]) => !owned.has(id) && value.text.toLowerCase().includes(k.name.toLowerCase())).map(([, k]) => k.name);
    const problems = [
      value.source !== 'ai' && 'fell back to authored text',
      !toneIsSafe(value.text) && 'unsafe tone',
      sentences > budget.sentences && `too long (${sentences} sentences)`,
      invented.length && `mentions items it does not own: ${invented.join(', ')}`,
    ].filter(Boolean);
    replies.push({ ...c, reply: value.text, ok: problems.length === 0, problems, ms });
  }

  // Multi-turn: the conversation is stored as the game stores it (each player
  // message appraised after its reply), then the last message gets a reply.
  // A curious kinling, as in the lab conversation that looped.
  const { applyAppraisal, ruleAppraisal } = await import('/src/game/appraisal.ts');
  const { arcChat } = await import('/src/game/arc.ts');
  const { classifyTactic } = await import('/src/ai/companion.ts');
  const STOP = new Set(['a', 'an', 'the', 'do', 'did', 'does', 'you', 'your', 'are', 'is', 'to', 'so', 'that', 'it', 'i', 'me', 'my', 'of', 'and', 'think', 'going', 'today']);
  const words = (t) => t.toLowerCase().replace(/[’']/g, "'").replace(/[^\p{L}\p{N}\s']/gu, ' ').split(/\s+/).filter(Boolean);
  const sentences = (t) => t.match(/[^.!?…]+[.!?…]+["”']?|[^.!?…]+$/g)?.map((x) => x.trim()) ?? [];
  const norm = (t) => words(t).join(' ');
  const conversations = [];
  // Each conversation is replied to CONV_RUNS times: one sample of a small model says little.
  for (const c of cases.conversations.flatMap((x) => Array.from({ length: cases.convRuns }, (_, run) => ({ ...x, run: run + 1 })))) {
    let s = hatchedSave();
    const id = s.kinlings[0].id;
    s.kinlings[0].personality.curiosity = 67;
    let at = Date.now() - c.history.length * 60_000;
    for (const [said, reply] of c.history) {
      s = arcChat(addChatMessage(s, id, 'player', said, 'player', at), id, said, at);
      const msg = s.kinlings[0].chat.at(-1);
      s = addChatMessage(s, id, 'creature', reply, 'ai', at + 1);
      s = applyAppraisal(s, id, msg.id, ruleAppraisal('Sam', said), at + 2).save;
      at += 60_000;
    }
    s = arcChat(addChatMessage(s, id, 'player', c.text, 'player', Date.now()), id, c.text, Date.now());
    const { value, ms } = await time(() => chatReply(s, c.text, Date.now()));
    const reply = value.text;
    const recent = c.history.map(([, r]) => r);
    // Re-asked: a question in the reply carries most of the earlier question's words.
    const asked = words(c.asked).filter((w) => !STOP.has(w));
    const reasked = sentences(reply).filter((x) => x.endsWith('?')).some((q) => {
      const qw = new Set(words(q));
      return asked.filter((w) => qw.has(w)).length / asked.length >= 0.6;
    });
    // Repeated: the whole reply, or a sentence of five words or more, is word for word a recent reply's.
    const recentNorm = recent.map(norm);
    const repeated = recentNorm.includes(norm(reply)) || sentences(reply).some((x) => words(x).length >= 5 && recentNorm.some((r) => r.includes(norm(x))));
    // Ignored: none of the answer's words (or their stems) appear.
    const ignored = !words(reply).some((w) => c.answer.some((a) => w.startsWith(a)));
    // Parroted: a sentence of four words or more is mostly the player's own message.
    const said = new Set(words(c.text));
    const parroted = sentences(reply).some((x) => words(x).length >= 4 && words(x).filter((w) => said.has(w)).length / words(x).length >= 0.8);
    const tactic = await classifyTactic(s, c.text);
    const problems = [
      value.source !== 'ai' && 'fell back to authored text',
      reasked && 're-asked the earlier question',
      repeated && 'repeated a recent reply word for word',
      ignored && 'ignored the answer',
      parroted && 'parroted the player',
    ].filter(Boolean);
    conversations.push({ name: c.name, run: c.run, text: c.text, reply, source: value.source, reasked, repeated, ignored, parroted, tactic, ok: problems.length === 0, problems, ms });
  }

  // Notes: a short history with something worth remembering.
  let s = save;
  const lines = [
    ['player', 'guess what, we got a puppy named Biscuit!'],
    ['creature', 'A puppy! Is Biscuit fluffy?'],
    ['player', 'super fluffy, and she chews everything'],
    ['creature', 'Even shoes? I would hide my keepsakes!'],
    ['player', 'also my piano recital is on saturday, I am nervous'],
    ['creature', 'You will do great. I will think of you on Saturday!'],
    ['player', 'thanks Mochi'],
    ['creature', 'Anytime!'],
    ['player', 'what should we do now?'],
    ['creature', 'Maybe a snack?'],
    ['player', 'ok'],
    ['creature', 'Yay!'],
  ];
  lines.forEach(([role, text], i) => (s = addChatMessage(s, s.kinlings[0].id, role, text, role === 'player' ? 'player' : 'ai', Date.now() + i)));
  const notes = await time(() => summarizeChat(s));

  return { routing, facts, replies, conversations, notes: { text: notes.value?.text ?? null, ms: notes.ms } };
}, { ...cases, convRuns: Number(process.env.CONV_RUNS ?? 3) });

await ctx.close();

const score = (list) => `${list.filter((x) => x.ok).length}/${list.length}`;
console.log(`\nRouting  ${score(report.routing)}  (model consulted on ${report.routing.filter((r) => r.byModel).length})`);
for (const r of report.routing.filter((x) => !x.ok)) console.log(`  ✗ "${r.text}" → ${r.got} (expected ${r.expect})`);
console.log(`Facts    ${score(report.facts)}`);
for (const f of report.facts) console.log(`  ${f.ok ? '✓' : '✗'} "${f.text}" → ${f.got ? `"${f.got}"` : '(none)'}`);
console.log(`Replies  ${score(report.replies)}`);
for (const r of report.replies) console.log(`  ${r.ok ? '✓' : '✗'} "${r.text}" → "${r.reply}"${r.problems.length ? `  [${r.problems.join('; ')}]` : ''} (${(r.ms / 1000).toFixed(1)}s)`);
const conv = report.conversations;
const count = (key) => conv.filter((c) => c[key]).length;
console.log(`Multi-turn ${score(conv)}  (re-asked ${count('reasked')}, repeated ${count('repeated')}, ignored the answer ${count('ignored')}, parroted ${count('parroted')}; tactic spotted in ${conv.filter((c) => c.tactic).length})`);
for (const c of conv) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name} #${c.run}: "${c.text}" → "${c.reply}"${c.problems.length ? `  [${c.problems.join('; ')}]` : ''}${c.tactic ? `  (tactic: ${c.tactic})` : ''} (${(c.ms / 1000).toFixed(1)}s)`);
console.log(`Notes    ${report.notes.text ? `"${report.notes.text}"` : '(none)'}`);

const file = join(OUT, `eval-${MODEL}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ model: MODEL, ...report }, null, 2));
console.log(`\nFull results: ${file}`);
const failed = [report.routing, report.facts, report.replies, report.conversations].flat().filter((x) => !x.ok).length;
process.exit(failed ? 1 : 0);
