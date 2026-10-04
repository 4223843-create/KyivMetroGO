// ══ ЛОКАЛЬНІ ПРАВКИ ТА ОПИСИ ВИХОДІВ ══
// Відповідальність: читання/запис локальних правок позицій та підписів виходів.
//
// Формат зберігання: { [slug]: { [key]: … } }, де key — постійний id позиції з
// stations.json (positionId, data/positions.js), а для доданих користувачем
// виходів — «new|…». Так правки не з'їжджають на чужий вихід, коли в даних
// змінюється кількість, порядок чи назви виходів і напрямків.
//
// Решта застосунку працює з posIdx (індекс у station.positions) — тут він
// перекладається в ключ і назад через station.positions[i]._key.
// Записи старих форматів (ключ — posIdx або «напрямок|id виходу|номер») переводяться
// на id при завантаженні даних.
//
// applyLocalEdits / applyExitLabels залишаються публічними — їх безпосередньо
// викликають fbEvents.js, fbApi.js та stationSheet.js (прямий ESM-імпорт).

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { bus }                   from '../core/eventBus.js';
import { state }                 from '../core/state.js';
import { traversePositions, legacyKeyMap } from './positions.js';

const NEW_PREFIX = 'new|';

// ══ КЕШ ══════════════════════════════════════════════════════

let localEditsCache = null;
let exitLabelsCache = null;

export function invalidateLocalEditsCache() {
  localEditsCache = null;
  exitLabelsCache = null;
}

function _readJson(key) {
  try {
    return JSON.parse(Storage.get(key) || '{}');
  } catch (e) {
    console.warn('[localEdits] Помилка парсингу', key, e);
    return {};
  }
}

function _getStoredLabels() {
  if (!exitLabelsCache) exitLabelsCache = _readJson(STORAGE_KEYS.EXIT_LABELS);
  return exitLabelsCache;
}

function _getStoredEdits() {
  if (!localEditsCache) localEditsCache = _readJson(STORAGE_KEYS.LOCAL_EDITS);
  return localEditsCache;
}

function _writeEdits(edits) {
  if (Object.keys(edits).length) Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(edits));
  else Storage.remove(STORAGE_KEYS.LOCAL_EDITS);
  localEditsCache = null;
}

function _writeLabels(labels) {
  Storage.set(STORAGE_KEYS.EXIT_LABELS, JSON.stringify(labels));
  exitLabelsCache = null;
}

// ══ posIdx ⇄ КЛЮЧ ════════════════════════════════════════════

/** Стабільний ключ позиції за її posIdx або null, якщо позиції ще немає. */
function _keyOf(slug, posIdx) {
  return state.stationsData?.[slug]?.positions?.[posIdx]?._key ?? null;
}

/** Map<key, posIdx> для станції. */
function _indexByKey(slug) {
  const map = new Map();
  state.stationsData?.[slug]?.positions?.forEach((p, i) => { if (p._key) map.set(p._key, i); });
  return map;
}

// ══ EXIT LABELS ════════════════════════════════════════════════

/**
 * Зберігає або видаляє підпис виходу за slug + posIdx.
 * Якщо label порожній — запис видаляється.
 * @param {string} slug
 * @param {number} posIdx
 * @param {string} label
 */
export function saveExitLabel(slug, posIdx, label) {
  // Підпис нового, ще не збереженого виходу йде в його правку (edit.label)
  const key = _keyOf(slug, posIdx);
  if (!key) return;
  const labels = _getStoredLabels();
  if (!labels[slug]) labels[slug] = {};
  if (label.trim()) {
    labels[slug][key] = label.trim();
  } else {
    delete labels[slug][key];
    if (!Object.keys(labels[slug]).length) delete labels[slug];
  }
  _writeLabels(labels);
}

/**
 * Повертає підпис виходу або null якщо немає.
 * @param {string} slug
 * @param {number} posIdx
 * @returns {string|null}
 */
export function getExitLabel(slug, posIdx) {
  const key = _keyOf(slug, posIdx);
  return key ? _getStoredLabels()[slug]?.[key] ?? null : null;
}

/**
 * Застосовує всі збережені підписи виходів до об'єктів stationsData.
 * Мутує exit.label та exit._labelEdited на місці.
 * Викликається:
 *   – автоматично з bus.on('data:stations-hydrated') при завантаженні даних;
 *   – явно з fbEvents.js та stationSheet.js при ручних змінах.
 *
 * @param {Record<string, object>} stationsData
 */
export function applyExitLabels(stationsData) {
  const labels = _getStoredLabels();
  for (const [slug, keyLabels] of Object.entries(labels)) {
    if (!stationsData[slug]) continue;
    traversePositions(stationsData[slug], ({ exit, position }) => {
      const label = keyLabels[position._key];
      if (label !== undefined) {
        exit.label        = label;
        exit._labelEdited = true;
        exit._slug        = slug;
      }
    });
  }
}

// ══ LOCAL EDITS ════════════════════════════════════════════════

/**
 * Повертає локальні правки, переведені в posIdx поточних даних.
 * Структура: { [slug]: { [posIdx]: EditData } }. Це копія — для змін
 * використовуйте saveLocalEdit / removeLocalEdit.
 * @returns {Record<string, Record<number, object>>}
 */
export function getLocalEdits() {
  const result = {};
  for (const [slug, keyEdits] of Object.entries(_getStoredEdits())) {
    const index = _indexByKey(slug);
    for (const [key, edit] of Object.entries(keyEdits)) {
      const posIdx = index.get(key);
      if (posIdx === undefined) continue;
      (result[slug] ??= {})[posIdx] = edit;
    }
  }
  return result;
}

