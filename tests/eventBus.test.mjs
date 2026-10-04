// Кожна подія шини має і відправника, і слухача, і описана в каталозі eventBus.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function jsFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? jsFiles(p) : p.endsWith('.js') ? [p] : [];
  });
}

const emitted = new Set(), listened = new Set();
for (const file of jsFiles('src')) {
  const src = readFileSync(file, 'utf8');
  for (const [, kind, name] of src.matchAll(/bus\.(emit|on)\(\s*['"]([^'"]+)['"]/g)) {
    (kind === 'emit' ? emitted : listened).add(name);
  }
}
const catalog = new Set(
  [...readFileSync('src/core/eventBus.js', 'utf8').matchAll(/^\/\/ '([^']+)'/gm)].map(m => m[1])
);

test('кожну надіслану подію хтось слухає', () => {
  assert.deepEqual([...emitted].filter(e => !listened.has(e)), []);
});

test('кожну подію, яку слухають, хтось надсилає', () => {
  assert.deepEqual([...listened].filter(e => !emitted.has(e)), []);
});

test('каталог подій у eventBus.js збігається з кодом', () => {
  const used = new Set([...emitted, ...listened]);
  assert.deepEqual([...used].filter(e => !catalog.has(e)).sort(), [], 'немає в каталозі');
  assert.deepEqual([...catalog].filter(e => !used.has(e)).sort(), [], 'зайве в каталозі');
});
