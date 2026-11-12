// ══ ВІДПРАВКА ЛИСТА ЧЕРЕЗ FORMSPREE ══
// Спільне для черги правок і листів про вестибюлі: розрізняє, чи варто
// пробувати ще раз (немає мережі, перевантаження), чи лист уже не прийме ніхто.

/** @typedef {'sent'|'retry'|'rejected'} PostResult */

/** Скільки лист може чекати в черзі, перш ніж його викинуть (14 днів). */
export const MAX_QUEUE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * @param {string} url
 * @param {object} body
 * @param {number} [timeoutMs]
 * @returns {Promise<PostResult>}
 *   sent — прийнято; retry — мережа, 429 чи 5xx (спробувати пізніше);
 *   rejected — інша 4xx (форму вимкнено, ліміт плану): повтор не допоможе
 */
export async function postForm(url, body, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(body),
      signal:  controller.signal,
    });
    if (res.ok) return 'sent';
    return res.status === 429 || res.status >= 500 ? 'retry' : 'rejected';
  } catch {
    return 'retry';
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Пауза перед наступною спробою: 1, 2, 4… хв, не більше години.
 * @param {number} failures — скільки спроб поспіль не вдалося
 */
export function retryDelay(failures) {
  return Math.min(60_000 * 2 ** Math.max(0, failures - 1), 60 * 60_000);
}
