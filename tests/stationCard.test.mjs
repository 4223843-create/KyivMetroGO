import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

globalThis.window = globalThis;
globalThis.addEventListener ??= () => {};
globalThis.location ??= { search: '', hash: '', hostname: 'localhost', href: 'http://localhost/' };
const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
  key: i => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
  clear: () => mem.clear(),
};

const { state } = await import('../src/core/state.js');
const { exitGroupKey } = await import('../src/domain/checkin.js');
const { setPref } = await import('../src/core/prefs.js');
setPref('checkinByExit', true);

const { stations } = JSON.parse(readFileSync(new URL('../public/stations.json', import.meta.url)));
state.stationsData = Object.fromEntries(
  (Array.isArray(stations) ? stations : Object.values(stations)).map(s => [s.slug, s]));

const groups = (slug, ids) => ids.map(id => exitGroupKey(slug, id));

test('Check-in за виходами: Деміївська — ескалатор з ескалатором, ліфт з ліфтом', () => {
  const [esc1, lift1, esc2, lift2] = groups('B.Demiivska', ['220-1', '220-2', '220-3', '220-4']);
  assert.equal(esc1, esc2);
  assert.equal(lift1, lift2);
  assert.notEqual(esc1, lift1);
});

test('Check-in за виходами: Голосіївська — 5/4 у парі з 1/1', () => {
  const st = state.stationsData['B.Holosiivska'];
  const ids = st.directions.flatMap(d => d.exits.flatMap(e => e.positions))
    .reduce((m, p) => (m[`${p.wagon}/${p.doors}`] = p.id, m), {});
  assert.equal(exitGroupKey('B.Holosiivska', ids['5/4']), exitGroupKey('B.Holosiivska', ids['1/1']));
  assert.notEqual(exitGroupKey('B.Holosiivska', ids['5/4']), exitGroupKey('B.Holosiivska', ids['5/3']));
});

test('Check-in без групування: кожна позиція окремо', () => {
  setPref('checkinByExit', false);
  const [a, , b] = groups('B.Demiivska', ['220-1', '220-2', '220-3']);
  assert.notEqual(a, b);
  setPref('checkinByExit', true);
});

const { renderStationClock } = await import('../src/sheets/renderStation.js');
state.lineIntervals = JSON.parse(readFileSync(new URL('../public/stations.json', import.meta.url))).line_intervals;

test('Ранковий інтервал: уночі показує інтервал після відкриття', () => {
  const st = state.stationsData['B.Demiivska'];
  const night = new Date(2026, 9, 5, 2, 30); // понеділок, 02:30
  setPref('morningInterval', true);
  assert.match(renderStationClock(st, night), /Інтервал руху після відкриття/);
  setPref('morningInterval', false);
  assert.doesNotMatch(renderStationClock(st, night), /після відкриття/);
  setPref('morningInterval', true);
  assert.doesNotMatch(renderStationClock(st, new Date(2026, 9, 5, 12, 0)), /після відкриття/);
});
