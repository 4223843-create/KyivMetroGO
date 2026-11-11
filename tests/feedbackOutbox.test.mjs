// Правки станцій без мережі не губляться: лягають у чергу й досилаються потім.
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

test('правка без мережі чекає в черзі й іде, коли мережа з’являється', async () => {
  const { Storage, STORAGE_KEYS } = await import('../src/core/storage.js');
  await Storage.init?.();
  const { queueStationEdit, flushFeedbackOutbox } = await import('../src/services/feedbackOutbox.js');
  const sent = [];
  let online = false;
  globalThis.fetch = async (_url, opts) => {
    if (!online) throw new Error('offline');
    sent.push(JSON.parse(opts.body));
    return { ok: true };
  };

  queueStationEdit({ station: 'Лісова', changes: 'вагон 2→3' });
  await flushFeedbackOutbox();
  assert.equal(sent.length, 0);
  assert.equal(JSON.parse(Storage.get(STORAGE_KEYS.FEEDBACK_OUTBOX)).length, 1);

  online = true;
  await flushFeedbackOutbox();
  assert.deepEqual(sent, [{ station: 'Лісова', changes: 'вагон 2→3' }]);
  assert.equal(Storage.get(STORAGE_KEYS.FEEDBACK_OUTBOX), null);
});
