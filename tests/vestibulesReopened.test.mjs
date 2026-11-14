// «Відкриті в себе» вестибюлі й станції: запис зникає, коли дані знімають закриття,
// щоб наступне закриття того самого вестибюля знову було видно.
import { test } from 'node:test';
import assert from 'node:assert/strict';

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

test('pruneReopened прибирає записи, чиї вестибюлі й станції вже не закриті', async () => {
  const { Storage, STORAGE_KEYS } = await import('../src/core/storage.js');
  const { pruneReopened, isVestibuleClosed, isStationClosed } = await import('../src/domain/vestibules.js');
  await Storage.init();
  Storage.set(STORAGE_KEYS.VESTIBULES_REOPENED, JSON.stringify(['A|1', 'A|2', 'B|*', 'C|*', 'Gone|1']));

  const data = {
    A: { slug: 'A', exits_catalog: { 1: { vestibule_closed: true }, 2: {} } },
    B: { slug: 'B', temporarily_closed: true, exits_catalog: {} },
    C: { slug: 'C', exits_catalog: {} },
  };
  pruneReopened(data);
  assert.deepEqual(JSON.parse(Storage.get(STORAGE_KEYS.VESTIBULES_REOPENED)), ['A|1', 'B|*']);

  // Вестибюль 2 закрили знову — тепер це видно
  data.A.exits_catalog[2].vestibule_closed = true;
  assert.equal(isVestibuleClosed('A', { id: '2', vestibule_closed: true }), true);
  assert.equal(isVestibuleClosed('A', { id: '1', vestibule_closed: true }), false);
  assert.equal(isStationClosed(data.B), false);

  // Порожні дані (ще не завантажено) нічого не чіпають
  pruneReopened({});
  assert.equal(JSON.parse(Storage.get(STORAGE_KEYS.VESTIBULES_REOPENED)).length, 2);
});
