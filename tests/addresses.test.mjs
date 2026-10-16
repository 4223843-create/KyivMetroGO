import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8'));
const stations  = read('stations.json');
const addresses = read('addresses.json');

test('addresses.json посилається лише на наявні станції', () => {
  const slugs = new Set(stations.stations.map(s => s.slug));
  assert.equal(addresses.schema, 2);
  for (const [slug, num] of addresses.exits) {
    assert.ok(slugs.has(slug), `невідома станція ${slug}`);
    assert.ok(num, `${slug}: порожній номер виходу`);
  }
});

test('будинки: номер і 1–3 пари «вихід, відстань»; частини вулиці — вихід, відстань, діапазон', () => {
  let houses = 0;
  const exitOk = (street, e) => assert.ok(addresses.exits[+e], `${street}: вихід ${e}`);
  for (const [street, , rawHouses, rawParts, alias] of addresses.streets) {
    assert.ok(!/\(|^(\S+) \1 /.test(street), `назва без дужок і повторів: ${street}`);
    assert.ok(alias === undefined || typeof alias === 'string', `${street}: alias`);
    assert.ok(rawHouses || rawParts, `${street}: порожня вулиця`);
    for (const entry of rawHouses ? rawHouses.split('|') : []) {
      const p = entry.split(' ');
      assert.ok(p.length >= 3 && p.length <= 7 && p.length % 2 === 1, `${street}: ${entry}`);
      for (let i = 1; i < p.length; i += 2) {
        exitOk(street, p[i]);
        assert.ok(Number.isInteger(+p[i + 1]), `${street}: відстань ${p[i + 1]}`);
      }
      houses++;
    }
    for (const entry of rawParts ? rawParts.split('|') : []) {
      const p = entry.split(' ');
      assert.ok(p.length === 2 || p.length === 4, `${street}: частина ${entry}`);
      exitOk(street, p[0]);
    }
  }
  assert.ok(houses > 30000, `замало будинків: ${houses}`);
});
