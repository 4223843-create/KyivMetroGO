import { STORAGE_KEYS }        from './storage.js';
import { applyTheme }           from './theme.js';
import { saveFavs, updateFavDock } from './favorites.js';
import { isCheckinMode, updateCheckinDock } from './checkin.js';

// ⚠️ Логіка тумблерів (pointer-events + клік по всій картці) — збережено без змін!
export function openSettingsSheet() {
  const sheetOverlay = document.getElementById('sheetOverlay');
  let settingsSheet  = document.getElementById('settingsSheet');

  if (!settingsSheet) {
    settingsSheet = document.createElement('div');
    settingsSheet.id        = 'settingsSheet';
    settingsSheet.className = 'station-sheet settings-station-sheet';
    const tpl = document.getElementById('tpl-settings-sheet');
    settingsSheet.appendChild(tpl.content.cloneNode(true));
    document.body.appendChild(settingsSheet);

    // ── Закрити ──
    document.getElementById('settingsClose').addEventListener('click', () => {
      MetroApp.animateSheetClose(settingsSheet, () => {
        settingsSheet.classList.remove('sheet-open');
        if (!document.querySelectorAll('.station-sheet.sheet-open').length)
          sheetOverlay.classList.remove('overlay-visible');
      });
    });

    // ── Тема ──
    const themeToggle = document.getElementById('settingsThemeToggle');
    if (themeToggle) {
      themeToggle.checked = (localStorage.getItem(STORAGE_KEYS.THEME) || 'dark') === 'dark';
      themeToggle.addEventListener('change', e => applyTheme(e.target.checked ? 'dark' : 'light'));
    }

    // ── Стартувати з Обраного ──
    const startFavToggle = document.getElementById('settingsStartFavToggle');
    if (startFavToggle) {
      startFavToggle.checked = localStorage.getItem(STORAGE_KEYS.START_ON_FAV) === 'true';
      startFavToggle.addEventListener('change', e =>
        localStorage.setItem(STORAGE_KEYS.START_ON_FAV, e.target.checked)
      );
    }

    // ── Check-in ──
    const checkinToggle = document.getElementById('settingsCheckinToggle');
    if (checkinToggle) {
      checkinToggle.checked = isCheckinMode();
      checkinToggle.addEventListener('change', e => {
        localStorage.setItem(STORAGE_KEYS.CHECKIN_MODE, e.target.checked);
        updateCheckinDock();

        const { state }       = window._metroState || {};
        const currentSlug = document.getElementById('stationSheet').classList.contains('sheet-open')
          ? (state?.currentStationSlug ?? null)
          : null;

        if (currentSlug) {
          const stData  = MetroApp.currentStationsData;
          const color   = MetroApp.LINE_COLOR[stData?.[currentSlug]?.line] || 'var(--text-muted)';
          const sheet   = document.getElementById('stationSheet');
          sheet.querySelector('.row-checkin-btn')?.remove();
          if (e.target.checked) MetroApp.attachCheckinButtons?.(sheet, currentSlug, color);
        }
      });
    }

    // ── Кнопка «i» (Довідка Check-in) ──
    document.getElementById('settingsCheckinInfo')?.addEventListener('click', e => {
      e.stopPropagation();
      const hint = document.getElementById('settingsCheckinHint');
      const btn  = document.getElementById('settingsCheckinInfo');
      if (!hint) return;
      hint.hidden = !hint.hidden;
      btn.classList.toggle('settings-info-btn-active', !hint.hidden);
    });

    // ── Очистити Вибране ──
    document.getElementById('settingsClearFavs')?.addEventListener('click', e => {
      e.stopPropagation();
      MetroApp.showCustomConfirm('Очистити „Вибране"?',
        () => {
          saveFavs([]);
          localStorage.removeItem(STORAGE_KEYS.EXIT_FAVS);
          updateFavDock();
          document.getElementById('settingsClose').click();
        },
        null, null, 'Очистити', 'Скасувати', '', ''
      );
    });

    // ── Очистити Check-in ──
    document.getElementById('settingsClearCheckin')?.addEventListener('click', e => {
      e.stopPropagation();
      MetroApp.showCustomConfirm('Очистити історію check-in?',
        () => {
          localStorage.removeItem(STORAGE_KEYS.CHECKINS);
          // скидаємо кеш через оновлення DOM
          updateCheckinDock();
          document.getElementById('settingsClose').click();
        },
        null, null, 'Очистити', 'Скасувати', '', ''
      );
    });

    // ── Клік по картці перемикає тумблер ──
    // ⚠️ Логіка pointer-events збережена!
    settingsSheet.querySelectorAll('.settings-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('button, a')) return;
        e.preventDefault();
        const input = card.querySelector('input[type="checkbox"]');
        if (input) {
          input.checked = !input.checked;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    // ── Свайп вниз ──
    let swY = 0, isSwipeSettings = false;
    settingsSheet.addEventListener('touchstart', e => {
      swY = e.touches[0].clientY;
      isSwipeSettings = !!e.target.closest('.sheet-handle-bar');
    }, { passive: true });
    settingsSheet.addEventListener('touchend', e => {
      if (isSwipeSettings && e.changedTouches[0].clientY - swY > 60)
        document.getElementById('settingsClose').click();
    });

  } else {
    // Оновлюємо стан тумблерів при повторному відкритті
    const t = document.getElementById('settingsThemeToggle');
    const s = document.getElementById('settingsStartFavToggle');
    const c = document.getElementById('settingsCheckinToggle');
    if (t) t.checked = (localStorage.getItem(STORAGE_KEYS.THEME) || 'dark') === 'dark';
    if (s) s.checked = localStorage.getItem(STORAGE_KEYS.START_ON_FAV) === 'true';
    if (c) c.checked = isCheckinMode();
  }

  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  settingsSheet.classList.add('sheet-open');
  sheetOverlay.classList.add('overlay-visible');
}
