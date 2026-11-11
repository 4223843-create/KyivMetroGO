// Відновлення з резервної копії: дані людини повертаються всі, службові
// частини файлу (лог розробника, роздільники) у сховище не потрапляють,
// а записане переживає «перезапуск» (нове читання сховища).
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

test('копія відновлює дані людини й замінює попередні', async () => {
  const { Storage, STORAGE_KEYS } = await import('../src/core/storage.js');
  await Storage.init();
  Storage.set(STORAGE_KEYS.FAVS, JSON.stringify(['R.Lisova']));
  Storage.set(STORAGE_KEYS.START_ON_FAV, 'true');
  await Storage.flush?.();

  const backup = {
    [STORAGE_KEYS.FAVS]:      JSON.stringify(['B.Teremky', 'G.Syrets']),
    [STORAGE_KEYS.CHECKINS]:  JSON.stringify({ 'R.Lisova|station': { slug: 'R.Lisova', station: true, ts: 1 } }),
    [STORAGE_KEYS.EXIT_FAVS]: JSON.stringify([{ id: 'R.Lisova|113-1', slug: 'R.Lisova', pos: '113-1' }]),
    '═══════': '══ ЛОГ ЗМІН — РЕЖИМ РОЗРОБНИКА ══',
    _dev_change_log: [{ станція: 'Лісова' }],
    чужий_ключ: 'x',
  };
  await Storage.restoreFromBackup(backup);

  assert.equal(Storage.get(STORAGE_KEYS.FAVS), backup[STORAGE_KEYS.FAVS]);
  assert.equal(Storage.get(STORAGE_KEYS.CHECKINS), backup[STORAGE_KEYS.CHECKINS]);
  assert.equal(Storage.get(STORAGE_KEYS.EXIT_FAVS), backup[STORAGE_KEYS.EXIT_FAVS]);
  assert.equal(Storage.get(STORAGE_KEYS.START_ON_FAV), null, 'чого немає в копії — скинуто');
  assert.equal(Storage.get('_dev_change_log'), null);
  assert.equal(Storage.get('чужий_ключ'), null);

  // «Перезапуск»: кеш у пам'яті заново з постійного сховища
  await Storage.init();
  assert.equal(Storage.get(STORAGE_KEYS.FAVS), backup[STORAGE_KEYS.FAVS]);
});
