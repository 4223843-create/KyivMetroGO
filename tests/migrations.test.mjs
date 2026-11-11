// Переведення збережених даних людини зі старих форматів на id позицій.
// Найдорожча помилка в застосунку — загублене Вибране, check-in чи правки,
// тому тут на реальному stations.json перевіряється, що після запуску
// старі записи знаходять свої позиції, а незіставлені лишаються як були.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.location ??= { search: '', hash: '', hostname: 'localhost', href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
const mem = new Map();
globalThis.localStorage ??= {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  key: i => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
  clear: () => mem.clear(),
};

const data = JSON.parse(readFileSync(new URL('../public/stations.json', import.meta.url), 'utf8'));
const SLUG = 'R.Sviatoshyn';
const raw  = data.stations.find(s => s.slug === SLUG);

/** Позиції станції в порядку обходу (так само їх нумерував застосунок до id). */
function positionsOf(station) {
  const out = [];
  for (const dir of station.directions ?? []) {
    (dir.exits ?? []).forEach((exit, exitIdx) => {
      (exit.positions ?? []).forEach((position, posInExit) =>
        out.push({ dir, exit, exitIdx, posInExit, position }));
    });
  }
  return out;
}
const all = positionsOf(raw);
const [p0, p1, p2] = all;

// Записи в старих форматах, як вони лежать на телефоні в людини
const OLD = {
  exitFavs: [
    { id: 'old-1', slug: SLUG, dir: p0.dir.from, wagon: p0.position.wagon, doors: p0.position.doors },
    { id: 'old-gone', slug: SLUG, dir: 'нема такого напрямку', wagon: '99', doors: '99' },
  ],
  checkins: {
    [`${SLUG}|${p1.dir.from}|${p1.position.wagon}|${p1.position.doors}`]:
      { slug: SLUG, dir: p1.dir.from, wagon: p1.position.wagon, doors: p1.position.doors, ts: 1700000000000 },
    'R.Nowhere|x|1|1': { slug: 'R.Nowhere', dir: 'x', wagon: '1', doors: '1', ts: 1 },
  },
  localEdits: {
    // 1) ключ — порядковий номер позиції; 2) ключ — «напрямок|id виходу|номер у виході»
    [SLUG]: {
      0: { wagon: '3', doors: '2' },
      [`${p2.dir.from}|${p2.exit.id}|${p2.posInExit}`]: { wagon: '5', doors: '4' },
    },
  },
  labels: { [SLUG]: { 1: 'мій вихід' } },
};

let mods;
before(async () => {
  const { Storage, STORAGE_KEYS } = await import('../src/core/storage.js');
  await Storage.init();
  Storage.set(STORAGE_KEYS.EXIT_FAVS,   JSON.stringify(OLD.exitFavs));
  Storage.set(STORAGE_KEYS.CHECKINS,    JSON.stringify(OLD.checkins));
  Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(OLD.localEdits));
  Storage.set(STORAGE_KEYS.EXIT_LABELS, JSON.stringify(OLD.labels));

  // Модулі, що переводять записи, підписуються на data:stations-hydrated при імпорті
  const favorites  = await import('../src/domain/favorites.js');
  const checkin    = await import('../src/domain/checkin.js');
  const localEdits = await import('../src/data/localEdits.js');
  const stations   = await import('../src/data/stations.js');
  const { state }  = await import('../src/core/state.js');
  stations.hydrateStations(structuredClone(data));
  mods = { Storage, STORAGE_KEYS, favorites, checkin, localEdits, state };
});

const stored = key => JSON.parse(mods.Storage.get(mods.STORAGE_KEYS[key]));

test('вибраний вихід старого формату отримує id позиції, незіставлений лишається', () => {
  const favs = stored('EXIT_FAVS');
  assert.equal(favs.length, 2, 'жоден запис не загубився');
  const migrated = favs.find(f => f.pos);
  assert.equal(migrated.pos, p0.position.id);
  assert.equal(migrated.id, `${SLUG}|${p0.position.id}`);
  assert.ok(mods.favorites.isExitFav(SLUG, p0.position.id));
  assert.ok(favs.some(f => f.id === 'old-gone' && !f.pos), 'незіставлений запис має лишитися');
});

test('check-in старого формату переходить на «slug|id», час зберігається', () => {
  const all = stored('CHECKINS');
  const key = `${SLUG}|${p1.position.id}`;
  assert.equal(all[key]?.pos, p1.position.id);
  assert.equal(all[key].ts, 1700000000000);
  assert.ok(all['R.Nowhere|x|1|1'], 'запис невідомої станції лишається як був');
  assert.equal(Object.keys(all).length, 2);
  assert.ok(mods.checkin.isCheckedIn(SLUG, p1.position.id));
});

test('локальні правки з номерних і старих шляхових ключів переходять на id', () => {
  const edits = stored('LOCAL_EDITS')[SLUG];
  assert.deepEqual(edits[p0.position.id], { wagon: '3', doors: '2' });
  assert.deepEqual(edits[p2.position.id], { wagon: '5', doors: '4' });
  assert.equal(Object.keys(edits).length, 2);
  // І вони реально накладені на дані, які бачить картка
  const view = positionsOf(mods.state.stationsData[SLUG]).find(x => x.position.id === p0.position.id);
  assert.equal(view.position.wagon, '3');
  assert.equal(view.position._edited, true);
});

test('підпис виходу з номерного ключа переходить на id', () => {
  const labels = stored('EXIT_LABELS')[SLUG];
  assert.deepEqual(labels, { [p1.position.id]: 'мій вихід' });
});

test('повторний запуск нічого не змінює (перехід ідемпотентний)', async () => {
  const before = ['EXIT_FAVS', 'CHECKINS', 'LOCAL_EDITS', 'EXIT_LABELS'].map(k => mods.Storage.get(mods.STORAGE_KEYS[k]));
  mods.localEdits.invalidateLocalEditsCache();
  mods.checkin.invalidateCheckinsCache();
  const stations = await import('../src/data/stations.js');
  stations.hydrateStations(structuredClone(data));
  const after = ['EXIT_FAVS', 'CHECKINS', 'LOCAL_EDITS', 'EXIT_LABELS'].map(k => mods.Storage.get(mods.STORAGE_KEYS[k]));
  assert.deepEqual(after, before);
});
