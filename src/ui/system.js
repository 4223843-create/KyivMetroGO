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
    
    // Встановлюємо початковий стиль іконок залежно від теми
    await syncSystemBars(document.documentElement.getAttribute('data-theme'));
  } catch (err) {
    console.warn('[KyivMetroGO] StatusBar plugin error:', err);
  }
}

/**
 * Узгоджує системну панель з темою застосунку, зокрема коли тему обрано
 * вручну, всупереч системній. Нативно — колір іконок статус-бару; у PWA —
 * meta theme-color (колір статус-бару встановленого застосунку) = фон сторінки.
 * @param {'light'|'dark'} theme
 */
export async function syncSystemBars(theme) {
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setStyle({ style: theme === 'dark' ? Style.Dark : Style.Light });
    } catch (err) {
      console.warn('[KyivMetroGO] StatusBar plugin error:', err);
    }
    return;
  }
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (!bg) return;
  document.querySelectorAll('meta[name="theme-color"]').forEach(meta => {
    meta.setAttribute('content', bg);
  });
}

const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Додає стан у History API перед відкриттям шторки.
 * Дозволяє кнопці «назад» на Android закривати шторку замість виходу з додатку.
 */
export function pushSheetHistory() {
  // Нативно «Назад» обробляє App.backButton (спершу закриває шторки), тож запис в
  // історії там зайвий: інакше після закриття шторки ✕ перше «Назад» нічого не робить.
  if (Capacitor.isNativePlatform()) return;
  // На iPhone кнопки «Назад» немає, а зайвий запис вмикає свайп від лівого краю,
  // що відсуває весь екран і показує під ним знімок заставки.
  if (IS_IOS) return;
  if (!history.state?.isSheetOpen) {
    history.pushState({ isSheetOpen: true }, '');
  }
}