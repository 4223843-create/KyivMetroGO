// ══ СТАН ФОРМИ ФІДБЕКУ ══
// Правило: цей модуль не знає ні про DOM, ні про MetroApp, ні про Storage.
// Він є єдиним джерелом правди для feedback-форми.

import { state as appState }           from '@core/state.js';
import { getLocalEdits, getExitLabel } from '@data/localEdits.js';
import { parseDoorValues }             from './fbUtils.js';

/** @typedef {{ wMain:number, dMain:number, wEx:any, dEx:any, wEx2:any, dEx2:any, hasExtra:boolean, hasThird:boolean, isClosed:boolean, isNew?:boolean, dir?:string }} FbEntryState */

export const fbState = {
  /** @type {string|null} */
  slug:     null,
  /** @type {Record<number, FbEntryState>} */
  original: {},
  /** @type {Record<number, FbEntryState>} */
  current:  {},
  /** @type {Record<number, string>} */
  labels:   {},
  isDirty:  false,
};

export function resetFbState() {
  fbState.slug     = null;
  fbState.original = {};
  fbState.current  = {};
  fbState.labels   = {};
  fbState.isDirty  = false;
}

/**
 * Чиста функція: обчислює isDirty без мутації стану і без DOM.
 * @param {string[]} changedLabelKeys — масив ключів inputs із data-changed="true"
 */
export function computeIsDirty(changedLabelKeys = []) {
  for (const i in fbState.current) {
    if (fbState.current[i]?.isNew) return true;
  }
  for (const i in fbState.original) {
    const o = fbState.original[i];
    const c = fbState.current[i];
    if (!c) continue;
    if (
      String(o.wMain) !== String(c.wMain) || String(o.dMain) !== String(c.dMain) ||
      String(o.wEx)   !== String(c.wEx)   || String(o.dEx)   !== String(c.dEx)   ||
      String(o.wEx2)  !== String(c.wEx2)  || String(o.dEx2)  !== String(c.dEx2)  ||
      o.isClosed !== c.isClosed
    ) return true;
  }
  return changedLabelKeys.length > 0;
}

/** Синхронізує current[idx] з тим, що є в DOM. Єдине місце, де state ←← DOM. */
export function syncCurrentFromDOM(idx) {
  const cur = fbState.current[idx];
  if (!cur) return;
  const rd = id => document.getElementById(id)?.textContent ?? '-';
  cur.wMain = rd(`fbW${idx}`);
  cur.dMain = rd(`fbD${idx}`);
  cur.wEx   = rd(`fbW_ex${idx}`);
  cur.dEx   = rd(`fbD_ex${idx}`);
  cur.wEx2  = rd(`fbW_ex2_${idx}`);
  cur.dEx2  = rd(`fbD_ex2_${idx}`);
}
/** * Ініціалізує стан форми для конкретної станції, 
 * враховуючи як оригінальні дані, так і локальні зміни.
 */
export function initFeedbackState(slug) {
  resetFbState();
  fbState.slug = slug;
  if (!slug || !appState.stationsData[slug]) return;

  const s = appState.stationsData[slug];
  const edits = getLocalEdits()[slug] || {};

  s.positions?.forEach((p, i) => {
    const rawW = String(edits[i]?.wagon ?? p.wagon);
    const rawD = String(edits[i]?.doors ?? p.doors);
    const parsed = parseDoorValues(rawW, rawD);

    fbState.original[i] = { ...parsed, isClosed: !!edits[i]?.closed };
    
    // Робимо глибоку копію об'єкта
    fbState.current[i] = structuredClone(fbState.original[i]);
    
    fbState.labels[i] = getExitLabel(slug, i) ?? (p.exit ? p.exit.trim() : '');
  });
}