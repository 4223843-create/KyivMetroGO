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
