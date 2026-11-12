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

test('відхилений Formspree лист (4xx) прибирається, 429/5xx лишається на потім', async () => {
  const { Storage, STORAGE_KEYS } = await import('../src/core/storage.js');
  const { queueStationEdit, flushFeedbackOutbox } = await import('../src/services/feedbackOutbox.js');
  const queued = () => JSON.parse(Storage.get(STORAGE_KEYS.FEEDBACK_OUTBOX) || '[]');

  let status = 429;
  globalThis.fetch = async () => ({ ok: false, status });
  queueStationEdit({ station: 'Нивки', changes: 'двері 1→2' });
  await flushFeedbackOutbox();
  assert.equal(queued().length, 1, '429 — лист чекає');

  status = 503;
  await flushFeedbackOutbox();
  assert.equal(queued().length, 1, '5xx — лист чекає');

  status = 403;
  await flushFeedbackOutbox();
  assert.equal(queued().length, 0, '403 — лист викинуто');
});

test('лист старший за 14 днів викидається без відправки', async () => {
  const { Storage, STORAGE_KEYS } = await import('../src/core/storage.js');
  const { flushFeedbackOutbox } = await import('../src/services/feedbackOutbox.js');
  const old = Date.now() - 15 * 24 * 60 * 60 * 1000;
  Storage.set(STORAGE_KEYS.FEEDBACK_OUTBOX, JSON.stringify([{ station: 'Дніпро', changes: 'x', at: old }]));
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { ok: true, status: 200 }; };
  await flushFeedbackOutbox();
  assert.equal(calls, 0);
  assert.equal(Storage.get(STORAGE_KEYS.FEEDBACK_OUTBOX), null);
});

test('пауза між спробами зростає: 1, 2, 4 хв… не більше години', async () => {
  const { retryDelay } = await import('../src/services/formPost.js');
  assert.deepEqual([1, 2, 3, 10].map(retryDelay), [60_000, 120_000, 240_000, 3_600_000]);
});
