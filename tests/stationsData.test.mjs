import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateStationsData, stationsVersion } from '../src/data/validateStations.js';
import { traversePositions, findPosition, legacyKeyMap, positionId } from '../src/data/positions.js';
import { matchLegacyPosition } from '../src/data/legacyExitMatch.js';

const data = JSON.parse(readFileSync(new URL('../public/stations.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(data);

test('public/stations.json проходить перевірку', () => {
  assert.deepEqual(validateStationsData(data), []);
  assert.ok(stationsVersion(data) > 20260000);
});

test('перевірка ловить зламані дані', () => {
  assert.ok(validateStationsData(null).length);
  assert.ok(validateStationsData({ ...clone(), schema: 99 }).some(e => e.includes('schema')));
  assert.ok(validateStationsData({ ...clone(), stations: [] }).length);

  const noId = clone();
  delete noId.stations[0].directions[0].exits[0].positions[0].id;
  assert.ok(validateStationsData(noId).some(e => e.includes('немає id')));

  const badLink = clone();
  badLink.stations.flatMap(st => st.directions || []).find(d => d.from_slug).from_slug = 'X.Nowhere';
  assert.ok(validateStationsData(badLink).some(e => e.includes('невідому станцію')));

  const dup = clone();
  const exits = dup.stations[0].directions[0].exits;
  exits[0].positions.push({ ...exits[0].positions[0] });
  assert.ok(validateStationsData(dup).some(e => e.includes('повторюється')));
});

test('перевірка ловить дані, на яких падає картка станції (рев\'ю Fable)', () => {
  const broken = (mutate, needle) => {
    const d = clone();
    mutate(d);
    const errors = validateStationsData(d);
    assert.ok(errors.some(e => e.includes(needle)), `очікувалась помилка «${needle}», є: ${errors.join('; ')}`);
  };
  const pos = d => d.stations[0].directions[0].exits[0].positions[0];
  broken(d => { delete d.stations[0].schedule.open; }, 'schedule.open');
  broken(d => { d.stations[0].schedule.close = '25:99'; }, 'schedule.close');
  broken(d => { Object.values(d.stations[0].schedule.trains)[0].first = 551; }, '.first');
  broken(d => { delete pos(d).wagon; }, 'wagon');
  broken(d => { delete pos(d).doors; }, 'doors');
  broken(d => { pos(d).doors = '<b>3</b>'; }, 'doors');
  broken(d => { d.stations[0].directions[0].exits[0].id = '999'; }, 'відсутній в exits_catalog');
  broken(d => { Object.values(d.stations[0].exits_catalog)[0].label = 5; }, 'label');
  broken(d => { d.line_intervals = 'x'; }, 'line_intervals');
  broken(d => { d.line_intervals.red[0].weekday = { 'Лісова': 300 }; }, 'пара секунд');
  broken(d => { d.stations.find(s => s.connections?.stops).connections.stops = {}; }, 'stops');
  broken(d => { d.stations.length = 10; }, 'щонайменше');
  broken(d => { d.version = '007'; }, 'version');
  broken(d => { d.version = 2026111; }, 'version');
});

test('id позицій: формат «<id виходу>-<n>» і пошук за id', () => {
  for (const station of data.stations) {
    traversePositions(station, ({ exit, position }) => {
      if (exit.id) assert.match(position.id, new RegExp(`^${exit.id}-\\d+$`), `${station.slug} ${position.id}`);
      assert.equal(findPosition(station, position.id)?.position, position);
    });
  }
});

test('старі ключі переводяться на id', () => {
  const station = data.stations.find(s => s.directions?.length);
  const map = legacyKeyMap(station);
  const ids = new Set();
  traversePositions(station, ({ position }) => ids.add(positionId(position)));
  assert.ok(map.size > 0);
  for (const id of map.values()) assert.ok(ids.has(id));
});

test('старий запис вибраного знаходить свою позицію', () => {
  const station = data.stations.find(s => s.slug === 'R.Sviatoshyn');
  const { dir, position } = findPosition(station, '104-1');
  assert.equal(matchLegacyPosition(station, { dir: dir.from, wagon: position.wagon, doors: position.doors }), '104-1');
  assert.equal(matchLegacyPosition(station, { dir: 'нема такого', wagon: '99', doors: '99' }), null);
});

test('пересадки й посилання на станції задані полями', () => {
  const bySlug = Object.fromEntries(data.stations.map(s => [s.slug, s]));
  const transfers = data.stations.flatMap(s =>
    Object.values(s.exits_catalog || {}).filter(e => e.transfer_to).map(e => [s.slug, e.transfer_to]));
  assert.equal(transfers.length, 6);
  for (const [from, to] of transfers) assert.notEqual(bySlug[from].line, bySlug[to].line);
  for (const s of data.stations) for (const d of s.directions || []) {
    if (d.from.startsWith('попередня')) assert.equal(bySlug[d.from_slug]?.line, s.line, `${s.slug}: ${d.from}`);
  }
});

test('новіший формат даних помічається, свій — ні', async () => {
  const { newerSchemaAvailable, SUPPORTED_SCHEMA } = await import('../src/data/validateStations.js');
  assert.equal(newerSchemaAvailable({ schema: SUPPORTED_SCHEMA }), false);
  assert.equal(newerSchemaAvailable({}), false);
  assert.equal(newerSchemaAvailable({ schema: SUPPORTED_SCHEMA + 1 }), true);
  assert.equal(newerSchemaAvailable({ schema: SUPPORTED_SCHEMA, newest_schema: SUPPORTED_SCHEMA + 1 }), true);
});
