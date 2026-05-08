// ══ СИСТЕМНІ API (CAPACITOR / БРАУЗЕР) ══
// Раніше в ui.js. Тепер: окремий файл для platform-специфічного коду.
// Не залежить від бізнес-логіки, не залежить від анімацій.

/**
 * Прозорий статус-бар під Capacitor.
 * На веб — no-op.
 */
export async function configureEdgeToEdge() {
  if (!window.Capacitor?.Plugins?.StatusBar) return;

  const { StatusBar, Style } = window.Capacitor.Plugins;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  } catch (e) {
    console.warn('[KyivMetroGO] StatusBar plugin error:', e);
  }
}

/**
 * Додає запис в history для коректної обробки кнопки «назад» на Android.
 * Викликається перед відкриттям кожної шторки.
 */
export function pushSheetHistory() {
  if (!history.state?.isSheetOpen) {
    history.pushState({ isSheetOpen: true }, '');
  }
}
