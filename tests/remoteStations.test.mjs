// Android бере нові дані з GitHub Pages, а якщо той недоступний — з Vercel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

const data = JSON.parse(readFileSync(new URL('../public/stations.json', import.meta.url), 'utf8'));
const ok = body => ({ ok: true, status: 200, json: async () => structuredClone(body) });
const notFound = { ok: false, status: 404, json: async () => ({}) };

async function withFetch(handler, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async url => { calls.push(String(url)); return handler(String(url)); };
  try { return { result: await fn(), calls }; } finally { globalThis.fetch = real; }
}

test('GitHub Pages працює — Vercel не питаємо', async () => {
  const { _fetchRemoteStations } = await import('../src/data/stations.js');
  const { result, calls } = await withFetch(url => url.includes('github.io') ? ok(data) : notFound,
    () => _fetchRemoteStations(2000));
  assert.equal(result?.version, data.version);
  assert.ok(calls.every(u => u.includes('github.io')));
});

test('GitHub Pages недоступний — дані беруться з Vercel', async () => {
  const { _fetchRemoteStations } = await import('../src/data/stations.js');
  const { result, calls } = await withFetch(url => {
    if (url.includes('github.io')) throw new TypeError('Failed to fetch');
    return url.endsWith('/stations.json') ? ok(data) : notFound;
  }, () => _fetchRemoteStations(2000));
  assert.equal(result?.version, data.version);
  assert.ok(calls.some(u => u.startsWith('https://kyiv-metro-go.vercel.app/')));
});

test('зіпсована відповідь з основної адреси — пробуємо запасну', async () => {
  const { _fetchRemoteStations } = await import('../src/data/stations.js');
  const { result } = await withFetch(url => url.includes('github.io') ? ok({ broken: true }) : ok(data),
    () => _fetchRemoteStations(2000));
  assert.equal(result?.version, data.version);
});

test('обидві адреси недоступні — null', async () => {
  const { _fetchRemoteStations } = await import('../src/data/stations.js');
  const { result } = await withFetch(() => { throw new TypeError('offline'); }, () => _fetchRemoteStations(2000));
  assert.equal(result, null);
});
