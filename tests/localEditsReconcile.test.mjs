// Локальна правка не перекриває оновлені дані назавжди: прийнята правка
// зникає мовчки, застаріла (дані змінились інакше) — зникає з повідомленням.
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

const data = JSON.parse(readFileSync(new URL('../public/stations.json', import.meta.url), 'utf8'));
const SLUG = 'R.Lisova';

test('правка: тримається, поки дані ті самі; зникає, коли дані її прийняли чи змінились', async () => {
  const { Storage, STORAGE_KEYS } = await import('../src/core/storage.js');
  await Storage.init?.();
  const { bus }        = await import('../src/core/eventBus.js');
  const localEdits     = await import('../src/data/localEdits.js');
  const stations       = await import('../src/data/stations.js');
  const { state }      = await import('../src/core/state.js');
  localEdits.initLocalEdits();
  const superseded = [];
  bus.on('local-edits:superseded', e => superseded.push(...e.stations));

  stations.hydrateStations(structuredClone(data));
  const pos0 = state.stationsData[SLUG].positions[0];
  const orig = String(pos0.wagon);
  const mine = orig === '5' ? '6' : '5';
  localEdits.saveLocalEdit(SLUG, 0, { wagon: mine, doors: pos0.doors });
  localEdits.applyLocalLayer();
  const key = state.stationsData[SLUG].positions[0]._key;
  const { traversePositions } = await import('../src/data/positions.js');
  const viewPos = () => {
    let found = null;
    traversePositions(state.stationsData[SLUG], ({ position }) => { if (position._key === key) found = position; });
    return found;
  };
  const stored = () => JSON.parse(Storage.get(STORAGE_KEYS.LOCAL_EDITS) || '{}')[SLUG]?.[key];
  assert.equal(stored().base.wagon, orig, 'правка памʼятає значення з даних');

  // Ті самі дані ще раз — правка лишається й діє
  stations.hydrateStations(structuredClone(data));
  assert.ok(stored());
  assert.equal(String(viewPos().wagon), mine);

  // Дані прийняли правку — правка зникає мовчки
  const traverse = traversePositions;
  const firstPos = d => {
    let found = null;
    traverse(d.stations.find(s => s.slug === SLUG), ({ posIdx, position }) => { if (posIdx === 0) found = position; });
    return found;
  };
  const accepted = structuredClone(data);
  const rawPos = firstPos(accepted);
  rawPos.wagon = mine;
  stations.hydrateStations(structuredClone(accepted));
  assert.equal(stored(), undefined, 'прийнята правка прибрана');
  assert.deepEqual(superseded, []);

  // Нова правка, а потім дані змінились інакше — правку прибрано з повідомленням
  stations.hydrateStations(structuredClone(data));
  localEdits.saveLocalEdit(SLUG, 0, { wagon: mine, doors: pos0.doors });
  const changed = structuredClone(data);
  firstPos(changed).wagon = '8';
  stations.hydrateStations(changed);
  assert.equal(stored(), undefined, 'застаріла правка прибрана');
  assert.deepEqual(superseded, [state.stationsData[SLUG].name]);
  assert.equal(String(viewPos().wagon), '8');
});
