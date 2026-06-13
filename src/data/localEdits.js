// ══ ЛОКАЛЬНІ ПРАВКИ ТА ОПИСИ ВИХОДІВ ══
// Відповідальність: читання/запис локальних правок позицій та підписів виходів.
//
// applyLocalEdits / applyExitLabels залишаються публічними — їх безпосередньо
// викликають fbEvents.js, fbApi.js та stationSheet.js (прямий ESM-імпорт).

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { bus }                   from '../core/eventBus.js';
import { traversePositions }     from './positions.js';

// ══ КЕШ ══════════════════════════════════════════════════════

let localEditsCache = null;
let exitLabelsCache = null;

export function invalidateLocalEditsCache() {
  localEditsCache = null;
  exitLabelsCache = null;
}

// ══ EXIT LABELS ════════════════════════════════════════════════

function getExitLabels() {
  if (exitLabelsCache) return exitLabelsCache;
  try {
    exitLabelsCache = JSON.parse(Storage.get(STORAGE_KEYS.EXIT_LABELS) || '{}');
  } catch (e) {
    console.warn('[localEdits] Помилка парсингу описів виходів:', e);
    exitLabelsCache = {};
  }
  return exitLabelsCache;
}

/**
 * Зберігає або видаляє підпис виходу за slug + posIdx.
 * Якщо label порожній — запис видаляється.
 * @param {string} slug
 * @param {number} posIdx
 * @param {string} label
 */
export function saveExitLabel(slug, posIdx, label) {
  const labels = getExitLabels();
  if (!labels[slug]) labels[slug] = {};
  if (label.trim()) {
    labels[slug][posIdx] = label.trim();
  } else {
    delete labels[slug][posIdx];
    if (!Object.keys(labels[slug]).length) delete labels[slug];
  }
  Storage.set(STORAGE_KEYS.EXIT_LABELS, JSON.stringify(labels));
  exitLabelsCache = null;
}

/**
 * Повертає підпис виходу або null якщо немає.
 * @param {string} slug
 * @param {number} posIdx
 * @returns {string|null}
 */
export function getExitLabel(slug, posIdx) {
  return getExitLabels()[slug]?.[posIdx] ?? null;
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
  const labels = getExitLabels();
  for (const [slug, posLabels] of Object.entries(labels)) {
    if (!stationsData[slug]) continue;
    traversePositions(stationsData[slug], ({ exit, posIdx }) => {
      if (posLabels[posIdx] !== undefined) {
        exit.label        = posLabels[posIdx];
        exit._labelEdited = true;
        exit._slug        = slug;
      }
    });
  }
}

// ══ LOCAL EDITS ════════════════════════════════════════════════

/**
 * Повертає об'єкт усіх локальних правок позицій з кешу або Storage.
 * Структура: { [slug]: { [posIdx]: EditData } }
 * @returns {Record<string, Record<number, object>>}
 */
export function getLocalEdits() {
  if (localEditsCache) return localEditsCache;
  try {
    localEditsCache = JSON.parse(Storage.get(STORAGE_KEYS.LOCAL_EDITS) || '{}');
  } catch (e) {
    console.warn('[localEdits] Помилка парсингу локальних змін:', e);
    localEditsCache = {};
  }
  return localEditsCache;
}

/**
 * Зберігає локальну правку позиції.
 * @param {string} slug
 * @param {number} posIdx
 * @param {object} data
 */
export function saveLocalEdit(slug, posIdx, data) {
  const edits = getLocalEdits();
  if (!edits[slug]) edits[slug] = {};
  edits[slug][posIdx] = data;
  Storage.set(STORAGE_KEYS.LOCAL_EDITS, JSON.stringify(edits));
  localEditsCache = null;
}

/** Видаляє всі локальні правки з Storage та кешу. */
export function clearAllLocalEdits() {
  localEditsCache = null;
  Storage.remove(STORAGE_KEYS.LOCAL_EDITS);
}

/** @returns {boolean} true якщо є хоча б одна локальна правка */
export function hasLocalEdits() {
  return Object.keys(getLocalEdits()).length > 0;
}

/**
 * Застосовує всі локальні правки до об'єктів stationsData.
 * Мутує position на місці (wagon, doors, closed тощо).
 * Для isNew-правок — додає новий exit до відповідного direction.
 * Викликається:
 *   – автоматично з bus.on('data:stations-hydrated') при завантаженні даних;
 *   – явно з fbEvents.js та fbApi.js при ручних змінах у формі фідбеку.
 *
 * @param {Record<string, object>} stationsData
 */
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
        label:     edit.label || '',
        positions: [{
          wagon:    String(edit.wagon),
          doors:    String(edit.doors),
          _edited:  true,
          _slug:    slug,
          _posIdx:  parseInt(idx),
        }],
      };
      targetDir.exits.push(newExit);
      s.positions.push({
        dir:   edit.dir,
        exit:  newExit.label,
        wagon: String(edit.wagon),
        doors: String(edit.doors),
      });
    });
  }
}

// ══ BUS-ІНТЕГРАЦІЯ ════════════════════════════════════════════
// EventBus — синхронний: handlers виконуються до повернення bus.emit(),
// тому правки гарантовано застосовані до того, як hydrateStations поверне дані.

bus.on('data:stations-hydrated', ({ stationsData }) => {
  applyLocalEdits(stationsData);
  applyExitLabels(stationsData);
});