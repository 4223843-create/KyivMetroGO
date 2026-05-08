// ══ КОНСТАНТИ ТАЙМІНГІВ АНІМАЦІЙ ══
// Усі затримки анімацій зібрані тут.
// Змінюй значення в одному місці — ефект скрізь.

export const TIMING = {
  // ── Анімація «двері ліфта» (ui.js: _runDoorAnimation) ──
  // CSS transition: transform 0.6s, opacity 0.45s
  DOOR_CALLBACK:  200,   // коли спрацьовує callback (до кінця анімації — для плавного затемнення)
  DOOR_CLEANUP:   620,   // видалення DOM-клонів після завершення transition

  // ── Анімація розсування підказки (sheets.js: dismissHintWithDoors) ──
  // CSS transition: transform 0.55s, opacity 0.4s
  HINT_CALLBACK:  200,   // те саме — callback до кінця
  HINT_CLEANUP:   600,   // видалення клонів

  // ── Toast «вихід збережено» ──
  TOAST_SHOW:    2500,   // скільки toast лишається на екрані
  TOAST_FADE:     300,   // тривалість fade-out

  // ── Панелі редагування ──
  PANEL_CLOSE:    300,   // затримка видалення після remove('panel-open')

  // ── Жести ──
  LONG_PRESS:     600,   // мінімальний час утримання для long press
  DOUBLE_TAP:     500,   // вікно для реєстрації double tap
};
