import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeKeyedMap, purgeTombstones, mergeConfirmations, mergeBacklog,
  mergeStationNotes, deriveVerifiedFromConfirmations, emptyConfirmationData,
  mergePhotoTombstones, purgePhotoTombstones, applyCloudVerifiedIntoConfirmations,
} from '../src/domain/devMerge.js';

test('mergeKeyedMap: новіший запис перемагає, рівний — локальний', () => {
  const local = { s: { a: { v: 'L', t: 5 }, b: { v: 'L', t: 1 }, c: { v: 'L', t: 3 } } };
  const cloud = { s: { a: { v: 'C', t: 4 }, b: { v: 'C', t: 2 }, c: { v: 'C', t: 3 } } };
  assert.deepEqual(mergeKeyedMap(local, cloud), {
    s: { a: { v: 'L', t: 5 }, b: { v: 'C', t: 2 }, c: { v: 'L', t: 3 } },
  });
});

test('mergeKeyedMap: свіже видалення не скасовується старим значенням', () => {
  const local = { s: { a: { v: '', t: 10, d: true } } };
  const cloud = { s: { a: { v: 'стара нотатка', t: 5 } } };
  assert.deepEqual(mergeKeyedMap(local, cloud).s.a, { v: '', t: 10, d: true });
});

test('mergeKeyedMap: голий рядок старого формату програє будь-якому новому запису', () => {
  const merged = mergeKeyedMap({ s: { a: 'старий' } }, { s: { a: { v: 'новий', t: 1 } } });
  assert.deepEqual(merged.s.a, { v: 'новий', t: 1 });
  assert.deepEqual(mergeKeyedMap({ s: { a: 'лише локально' } }, {}).s.a, { v: 'лише локально', t: 0 });
});

test('purgeTombstones прибирає лише старі видалення', () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const map = { s: { old: { d: true, t: now - 400 * day }, fresh: { d: true, t: now - day }, note: { v: 'x', t: 1 } } };
  assert.deepEqual(Object.keys(purgeTombstones(map).s).sort(), ['fresh', 'note']);
  assert.deepEqual(purgeTombstones({ s: { old: { d: true, t: 0 } } }), {});
});

test('mergeConfirmations: перемагає запис з новішою дією, а не максимум', () => {
  const local = { s: { k: { finalConfirmed: false, confirmCount: 2, disputeCount: 0, corrections: { '1/2': 1 }, updatedAt: 30 } } };
  const cloud = { s: { k: { finalConfirmed: true, confirmCount: 3, disputeCount: 0, corrections: {}, updatedAt: 20 } } };
  assert.deepEqual(mergeConfirmations(local, cloud).s.k, local.s.k);
  assert.deepEqual(mergeConfirmations(cloud, local).s.k, local.s.k);
});

test('mergeConfirmations: свіже локальне скидання перемагає старі хмарні лічильники', () => {
  const local = { s: { k: { ...emptyConfirmationData(), resetAt: 30, updatedAt: 0 } } };
  const cloud = { s: { k: { finalConfirmed: true, confirmCount: 5, disputeCount: 0, corrections: {}, updatedAt: 20 } } };
  const m = mergeConfirmations(local, cloud).s.k;
  assert.equal(m.finalConfirmed, false);
  assert.equal(m.confirmCount, 0);
});

test('deriveVerifiedFromConfirmations бере лише finalConfirmed', () => {
  assert.deepEqual(deriveVerifiedFromConfirmations({
    s: { a: { finalConfirmed: true }, b: { finalConfirmed: false } },
  }), { s: { a: true } });
});

test('mergeBacklog: текст цілком, без склеювання й дублікатів', () => {
  const v = (v, t = 0) => ({ v, t });
  assert.deepEqual(mergeBacklog(v(''), v(''), ''), v(''));
  assert.deepEqual(mergeBacklog(v('a', 1), v(''), ''), v('a', 1));
  assert.deepEqual(mergeBacklog(v(''), v('a', 1), ''), v('a', 1));
  assert.deepEqual(mergeBacklog(v('a'), v('a\nc', 5), 'a'), v('a\nc', 5));      // змінилась лише хмара
  // видалення на іншому пристрої доходить сюди
  assert.deepEqual(mergeBacklog(v('a\nдубль', 1), v('a', 9), 'a\nдубль'), v('a', 9));
  // і локальне видалення не повертається з хмари
  assert.deepEqual(mergeBacklog(v('a', 9), v('a\nдубль', 1), 'a\nдубль'), v('a', 9));
  // обидва змінились — новіша правка, без «з іншого пристрою»
  assert.deepEqual(mergeBacklog(v('x', 3), v('y', 7), ''), v('y', 7));
  assert.deepEqual(mergeBacklog(v('x', 7), v('y', 3), 'b'), v('x', 7));
});

test('mergePhotoTombstones / purgePhotoTombstones', () => {
  assert.deepEqual(mergePhotoTombstones({ a: 1, b: 5 }, { b: 3, c: 2 }), { a: 1, b: 5, c: 2 });
  const now = Date.now();
  assert.deepEqual(Object.keys(purgePhotoTombstones({ old: now - 400 * 864e5, fresh: now })), ['fresh']);
});

test('mergeStationNotes: новіший запис перемагає', () => {
  assert.deepEqual(
    mergeStationNotes({ s1: { v: 'L', t: 1 }, s2: 'старий' }, { s1: { v: 'C', t: 2 } }),
    { s1: { v: 'C', t: 2 }, s2: { v: 'старий', t: 0 } },
  );
});

test('applyCloudVerifiedIntoConfirmations: не повертає «100%», якщо хмара має повні дані', () => {
  const conf = { s: { k: { ...emptyConfirmationData(), updatedAt: 5 } } };
  assert.equal(applyCloudVerifiedIntoConfirmations(conf, { s: { k: true } }, true).s.k.finalConfirmed, false);
  assert.equal(applyCloudVerifiedIntoConfirmations(conf, { s: { k: true } }, false).s.k.finalConfirmed, true);
});