/**
 * Зберігає локальну правку позиції.
 * Для нового виходу, якого ще немає в даних, створює новий ключ «new|…».
 * @param {string} slug
 * @param {number} posIdx
 * @param {object} data
 */
export function saveLocalEdit(slug, posIdx, data) {
  let key = _keyOf(slug, posIdx);
  if (!key) {
    if (!data.isNew) return;
    key = `${NEW_PREFIX}${Date.now().toString(36)}-${posIdx}`;
  }
  const edits = _getStoredEdits();
  (edits[slug] ??= {})[key] = data;
  _writeEdits(edits);
}

/**
 * Видаляє локальну правку позиції.
 * @param {string} slug
 * @param {number} posIdx
 */
export function removeLocalEdit(slug, posIdx) {
  const key   = _keyOf(slug, posIdx);
  const edits = _getStoredEdits();
  if (!key || !edits[slug]?.[key]) return;
  delete edits[slug][key];
  if (!Object.keys(edits[slug]).length) delete edits[slug];
  _writeEdits(edits);
}

/** Видаляє всі локальні правки з Storage та кешу. */
export function clearAllLocalEdits() {
  localEditsCache = null;
  Storage.remove(STORAGE_KEYS.LOCAL_EDITS);
}

/** @returns {boolean} true якщо є хоча б одна локальна правка */
export function hasLocalEdits() {
  return Object.keys(_getStoredEdits()).length > 0;
}

/**
 * Застосовує всі локальні правки до об'єктів stationsData.
 * Мутує position на місці (wagon, doors, closed тощо).
 * Для isNew-правок — додає новий exit до відповідного direction.
 * Правки, чия позиція зникла з даних, лишаються у сховищі, але не показуються.
 * Викликається:
 *   – автоматично з bus.on('data:stations-hydrated') при завантаженні даних;
 *   – явно з fbEvents.js та fbApi.js при ручних змінах у формі фідбеку.
 *
 * @param {Record<string, object>} stationsData
 */
export function applyLocalEdits(stationsData) {
  const edits = _getStoredEdits();

  for (const [slug, keyEdits] of Object.entries(edits)) {
    const s = stationsData[slug];
    if (!s) continue;
    const posIdxByKey = new Map(s.positions.map((p, i) => [p._key, i]));

    traversePositions(s, ({ position }) => {
      const edit = keyEdits[position._key];
      if (edit !== undefined && !edit.isNew) {
        Object.assign(position, edit, {
          _edited: true, _slug: slug, _posIdx: posIdxByKey.get(position._key),
        });
      }
    });

    for (const [key, edit] of Object.entries(keyEdits)) {
      if (!edit.isNew || posIdxByKey.has(key)) continue;

      const targetDir = s.directions.find(d => d.from === edit.dir);
      if (!targetDir) continue;

      const posIdx = s.positions.length;
      const newExit = {
        label:     edit.label || '',
        positions: [{
          wagon:    String(edit.wagon),
          doors:    String(edit.doors),
          _edited:  true,
          _slug:    slug,
          _posIdx:  posIdx,
          _key:     key,
        }],
      };
      targetDir.exits.push(newExit);
      s.positions.push({
        dir:   edit.dir,
        exit:  newExit.label,
        wagon: String(edit.wagon),
        doors: String(edit.doors),
        _key:  key,
      });
      posIdxByKey.set(key, posIdx);
    }
  }
}

// ══ ПЕРЕХІД ЗІ СТАРИХ ФОРМАТІВ ════════════════════════════════
// 1) Ключ — posIdx (число). Позиції з даних нумерувалися обходом чистих даних,
//    тобто збігаються з station.positions до застосування правок; нові виходи
//    мали номери за межами цього списку.
// 2) Ключ — «напрямок|id виходу|номер позиції у виході» (до появи id у даних).

const _isLegacyKey   = key => /^\d+$/.test(key);
const _isOldPathKey  = key => key.includes('|') && !key.startsWith(NEW_PREFIX);

function _migrateLegacy(stationsData) {
  const convert = (stored, write) => {
    let changed = false;
    for (const [slug, entries] of Object.entries(stored)) {
      if (!Object.keys(entries).some(k => _isLegacyKey(k) || _isOldPathKey(k))) continue;
      const positions = stationsData[slug]?.positions;
      if (!positions) continue;           // станції немає — лишаємо як є
      const oldKeys = legacyKeyMap(stationsData[slug]);
      const next = {};
      for (const [key, value] of Object.entries(entries)) {
        if (_isOldPathKey(key)) {
          // Позиції з таким старим ключем уже немає — лишаємо запис як є
          next[oldKeys.get(key) ?? key] = value;
          continue;
        }
        if (!_isLegacyKey(key)) { next[key] = value; continue; }
        const idx    = Number(key);
        const newKey = positions[idx]?._key
          ?? `${NEW_PREFIX}legacy-${idx}`;  // новий вихід користувача
        if (!positions[idx]?._key && value && typeof value === 'object' && !value.isNew) continue;
        next[newKey] = value;
      }
      if (JSON.stringify(next) === JSON.stringify(entries)) continue;
      stored[slug] = next;
      changed = true;
    }
    if (changed) write(stored);
  };
  convert(_getStoredEdits(), _writeEdits);
  convert(_getStoredLabels(), _writeLabels);
}

// ══ BUS-ІНТЕГРАЦІЯ ════════════════════════════════════════════
// EventBus — синхронний: handlers виконуються до повернення bus.emit(),
// тому правки гарантовано застосовані до того, як hydrateStations поверне дані.

bus.on('data:stations-hydrated', ({ stationsData }) => {
  _migrateLegacy(stationsData);
  applyLocalEdits(stationsData);
  applyExitLabels(stationsData);
});
