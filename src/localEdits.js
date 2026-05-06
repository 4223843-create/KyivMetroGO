import { STORAGE_KEYS, Storage } from './storage.js';
import { traversePositions }     from './positions.js';

// ══ ЛОКАЛЬНІ ПРАВКИ ТА ОПИСИ ВИХОДІВ ══
// Витягнуто з feedback.js. Всі інші модулі мають імпортувати звідси.

let localEditsCache = null;
let exitLabelsCache = null;

export function invalidateLocalEditsCache() {
localEditsCache = null;
exitLabelsCache = null;
}

// ── ExitLabels ───────────────────────────────────────────────

function getExitLabels() {
if (exitLabelsCache) return exitLabelsCache;
try { exitLabelsCache = JSON.parse(Storage.get(STORAGE_KEYS.EXIT_LABELS) || '{}'); }
catch (e) { console.warn('[KyivMetroGO] Помилка парсингу описів виходів:', e); exitLabelsCache = {}; }
return exitLabelsCache;
}

export function saveExitLabel(slug, posIdx, label) {
const labels = getExitLabels();
if (!labels[slug]) labels[slug] = {};
if (label.trim()) labels[slug][posIdx] = label.trim();
else {
delete labels[slug][posIdx];
if (!Object.keys(labels[slug]).length) delete labels[slug];
}
Storage.set(STORAGE_KEYS.EXIT_LABELS, JSON.stringify(labels));
exitLabelsCache = null;
}

export function getExitLabel(slug, posIdx) {
return getExitLabels()[slug]?.[posIdx] ?? null;
}

export function applyExitLabels(stationsData) {
const labels = getExitLabels();
for (const [slug, posLabels] of Object.entries(labels)) {
if (!stationsData[slug]) continue;
traversePositions(stationsData[slug], ({ exit, posIdx }) => {
if (posLabels[posIdx] !== undefined) exit.label = posLabels[posIdx];
});
}
}

// ── LocalEdits ───────────────────────────────────────────────

export function getLocalEdits() {
if (localEditsCache) return localEditsCache;
try { localEditsCache = JSON.parse(Storage.get(STORAGE_KEYS.LOCAL_EDITS) || '{}'); }
catch (e) { console.warn('[KyivMetroGO] Помилка парсингу локальних змін:', e); localEditsCache = {}; }
return localEditsCache;
}

export function saveLocalEdit(slug, posIdx, data) {
const edits = getLocalEdits();
if (!edits[slug]) edits[slug] = {};
edits[slug][posIdx] = data;
Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(edits));
localEditsCache = null;
}

export function clearAllLocalEdits() {
localEditsCache = null;
Storage.remove(STORAGE_KEYS.LOCAL_EDITS);
}

export function hasLocalEdits() { return Object.keys(getLocalEdits()).length > 0; }

export function applyLocalEdits(stationsData) {
const edits = getLocalEdits();
for (const [slug, posEdits] of Object.entries(edits)) {
if (!stationsData[slug]) continue;
const s = stationsData[slug];

traversePositions(s, ({ position, posIdx }) => {
  const edit = posEdits[posIdx];
  if (edit !== undefined && !edit.isNew) {
    Object.assign(position, edit, { _edited: true, _slug: slug, _posIdx: posIdx });
  }
});

Object.keys(posEdits).forEach(idx => {
  const edit = posEdits[idx];
  if (!edit.isNew) return;
  const targetDir = s.directions.find(d => d.from === edit.dir);
  if (!targetDir) return;
  const alreadyAdded = targetDir.exits.some(e =>
    e.positions?.some(p => p._posIdx === parseInt(idx))
  );
  if (alreadyAdded) return;
  const newExit = {
    label: edit.label || '',
    positions: [{ wagon: String(edit.wagon), doors: String(edit.doors), _edited: true, _slug: slug, _posIdx: parseInt(idx) }],
  };
  targetDir.exits.push(newExit);
  s.positions.push({ dir: edit.dir, exit: newExit.label, wagon: String(edit.wagon), doors: String(edit.doors) });
});

}
}

// ── Зворотня сумісність ───────────────────────────────────────
MetroApp.applyLocalEdits          = applyLocalEdits;
MetroApp.applyExitLabels          = applyExitLabels;
MetroApp.getExitLabel             = getExitLabel;
MetroApp.invalidateLocalEditsCache = invalidateLocalEditsCache;