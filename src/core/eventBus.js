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

// Каталог подій. tests/eventBus.test.mjs перевіряє, що кожна подія з коду
// є тут і що в кожної є і відправник, і слухач.
// 'data:stations-hydrated'   { stationsData }  — дані станцій готові (старт або оновлення)
// 'stations:updated'         { version }       — завантажено новішу версію stations.json
// 'station:open'             { slug }
// 'station:refresh'          void              — перемалювати відкриту картку станції
// 'station:clock-settings'   void              — змінились налаштування годин/інтервалів
// 'sheet:close'              { sheetEl }
// 'sheet:open-feedback'      void
// 'sheet:open-feedback-for'  { slug }
// 'feedback:close'           void              — закрити форму правок (з питанням, якщо є зміни)
// 'feedback:dirty-changed'   { isDirty }
// 'feedback:submit-silent'   void              — зберегти правки без показу результату
// 'feedback:submit-ui'       { status: 'sending'|'local-only'|'success'|'network-error', background }
// 'fav:updated'              void
// 'fav:externally-updated'   { key }
// 'fav:render-on-load'       void
// 'fav:dismiss-hint'         void
// 'checkin:updated'          void
// 'checkin:attach-buttons'   { sheetEl, slug, color }
// 'map:sync-checkins'        void
// 'map:update-accessibility' void
// 'devmenu:refresh'          void
// 'storage:changed'          { key }           — ключ змінено в іншій вкладці (веб)
// 'storage:write-failed'     { key }
// 'ui:confirm'               { message, onYes, ... }
