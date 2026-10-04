// Fixed chat evaluation against the real on-device model. Use it to check
// whether a prompt change helped or hurt: it scores message routing, fact
// suggestions and chat replies, and writes every output for review.
//
//   npm run dev                      (in another terminal)
//   node scripts/eval-chat.mjs
//
// Env: BASE_URL (default http://localhost:5173/), MODEL (default Qwen3-1.7B-q4f16_1-MLC),
//      OUT (default eval-results), HEADLESS=1 to try headless.
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

  return { routing, facts, replies, notes: { text: notes.value?.text ?? null, ms: notes.ms } };
}, cases);

await ctx.close();

const score = (list) => `${list.filter((x) => x.ok).length}/${list.length}`;
console.log(`\nRouting  ${score(report.routing)}  (model consulted on ${report.routing.filter((r) => r.byModel).length})`);
for (const r of report.routing.filter((x) => !x.ok)) console.log(`  ✗ "${r.text}" → ${r.got} (expected ${r.expect})`);
console.log(`Facts    ${score(report.facts)}`);
for (const f of report.facts) console.log(`  ${f.ok ? '✓' : '✗'} "${f.text}" → ${f.got ? `"${f.got}"` : '(none)'}`);
console.log(`Replies  ${score(report.replies)}`);
for (const r of report.replies) console.log(`  ${r.ok ? '✓' : '✗'} "${r.text}" → "${r.reply}"${r.problems.length ? `  [${r.problems.join('; ')}]` : ''} (${(r.ms / 1000).toFixed(1)}s)`);
console.log(`Notes    ${report.notes.text ? `"${report.notes.text}"` : '(none)'}`);

const file = join(OUT, `eval-${MODEL}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify({ model: MODEL, ...report }, null, 2));
console.log(`\nFull results: ${file}`);
const failed = [report.routing, report.facts, report.replies].flat().filter((x) => !x.ok).length;
process.exit(failed ? 1 : 0);
