// ══ ЧЕРГА НЕВІДПРАВЛЕНИХ ПРАВОК ══
// Правки станцій ідуть розробнику через Formspree. Якщо мережі немає, лист
// лягає сюди (Storage: переживає перезапуск) і відправляється сам, щойно
// з'явиться мережа, — як і обіцяє повідомлення у формі правок.

import { Storage, STORAGE_KEYS } from '../core/storage.js';
import { FORM_STATION_EDITS }    from '../core/forms.js';
import { postForm, retryDelay, MAX_QUEUE_AGE_MS } from './formPost.js';

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
 * Надсилає один лист.
 * @param {{ station: string, changes: string }} body
 * @param {number} [timeoutMs]
 * @returns {Promise<import('./formPost.js').PostResult>}
 */
export function sendStationEdit(body, timeoutMs = 8000) {
  return postForm(FORM_STATION_EDITS, body, timeoutMs);
}

/** Кладе лист у чергу й планує повторну спробу. */
export function queueStationEdit(body) {
  _save([..._read(), { ...body, at: Date.now() }]);
  _schedule();
}

let _timer    = null;
let _sending  = false;
let _failures = 0;   // невдалі спроби поспіль — для зростаючої паузи

/**
 * Досилає все з черги по порядку. Лист, який Formspree відхилив (4xx), або
 * старший за 14 днів викидається; при обриві мережі чи 429/5xx решта чекає.
 */
export async function flushFeedbackOutbox() {
  if (_sending) return;
  _sending = true;
  try {
    for (const item of _read()) {
      const { at, ...body } = item;
      const drop = () => _save(_read().filter(r => !(r.at === item.at && r.station === item.station)));
      if (!(Date.now() - at < MAX_QUEUE_AGE_MS)) { drop(); continue; }
      const result = await sendStationEdit(body);
      if (result === 'retry') { _failures++; break; }
      if (result === 'rejected') console.warn('[outbox] Formspree відхилив правку, її прибрано з черги');
      _failures = 0;
      drop();
    }
  } finally {
    _sending = false;
    _schedule();
  }
}

function _schedule() {
  clearTimeout(_timer);
  _timer = _read().length ? setTimeout(flushFeedbackOutbox, retryDelay(_failures)) : null;
}

/** Після Storage.init(): дослати те, що лишилося з минулого запуску. */
export function initFeedbackOutbox() {
  flushFeedbackOutbox();
  window.addEventListener('online', () => { _failures = 0; flushFeedbackOutbox(); });
}
