// ══ МІНІМАЛЬНИЙ EVENT BUS ══
// Синхронна шина подій: handlers викликаються в порядку реєстрації,
// до повернення bus.emit(). Слабкий зв'язок між модулями без прямих імпортів.
// bus.on() повертає функцію-відписник — зберігай її для cleanup у тривалих sheet-handlers.

const _listeners = new Map();

export const bus = {
  /**
   * Підписується на подію. Повертає функцію-відписник.
   * @param {string}   event — назва події
   * @param {Function} fn    — обробник; отримує payload з emit()
   * @returns {() => void}   — виклик скасовує підписку
   */
  on(event, fn) {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(fn);
    return () => _listeners.get(event)?.delete(fn);
  },

  /**
   * Синхронно викликає всі обробники події.
   * Помилки в окремих handlers перехоплюються і логуються без зупинки решти.
   * @param {string} event
   * @param {*}      [payload]
   */
  emit(event, payload) {
    _listeners.get(event)?.forEach(fn => {
      try { fn(payload); }
      catch (e) { console.error(`[EventBus] "${event}":`, e); }
    });
  },

  /**
   * Видаляє конкретний обробник події.
   * @param {string}   event
   * @param {Function} fn
   */
  off(event, fn) {
    _listeners.get(event)?.delete(fn);
  },
};

// Каталог подій (документація — не код):
// 'feedback:dirty-changed'  { isDirty: boolean }
// 'feedback:submitted'      { slug: string }
// 'station:refresh'         void
// 'station:open'            { slug: string }
