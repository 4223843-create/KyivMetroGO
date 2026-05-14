// ══ МІНІМАЛЬНИЙ EVENT BUS ══
// Використовується для розв'язки модулів без глобального MetroApp.
// Підписники реєструються через bus.on(), повідомлення через bus.emit().
// bus.on() повертає функцію-відписник — зберігай її для cleanup.

const _listeners = new Map();

export const bus = {
  on(event, fn) {
    if (!_listeners.has(event)) _listeners.set(event, new Set());
    _listeners.get(event).add(fn);
    // Повертає unsubscribe
    return () => _listeners.get(event)?.delete(fn);
  },

  emit(event, payload) {
    _listeners.get(event)?.forEach(fn => {
      try { fn(payload); }
      catch (e) { console.error(`[EventBus] "${event}":`, e); }
    });
  },

  off(event, fn) {
    _listeners.get(event)?.delete(fn);
  },
};

// Каталог подій (документація — не код):
// 'feedback:dirty-changed'  { isDirty: boolean }
// 'feedback:submitted'      { slug: string }
// 'station:refresh'         void
// 'station:open'            { slug: string }