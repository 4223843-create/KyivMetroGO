// ══ СИСТЕМНІ UI-УТИЛІТИ ══
// Відповідальність: налаштування Edge-to-edge для мобільних пристроїв через Capacitor.

import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

/**
 * Налаштовує edge-to-edge режим для мобільного додатку.
 * Робить статус-бар повністю прозорим (оверлеєм), щоб макет карти
 * та шторки плавно затікали під системну панель годинника.
 * @returns {Promise<void>}
 */
export async function configureEdgeToEdge() {
  // 1. Якщо це звичайний браузер (не Android/iOS) — просто виходимо, 
  // щоб не викликати помилку "plugin is not implemented on web"
  if (!Capacitor.isNativePlatform()) {
    return; 
  }

  // 2. Якщо це нативний пристрій — налаштовуємо StatusBar
  try {
    // Вмикаємо прозорий оверлей для Android/iOS
    await StatusBar.setOverlaysWebView({ overlay: true });
    
    // Встановлюємо початковий стиль іконок залежно від системної теми
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    await StatusBar.setStyle({ style: isDark ? Style.Dark : Style.Light });
  } catch (err) {
    console.warn('[KyivMetroGO] StatusBar plugin error:', err);
  }
}

/**
 * Додає стан у History API перед відкриттям шторки.
 * Дозволяє кнопці «назад» на Android закривати шторку замість виходу з додатку.
 */
export function pushSheetHistory() {
  if (!history.state?.isSheetOpen) {
    history.pushState({ isSheetOpen: true }, '');
  }
}