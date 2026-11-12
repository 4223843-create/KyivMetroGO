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
// Шари даних. Дані з stations.json після гідратації зберігаються незмінною
// копією (_base). state.stationsData — це «вид»: копія бази з накладеними
// правками й підписами. Після будь-якої зміни правок виклик applyLocalLayer()
// складає вид заново з бази, тож скасована правка зникає без перечитування файлу.

import { STORAGE_KEYS, Storage, readJsonObject } from '../core/storage.js';
import { bus }                   from '../core/eventBus.js';
import { state }                 from '../core/state.js';
import { traversePositions, legacyKeyMap } from './positions.js';
import { buildExitSearchIndex } from './exitSearch.js';

const NEW_PREFIX = 'new|';

// ══ КЕШ ══════════════════════════════════════════════════════

let localEditsCache = null;
let exitLabelsCache = null;

/** slug → станція з даних без локальних правок (не змінюється до наступної гідратації). */
let _base = {};

export function invalidateLocalEditsCache() {
  localEditsCache = null;
  exitLabelsCache = null;
}

function _readJson(key) {
  const raw = readJsonObject(key);
  // { slug: { key: правка } } — станції з чимось іншим замість обʼєкта пропускаємо
  return Object.fromEntries(Object.entries(raw)
    .filter(([, byKey]) => byKey && typeof byKey === 'object' && !Array.isArray(byKey)));
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
 * Накладає збережені підписи виходів на свіжу копію даних (exit.label,
 * exit._labelEdited). Викликається лише з applyLocalLayer.
 *
 * @param {Record<string, object>} stationsData
 */
function _applyExitLabels(stationsData) {
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
  /** @type {Record<string, Record<number, object>>} */
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
  // Запам'ятовуємо, які значення були в даних на момент правки: коли дані
  // згодом зміняться, стара правка не перекриватиме їх назавжди
  const basePos = data.isNew ? null : _basePosition(slug, key);
  const edits = _getStoredEdits();
  (edits[slug] ??= {})[key] = basePos ? { ...data, base: _snapshot(basePos) } : data;
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
 * Накладає локальні правки на свіжу копію даних: змінює position (wagon,
 * doors, closed тощо), для isNew-правок додає новий exit у свій direction.
 * Правки, чия позиція зникла з даних, лишаються у сховищі, але не показуються.
 * Викликається лише з applyLocalLayer.
 *
 * @param {Record<string, object>} stationsData
 */
function _applyLocalEdits(stationsData) {
  const edits = _getStoredEdits();

  for (const [slug, keyEdits] of Object.entries(edits)) {
    const s = stationsData[slug];
    if (!s) continue;
    const posIdxByKey = new Map(s.positions.map((p, i) => [p._key, i]));

    traversePositions(s, ({ position }) => {
      const edit = keyEdits[position._key];
      if (edit !== undefined && !edit.isNew) {
        const { base: _base_, ...fields } = edit;
        Object.assign(position, fields, {
          _edited: true, _slug: slug, _posIdx: posIdxByKey.get(position._key),
        });
      }
    });

    for (const [key, edit] of Object.entries(keyEdits)) {
      if (!edit.isNew || posIdxByKey.has(key)) continue;

      const targetDir = s.directions.find(d => d.from === edit.dir);
      if (!targetDir) continue;

      const posIdx = s.positions.length;
      // Прихований вестибюль, доданий через меню правок: беремо його виходи з каталогу
      const vest = edit.vestibule ? s.exits_catalog?.[edit.vestibule] : null;
      const newExit = {
        ...(vest ? {
          id:             edit.vestibule,
          exit_numbers:   vest.exit_numbers,
          numbered_exits: vest.exit_numbers,
        } : {}),
        label:     edit.label || vest?.label || '',
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

// ══ ПРАВКИ ПРОТИ ОНОВЛЕНИХ ДАНИХ ═══════════════════════════════
// Правка зберігає base — значення з даних у момент редагування. Після кожного
// завантаження даних: якщо дані вже такі самі, як правка (її прийняли), — правку
// прибираємо мовчки; якщо дані змінились інакше — правка застаріла, прибираємо
// і повідомляємо. Старим правкам без base запам'ятовуємо поточні дані.

/** @param {any} p — позиція чи правка */
function _snapshot(p) {
  return { wagon: String(p?.wagon ?? ''), doors: String(p?.doors ?? ''), closed: !!p?.closed };
}

const _same = (a, b) => a.wagon === b.wagon && a.doors === b.doors && a.closed === b.closed;

/** Позиція з даних без правок за ключем або null. */
function _basePosition(slug, key) {
  let found = null;
  traversePositions(_base[slug], ({ position }) => { if (!found && position._key === key) found = position; });
  return found;
}

function _reconcileWithData() {
  const edits = _getStoredEdits();
  let changed = false;
  const superseded = new Set();
  for (const [slug, keyEdits] of Object.entries(edits)) {
    const s = _base[slug];
    if (!s) continue;
    traversePositions(s, ({ position }) => {
      const edit = keyEdits[position._key];
      if (!edit || edit.isNew) return;
      const now = _snapshot(position);
      if (_same(now, _snapshot(edit))) {
        delete keyEdits[position._key];
      } else if (!edit.base) {
        edit.base = now;
      } else if (!_same(_snapshot(edit.base), now)) {
        delete keyEdits[position._key];
        superseded.add(s.name);
      } else {
        return;
      }
      changed = true;
    });
    if (!Object.keys(keyEdits).length) delete edits[slug];
  }
  if (changed) _writeEdits(edits);
  if (superseded.size) bus.emit('local-edits:superseded', { stations: [...superseded] });
}

// ══ ВИД = БАЗА + ПРАВКИ ═════════════════════════════════════════

/**
 * Складає state.stationsData заново: копія незмінних даних + поточні правки
 * й підписи. Викликайте після saveLocalEdit / removeLocalEdit / saveExitLabel /
 * clearAllLocalEdits, а потім bus.emit('station:refresh') для перемальовування.
 */
export function applyLocalLayer() {
  const view = state.stationsData;
  if (!view) return;
  invalidateLocalEditsCache();
  for (const slug of Object.keys(_base)) view[slug] = structuredClone(_base[slug]);
  _applyLocalEdits(view);
  _applyExitLabels(view);
  // Пошук бачить і локальні підписи та нові виходи
  for (const slug of Object.keys(_base)) view[slug]._exitSearch = buildExitSearchIndex(view[slug]);
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

let _started = false;

/**
 * Підписує шар локальних правок на дані станцій. Повторний виклик нічого не робить.
 * Викликати до першого завантаження даних і після того, як імпортовано domain/checkin
 * і domain/favorites: їхні переходи зі старого формату мають бачити дані ще без правок.
 */
export function initLocalEdits() {
  if (_started) return;
  _started = true;

  // Правки чи підписи змінили в іншій вкладці
  bus.on('storage:changed', ({ key }) => {
    if (key !== STORAGE_KEYS.LOCAL_EDITS && key !== STORAGE_KEYS.EXIT_LABELS) return;
    applyLocalLayer();
    bus.emit('station:refresh');
  });

  bus.on('data:stations-hydrated', ({ stationsData }) => {
    _migrateLegacy(stationsData);
    _base = structuredClone(stationsData);
    _reconcileWithData();
    applyLocalLayer();
  });
}
