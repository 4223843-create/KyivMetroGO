// ══ UNSAVED CHECK — СПІЛЬНА УТИЛІТА ══
// Винесено з sheetsManager.js щоб уникнути кругової залежності:
//   stationSheet.js → sheetsManager.js → stationSheet.js
//
// Імпортується незалежно і в sheetsManager.js, і в stationSheet.js.

import { state } from './state.js';

/**
 * Перевіряє наявність незбережених змін у feedback-формі.
 * Якщо є — показує confirm-діалог і делегує рішення користувачу.
 * Якщо немає — одразу викликає proceed().
 *
 * @param {Function} proceed — callback, що виконується після підтвердження
 * @returns {boolean} true, якщо діалог було показано (proceed відкладено)
 */
export function withUnsavedCheck(proceed) {
  if (!MetroApp.hasUnsavedFeedback?.()) {
    proceed();
    return false;
  }

  const fbSlug      = document.getElementById('fbStation')?.value || '';
  const stationName = (fbSlug ? state.stationsData?.[fbSlug]?.name : '') || '';
  const question    = stationName
    ? `Зберегти зміни для станції <span style="white-space:nowrap;font-variant:small-caps;letter-spacing:0.04em;">${stationName}?</span>`
    : 'Зберегти зміни?';

  MetroApp.showCustomConfirm?.(
    question,
    () => { MetroApp.triggerFeedbackSubmit?.(true); MetroApp.fbUnsaved = false; proceed(); },
    () => { MetroApp.fbUnsaved = false; proceed(); },
    () => {},
  );
  return true;
}
