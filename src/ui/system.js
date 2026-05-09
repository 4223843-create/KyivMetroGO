// ══ СИСТЕМНІ API (CAPACITOR / БРАУЗЕР) ══

/**
 * Тактильний відгук через Capacitor Haptics або navigator.vibrate.
 * На веб без Capacitor — navigator.vibrate (якщо підтримується).
 * @param {'light'|'medium'|'heavy'} style
 */
export async function hapticImpact(style = 'light') {
  if (window.Capacitor?.Plugins?.Haptics) {
    try {
      await window.Capacitor.Plugins.Haptics.impact({ style: style.toUpperCase() });
      return;
    } catch (e) { /* fallback нижче */ }
  }
  navigator.vibrate?.(style === 'heavy' ? 20 : 10);
}

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
