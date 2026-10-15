import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildExitSearchIndex, matchExitSearch, exitHintText, queryWordsForExits,
} from '../src/data/exitSearch.js';

const data = JSON.parse(readFileSync(new URL('../public/stations.json', import.meta.url), 'utf8'));

// Те саме розгортання exits_catalog, що в hydrateStations
function hydrated(station) {
  const s = structuredClone(station);
  const cat = s.exits_catalog || {};
  for (const dir of s.directions || []) {
    for (const ex of dir.exits || []) {
      const c = cat[ex.id];
      if (!c) continue;
      ex.label ??= c.label;
      ex.exit_numbers ??= c.exit_numbers;
    }
  }
  return s;
}

const index = new Map(data.stations.map(s => [s.name, buildExitSearchIndex(hydrated(s))]));

function find(query) {
  const words = queryWordsForExits(query);
  const out = [];
  for (const [name, idx] of index) {
    const hit = matchExitSearch(idx, words);
    if (hit) out.push([name, exitHintText(hit)]);
  }
  return out;
}

test('вулиця виходу знаходить станцію з номерами виходів', () => {
  const res = find('палладіна');
  const akadem = res.find(([n]) => n === 'Академмістечко');
  assert.ok(akadem, JSON.stringify(res));
  assert.match(akadem[1], /^виходи 3, 4, 6, 7, 8, 9 · просп\. Академіка Палладіна$/);
});

test('тип вулиці в запиті необовʼязковий, кілька слів шукаються разом', () => {
  assert.ok(find('вул велика васильківська').some(([n]) => n === 'Палац спорту' || n === 'Олімпійська'));
  assert.ok(find('просп бажана 36').some(([, h]) => h.includes('Бажана, 36')));
});

test('підписи виходів теж шукаються, з nbsp і дужками', () => {
  assert.ok(find('dream').length >= 1);
  assert.ok(find('небесної сотні').length >= 1);
  assert.ok(find('хрещатик').some(([, h]) => h.includes('Хрещатик')));
});

test('апостроф у запиті і в даних не заважає', () => {
  assert.ok(find('лукяненка').length >= 1);
  assert.ok(find('лук’яненка').length >= 1);
});

test('рядки з <br> розбиті: підказка — лише рядок зі збігом', () => {
  const hit = find('чистяківська')[0];
  assert.ok(hit);
  assert.ok(!hit[1].includes('<br>'));
  assert.match(hit[1], /вул\. Чистяківська$/);
});
