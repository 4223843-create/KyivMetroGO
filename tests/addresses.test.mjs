import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(`../public/${name}`, import.meta.url), 'utf8'));
const stations  = read('stations.json');
const addresses = read('addresses.json');

test('addresses.json посилається лише на наявні станції', () => {
  const slugs = new Set(stations.stations.map(s => s.slug));
  assert.equal(addresses.schema, 1);
  for (const [slug, num] of addresses.exits) {
    assert.ok(slugs.has(slug), `невідома станція ${slug}`);
    assert.ok(num, `${slug}: порожній номер виходу`);
  }
});

test('кожен будинок: номер і 1–3 пари «вихід, відстань»', () => {
  let n = 0;
  for (const [street, raw] of addresses.streets) {
    for (const entry of raw.split('|')) {
      const p = entry.split(' ');
      assert.ok(p.length >= 3 && p.length <= 7 && p.length % 2 === 1, `${street}: ${entry}`);
      for (let i = 1; i < p.length; i += 2) {
        assert.ok(addresses.exits[+p[i]], `${street}: вихід ${p[i]}`);
        assert.ok(Number.isInteger(+p[i + 1]), `${street}: відстань ${p[i + 1]}`);
      }
      n++;
    }
  }
  assert.ok(n > 10000, `замало будинків: ${n}`);
});
