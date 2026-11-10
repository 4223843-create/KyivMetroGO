// Дані, які приходять ззовні (OpenStreetMap, міський ГІС), не повинні
// потрапити на екран як розмітка: там будь-хто може вписати HTML-тег.
// 1) у самих даних не має бути < і > (крім <br> у назвах зупинок), це ловиться ще до мерджу;
// 2) місця, що їх показують, екранують текст (якщо дані колись проскочать).
import { test } from 'node:test';
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

const read = name => JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8'));
const MARKUP = /[<>]/;
const EVIL   = '<img src=x onerror=alert(1)>';

/** Усі рядки всередині значення (рекурсивно), з шляхом для повідомлення. */
function* strings(value, path = '') {
  if (typeof value === 'string') yield [path, value];
  else if (Array.isArray(value)) for (let i = 0; i < value.length; i++) yield* strings(value[i], `${path}[${i}]`);
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) yield* strings(v, `${path}.${k}`);
}

test('адреси з ГІС і OSM без < і >', () => {
  for (const file of ['addresses.json', 'addresses-geo.json']) {
    for (const [path, s] of strings(read(file))) {
      assert.ok(!MARKUP.test(s), `${file}${path}: ${s}`);
    }
  }
});

test('зупинки й маршрути з ГІС у stations.json без < і > (крім <br>)', () => {
  for (const st of read('stations.json').stations) {
    const { stops, ground } = st.connections ?? {};
    for (const [path, s] of strings({ stops, ground })) {
      assert.ok(!MARKUP.test(s.replace(/<br\s*\/?>/gi, '')), `${st.slug}${path}: ${s}`);
    }
  }
});

test('картка станції екранує назви зупинок і номери маршрутів', async () => {
  const { renderExitRoutes } = await import('../src/sheets/renderStation.js');
  const stopHtml = renderExitRoutes({ connections: { stops: [
    { name: EVIL, exit: '1', distance_m: 20, routes: { bus: [EVIL] } },
  ] } }, '1');
  const groundHtml = renderExitRoutes({ connections: { ground: { 1: { bus: [EVIL] } } } }, '1');
  for (const html of [stopHtml, groundHtml]) {
    assert.ok(html.includes('&lt;img'), html);
    assert.ok(!html.includes('<img'), html);
  }
});

test('пошук за адресою екранує вулицю, район і номер будинку', async () => {
  const real = read('addresses.json');
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ schema: 2, exits: real.exits, streets: [[`вулиця Тестова ${EVIL}`, EVIL, `1${EVIL} 0 5`, '']] }),
  });
  const { addressResultsHtml } = await import('../src/features/addressSearch.js');
  await new Promise(resolve => addressResultsHtml('тестова', new Set(), resolve));
  for (const query of ['тестова', 'тестова 1']) {
    const html = addressResultsHtml(query, new Set());
    assert.ok(html.includes('Тестова'), `немає результату для «${query}»`);
    assert.ok(!html.includes('<img'), html);
  }
});

test('пересадки: назва вокзалу й підказка на тап екрануються', async () => {
  const { renderStationConnections } = await import('../src/sheets/renderStation.js');
  const html = renderStationConnections({ connections: { hubs: [{ kind: 'bus', name: EVIL, note: `"${EVIL}` }] } });
  assert.ok(!html.includes('<img'), html);
  assert.ok(html.includes('&lt;img'), html);
});

test('вагон і двері (зокрема з локальних правок) не стають розміткою', async () => {
  const { renderDirections } = await import('../src/sheets/renderStation.js');
  const s = { slug: 'x', name: 'X', positions: [], directions: [{ from: 'A', exits: [
    { label: 'Вихід', positions: [{ id: '1-1', wagon: EVIL, doors: `"><svg onload=alert(1)>` }] },
  ] }] };
  const html = renderDirections(s, '#e4181c');
  assert.ok(!html.includes('<img'), html);
  assert.ok(!html.includes('<svg onload'), html);
});

test('резервна копія з чужим текстом у вагоні чи дверях не імпортується', async () => {
  const { localEditsLookValid } = await import('../src/domain/backupShape.js');
  assert.equal(localEditsLookValid(undefined), true);
  assert.equal(localEditsLookValid(JSON.stringify({ lisova: { '1-1': { wagon: '2', doors: '1–3' } } })), true);
  assert.equal(localEditsLookValid({ lisova: { '1-2': { wagon: '4, 5', doors: '1-2', closed: true } } }), true);
  assert.equal(localEditsLookValid(JSON.stringify({ lisova: { '1-1': { wagon: EVIL, doors: '1' } } })), false);
  assert.equal(localEditsLookValid('{не json'), false);
});
