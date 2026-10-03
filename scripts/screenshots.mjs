// Captures README screenshots from a running preview server.
// Usage: node scripts/screenshots.mjs <exported-save.json>
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/';
const OUT = 'docs/screenshots';
const save = JSON.parse(readFileSync(process.argv[2], 'utf8')).save;

async function inject(page, data) {
  await page.goto(BASE);
  await page.waitForTimeout(600);
  await page.evaluate(async (d) => {
    await new Promise((res, rej) => {
      const r = indexedDB.open('kinling');
      r.onsuccess = () => {
        const db = r.result;
        const tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put({ key: 'main', revision: 9999, updatedAt: Date.now(), data: { ...d, revision: 9999, lastTickAt: Date.now() } });
        tx.oncomplete = () => (db.close(), res());
        tx.onerror = () => rej(tx.error);
      };
    });
  }, data);
  await page.reload();
}

const browser = await chromium.launch();
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await page.goto(BASE);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/eggs.png` });
  await page.getByRole('button', { name: /Celestial Egg/ }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/customize.png` });
  await page.close();
}
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
  await inject(page, save);
  await page.getByRole('tablist', { name: 'Activities' }).waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/home.png` });
  await page.getByRole('tab', { name: /Explore/ }).click();
  await page.getByRole('button', { name: 'Go to the Garden Path' }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.down(['ArrowUp', 'ArrowLeft', 'ArrowRight'][i % 3]);
    await page.waitForTimeout(350);
    await page.keyboard.up(['ArrowUp', 'ArrowLeft', 'ArrowRight'][i % 3]);
  }
  await page.screenshot({ path: `${OUT}/garden-minigame.png` });
  await page.close();
}
{
  const mod = structuredClone(save);
  mod.creature.affinities.aquatic = 26;
  mod.stats.pondTrips = Math.max(1, mod.stats.pondTrips);
  mod.inventory.materials.reed = 8;
  mod.inventory.materials.shell = 8;
  if (!mod.unlocks.traits.includes('tail.paddle')) mod.unlocks.traits.push('tail.paddle');
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await inject(page, mod);
  await page.getByRole('tab', { name: /Evolve/ }).click();
  await page.getByLabel('Describe a change').fill('Make it more aquatic, but keep its pink fur and floppy ears');
  await page.getByRole('button', { name: 'Suggest' }).click();
  await page.getByText(/Ready to adopt|Not possible/).first().waitFor();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/evolve.png` });
  await page.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await inject(page, save);
  await page.getByRole('tablist', { name: 'Activities' }).waitFor();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/mobile.png` });
  await ctx.close();
}
await browser.close();
console.log('screenshots written to', OUT);
