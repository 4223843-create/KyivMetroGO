import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mergeKeyedMap, purgeTombstones, mergeConfirmations, mergeBacklog,
  mergeStationNotes, deriveVerifiedFromConfirmations, emptyConfirmationData,
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
  const map = { s: { old: { d: true, t: now - 8 * day }, fresh: { d: true, t: now - day }, note: { v: 'x', t: 1 } } };
  assert.deepEqual(Object.keys(purgeTombstones(map).s).sort(), ['fresh', 'note']);
  assert.deepEqual(purgeTombstones({ s: { old: { d: true, t: 0 } } }), {});
});

test('mergeConfirmations: лічильники беруть максимум, підтвердження — OR', () => {
  const local = { s: { k: { finalConfirmed: false, confirmCount: 2, disputeCount: 0, corrections: { '1/2': 1 }, updatedAt: 10 } } };
  const cloud = { s: { k: { finalConfirmed: true, confirmCount: 1, disputeCount: 3, corrections: { '1/2': 2, '3/4': 1 }, updatedAt: 20 } } };
  const m = mergeConfirmations(local, cloud).s.k;
  assert.equal(m.finalConfirmed, true);
  assert.equal(m.confirmCount, 2);
  assert.equal(m.disputeCount, 3);
  assert.deepEqual(m.corrections, { '1/2': 2, '3/4': 1 });
  assert.equal(m.updatedAt, 20);
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

test('mergeBacklog', () => {
  assert.equal(mergeBacklog('', '', ''), '');
  assert.equal(mergeBacklog('a', '', ''), 'a');
  assert.equal(mergeBacklog('a\nb', 'a', ''), 'a\nb');
  assert.equal(mergeBacklog('x', 'y', ''), 'x\n\n— з іншого пристрою —\ny');
  assert.equal(mergeBacklog('a', 'a\nc', 'a'), 'a\nc');           // змінилась лише хмара
  assert.equal(mergeBacklog('a\nb', 'a', 'a'), 'a\nb');           // змінився лише пристрій
  assert.equal(mergeBacklog('a\nb', 'a\nc', 'a'), 'a\nc\nb');     // обидва: додані рядки об'єднуються
});

test('mergeStationNotes: новіший запис перемагає', () => {
  assert.deepEqual(
    mergeStationNotes({ s1: { v: 'L', t: 1 }, s2: 'старий' }, { s1: { v: 'C', t: 2 } }),
    { s1: { v: 'C', t: 2 }, s2: { v: 'старий', t: 0 } },
  );
});
