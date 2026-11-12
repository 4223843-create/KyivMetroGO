// Наскрізна перевірка зібраного застосунку в Chromium (npm run e2e після npm run build):
// відкрити → тап по станції → картка → service worker → офлайн-перезавантаження.
// Ловить поломки запуску й service worker, яких не бачать модульні тести.
import { chromium } from 'playwright';
import { spawn }    from 'node:child_process';
import assert       from 'node:assert/strict';

const PORT = 4174;
const URL  = `http://localhost:${PORT}/`;

// Сам vite, а не через npx: інакше kill() зупинив би лише npx, а сервер лишився б
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const stop   = () => { try { server.kill(); } catch { /* вже зупинено */ } };

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(URL)).ok) return; } catch { /* ще стартує */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('vite preview не запустився');
}

const step = msg => console.log(`✓ ${msg}`);

try {
  await waitForServer();
  const browser = await chromium.launch();
  const ctx  = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // Без першого знайомства (тур перекриває карту) — він має окремі модульні перевірки
  await page.addInitScript(() => localStorage.setItem('CapacitorStorage.metro_tour_done', '1'));

  await page.goto(URL);
  const zone = page.locator('[role="button"][aria-label="Станція Хрещатик"]').first();
  await zone.waitFor({ timeout: 20000 });
  step('карта з зонами станцій');

  await zone.click({ force: true });
  await page.waitForSelector('#stationSheet.sheet-open', { timeout: 5000 });
  assert.equal((await page.textContent('#stationTitleMain')).trim(), 'Хрещатик');
  assert.ok(await page.locator('#sheetBody .pos-pill').count() > 0, 'у картці немає вагонів і дверей');
  step('картка станції відкривається');

  await page.click('#stationSheet .fav-btn-bar');
  await page.waitForSelector('#stationSheet .fav-btn-bar.fav-active', { timeout: 3000 });
  assert.ok(await page.locator('#sheetBody .pos-pill').count() > 0, 'після ♥ картка порожня');
  await page.click('#stationSheet .fav-btn-bar');
  step('♥ у картці не ламає вміст');

  await page.keyboard.press('Escape');
  await page.waitForSelector('#stationSheet:not(.sheet-open)', { state: 'attached', timeout: 5000 });
  step('Escape закриває картку');

  await page.click('#menuBtn');
  await page.click('#settingsItem');
  await page.waitForSelector('#settingsSheet.sheet-open', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#settingsSheet:not(.sheet-open)', { state: 'attached', timeout: 5000 });
  step('меню відкриває налаштування');

  await page.click('#favListBtn');
  await page.waitForSelector('#favSheet.sheet-open', { timeout: 5000 });
  await page.click('#favClose');
  await page.waitForSelector('#favSheet:not(.sheet-open)', { state: 'attached', timeout: 5000 });
  step('«Вибране» відкривається і закривається');

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 })
    .catch(async () => { await page.reload(); });
  step('service worker встановлено');

  // Нова версія даних, поки шторок немає, — застосовується сама, без перезавантаження
  const fresh = await (await fetch(URL + 'stations.json')).json();
  fresh.version = String(Number(fresh.version) + 1);
  await ctx.route(/stations\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fresh) }));
  await page.evaluate(() => fetch('./stations.json'));
  const applied = await page.waitForSelector('.app-toast', { timeout: 8000 }).then(t => t.textContent());
  assert.match(applied, /Оновлено дані станцій/);
  await ctx.unroute(/stations\.json/);
  step('нові дані підхоплюються без перезавантаження');

  await ctx.setOffline(true);
  await page.reload();
  await page.locator('[role="button"][aria-label="Станція Хрещатик"]').first().waitFor({ timeout: 15000 });
  step('офлайн-перезавантаження показує карту');

  assert.equal(await page.locator('#offlineBanner').isVisible(), true, 'немає плашки «Офлайн»');
  step('плашка «Офлайн» на місці');

  assert.deepEqual(errors, [], `помилки на сторінці: ${errors.join('; ')}`);
  await browser.close();
  step('без помилок JS');
} finally {
  stop();
}
