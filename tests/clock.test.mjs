// Години роботи й інтервали рахуються за київським часом, хоч би де був телефон.
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

test('київський настінний час не залежить від поясу телефону', async () => {
  const { kyivWallClock } = await import('../src/core/clock.js');
  // 2026-11-13 22:30 UTC = субота 00:30 у Києві (UTC+2 взимку)
  const k = kyivWallClock(new Date(Date.UTC(2026, 10, 13, 22, 30)));
  assert.equal(k.getHours(), 0);
  assert.equal(k.getMinutes(), 30);
  assert.equal(k.getDay(), 6);
  // Улітку UTC+3: 2026-07-01 21:15 UTC = 00:15 четверга
  const s = kyivWallClock(new Date(Date.UTC(2026, 6, 1, 21, 15)));
  assert.equal(s.getHours(), 0);
  assert.equal(s.getDay(), 4);
});
