// ══ ПРАПОРЦІ ЗБІРКИ ══
// Значення підставляє Vite (define у vite.config.js); у node-тестах їх немає.

/* global __PLAY_BUILD__ */
/** Збірка для Google Play: коду режиму розробника в ній немає зовсім. */
export const PLAY_BUILD = typeof __PLAY_BUILD__ !== 'undefined' && __PLAY_BUILD__ === true;
