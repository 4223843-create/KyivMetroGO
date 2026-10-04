// ══ СТАН ФОРМИ ФІДБЕКУ ══
// Правило: цей модуль не знає ні про DOM, ні про Storage.
// Він є єдиним джерелом правди для feedback-форми.

import { state as appState }           from '../../core/state.js';
import { getLocalEdits, getExitLabel } from '../../data/localEdits.js';
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
  /** Підписи, змінені у формі й ще не застосовані: idx → текст. @type {Record<number, string>} */
  changedLabels: {},
  isDirty:  false,
};

export function resetFbState() {
  fbState.slug     = null;
  fbState.original = {};
  fbState.current  = {};
  fbState.labels   = {};
  fbState.changedLabels = {};
  fbState.isDirty  = false;
}

export function computeIsDirty() {
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
  return Object.keys(fbState.changedLabels).length > 0;
}

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
    
    fbState.current[i] = structuredClone(fbState.original[i]);
    
    fbState.labels[i] = getExitLabel(slug, i) ?? (p.exit ? p.exit.trim() : '');
  });
}