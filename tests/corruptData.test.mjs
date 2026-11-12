// Зіпсовані чи «не того типу» дані у сховищі не валять запуск: читаються як порожні.
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

test('Вибране й чекіни не того типу читаються як порожні', async () => {
  const { Storage, STORAGE_KEYS } = await import('../src/core/storage.js');
  await Storage.init?.();
  Storage.set(STORAGE_KEYS.FAVS, JSON.stringify({ lisova: true }));
  Storage.set(STORAGE_KEYS.EXIT_FAVS, '"рядок"');
  Storage.set(STORAGE_KEYS.CHECKINS, JSON.stringify(['не', 'обʼєкт']));
  const favorites = await import('../src/domain/favorites.js');
  const checkin   = await import('../src/domain/checkin.js');
  assert.deepEqual(favorites.getFavs(), []);
  assert.deepEqual(favorites.getExitFavs(), []);
  assert.deepEqual(checkin.getCheckins(), {});
});

test('резервна копія з Вибраним не того типу відхиляється', async () => {
  const { userDataLooksValid } = await import('../src/domain/backupShape.js');
  const K = { FAVS: 'f', EXIT_FAVS: 'e', CHECKINS: 'c' };
  assert.equal(userDataLooksValid({}, K), true);
  assert.equal(userDataLooksValid({ f: '["lisova"]', e: '[]', c: '{}' }, K), true);
  assert.equal(userDataLooksValid({ f: '{"lisova":1}' }, K), false);
  assert.equal(userDataLooksValid({ c: '[]' }, K), false);
  assert.equal(userDataLooksValid({ e: 'зламаний json' }, K), false);
});
