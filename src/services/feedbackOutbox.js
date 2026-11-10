// ══ ЧЕРГА НЕВІДПРАВЛЕНИХ ПРАВОК ══
// Правки станцій ідуть розробнику через Formspree. Якщо мережі немає, лист
// лягає сюди (Storage: переживає перезапуск) і відправляється сам, щойно
// з'явиться мережа, — як і обіцяє повідомлення у формі правок.

import { Storage, STORAGE_KEYS } from '../core/storage.js';
import { FORM_STATION_EDITS }    from '../core/forms.js';

const RETRY_MS = 60 * 1000;

function _read() {
  try {
    const list = JSON.parse(Storage.get(STORAGE_KEYS.FEEDBACK_OUTBOX) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function _save(list) {
  if (list.length) Storage.set(STORAGE_KEYS.FEEDBACK_OUTBOX, JSON.stringify(list));
  else Storage.remove(STORAGE_KEYS.FEEDBACK_OUTBOX);
}

/**
 * Надсилає один лист. true — пішов.
 * @param {{ station: string, changes: string }} body
 * @param {number} [timeoutMs]
 */
export async function sendStationEdit(body, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(FORM_STATION_EDITS, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

/** Кладе лист у чергу й планує повторну спробу. */
export function queueStationEdit(body) {
  _save([..._read(), { ...body, at: Date.now() }]);
  _schedule();
}

let _timer   = null;
let _sending = false;

/** Досилає все з черги; невдалі лишаються. */
export async function flushFeedbackOutbox() {
  if (_sending) return;
  _sending = true;
  try {
    for (const item of _read()) {
      const { at: _at, ...body } = item;
      if (!(await sendStationEdit(body))) break;   // мережі немає — решту теж не відправимо
      _save(_read().filter(r => !(r.at === item.at && r.station === item.station)));
    }
  } finally {
    _sending = false;
    _schedule();
  }
}

function _schedule() {
  clearTimeout(_timer);
  _timer = _read().length ? setTimeout(flushFeedbackOutbox, RETRY_MS) : null;
}

/** Після Storage.init(): дослати те, що лишилося з минулого запуску. */
export function initFeedbackOutbox() {
  flushFeedbackOutbox();
  window.addEventListener('online', () => flushFeedbackOutbox());
}
