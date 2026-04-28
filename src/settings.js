import { STORAGE_KEYS, Storage }        from './storage.js';
import { applyTheme }           from './theme.js';
import { getFavs, getExitFavs, saveFavs, updateFavDock } from './favorites.js';
import { isCheckinMode, getCheckins, updateCheckinDock, invalidateCheckinsCache } from './checkin.js';
import { state }                from './state.js';

// ⚠️ Логіка тумблерів (pointer-events + клік по всій картці) — збережено без змін!
export function openSettingsSheet() {
  MetroApp.pushSheetHistory(); // <--- ДОДАНО
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
      themeToggle.checked = (Storage.get(STORAGE_KEYS.THEME) || 'dark') === 'dark';
      themeToggle.addEventListener('change', e => applyTheme(e.target.checked ? 'dark' : 'light'));
    }

    // ── Стартувати з Обраного ──
    const startFavToggle = document.getElementById('settingsStartFavToggle');
    if (startFavToggle) {
      startFavToggle.checked = Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true';
      startFavToggle.addEventListener('change', e =>
        Storage.set(STORAGE_KEYS.START_ON_FAV, e.target.checked)
      );
    }

    // ── Зміни працюють локально ──
    const localFbToggle = document.getElementById('settingsLocalFeedbackToggle');
    if (localFbToggle) {
      localFbToggle.checked = Storage.get(STORAGE_KEYS.LOCAL_ONLY_FEEDBACK) === 'true';
      localFbToggle.addEventListener('change', e =>
        Storage.set(STORAGE_KEYS.LOCAL_ONLY_FEEDBACK, e.target.checked)
      );
    }

    // ── Кнопка «i» (Довідка Локальних змін) ──
    function closeAllSettingsHints() {
      settingsSheet.querySelectorAll('.settings-hint').forEach(h => { h.hidden = true; });
      settingsSheet.querySelectorAll('.settings-info-btn').forEach(b => { b.classList.remove('settings-info-btn-active'); });
    }

    document.getElementById('settingsLocalFeedbackInfo')?.addEventListener('click', e => {
      e.stopPropagation();
      const hint = document.getElementById('settingsLocalFeedbackHint');
      const btn  = document.getElementById('settingsLocalFeedbackInfo');
      if (!hint) return;
      const wasOpen = !hint.hidden;
      closeAllSettingsHints();
      if (!wasOpen) {
        hint.hidden = false;
        btn.classList.add('settings-info-btn-active');
      }
    });

    // ── Check-in ──
    const checkinToggle = document.getElementById('settingsCheckinToggle');
    if (checkinToggle) {
      checkinToggle.checked = isCheckinMode();
      checkinToggle.addEventListener('change', e => {
        Storage.set(STORAGE_KEYS.CHECKIN_MODE, e.target.checked);
        updateCheckinDock();

        const currentSlug = document.getElementById('stationSheet').classList.contains('sheet-open')
          ? (state.currentStationSlug ?? null)
          : null;

        if (currentSlug) {
          const stData  = state.stationsData;
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
      const wasOpen = !hint.hidden;
      closeAllSettingsHints();
      if (!wasOpen) {
        hint.hidden = false;
        btn.classList.add('settings-info-btn-active');
      }
    });

    // ── Очистити Вибране ──
    document.getElementById('settingsClearFavs')?.addEventListener('click', e => {
      e.stopPropagation();
      if (e.currentTarget.disabled) {
        MetroApp.showCustomConfirm('<span style="font-variant: small-caps; letter-spacing: 0.04em;">Вибраного</span> немає', () => {}, null, null, 'Зрозуміло', '', 'confirm-btn-save', '');
        return;
      }
      MetroApp.showCustomConfirm('Очистити <span style="font-variant: small-caps; letter-spacing: 0.04em;">Вибране</span>?',
        () => {
          saveFavs([]);
          Storage.remove(STORAGE_KEYS.EXIT_FAVS);
          updateFavDock();
          document.getElementById('settingsClose').click();
        },
        null, null, 'Очистити', 'Скасувати', 'confirm-btn-discard', 'confirm-btn-save'
      );
    });

    // ── Очистити Check-in ──
    document.getElementById('settingsClearCheckin')?.addEventListener('click', e => {
      e.stopPropagation();
      if (e.currentTarget.disabled) {
        MetroApp.showCustomConfirm('Список check-in порожній', () => {}, null, null, 'Зрозуміло', '', 'confirm-btn-save', '');
        return;
      }
      MetroApp.showCustomConfirm('Очистити історію check-in?',
        () => {
          Storage.remove(STORAGE_KEYS.CHECKINS);
          invalidateCheckinsCache(); // ← скидаємо кеш явно, щоб наступний getCheckins() зчитав свіжі дані
          updateCheckinDock();
          document.getElementById('settingsClose').click();
        },
        null, null, 'Очистити', 'Скасувати', 'confirm-btn-discard', 'confirm-btn-save'

      );
    });

    // ── Очистити Check-in ──
    document.getElementById('settingsClearCheckin')?.addEventListener('click', e => {
      e.stopPropagation();
      if (e.currentTarget.disabled) {
        MetroApp.showCustomConfirm('Список check-in порожній', () => {}, null, null, 'Зрозуміло', '', 'confirm-btn-save', '');
        return;
      }
      MetroApp.showCustomConfirm('Очистити історію check-in?',
        () => {
          Storage.remove(STORAGE_KEYS.CHECKINS);
          invalidateCheckinsCache(); // ← скидаємо кеш явно, щоб наступний getCheckins() зчитав свіжі дані
          updateCheckinDock();
          document.getElementById('settingsClose').click();
        },
        null, null, 'Очистити', 'Скасувати', 'confirm-btn-discard', 'confirm-btn-save'
      );
    });

    // ── Очистити локальні зміни (ВСТАВЛЯЙ СЮДИ) ──
    document.getElementById('settingsClearLocalEdits')?.addEventListener('click', e => {
      e.stopPropagation();
      if (e.currentTarget.disabled) return;
      
      MetroApp.showCustomConfirm('Видалити всі локальні зміни (назви виходів, закриті двері)?',
        () => {
          Storage.remove(STORAGE_KEYS.LOCAL_EDITS);
          Storage.remove(STORAGE_KEYS.EXIT_LABELS);
          document.getElementById('settingsClose').click();
          setTimeout(() => window.location.reload(), 300);
        },
        null, null, 'Очистити', 'Скасувати', 'confirm-btn-discard', 'confirm-btn-save'
      );
    });

    // ==========================================
    // ── Очистити локальні зміни (ВСТАВИТИ ЦЕ) ──
    // ==========================================
    document.getElementById('settingsClearLocalEdits')?.addEventListener('click', e => {
      e.stopPropagation();
      
      MetroApp.showCustomConfirm('Видалити всі локальні зміни (назви виходів, закриті двері)?',
        () => {
          Storage.remove(STORAGE_KEYS.LOCAL_EDITS);
          Storage.remove(STORAGE_KEYS.EXIT_LABELS);
          
          // Закриваємо налаштування і перезавантажуємо сторінку, 
          // щоб карта і всі станції перемалювалися з чистими даними
          document.getElementById('settingsClose').click();
          setTimeout(() => window.location.reload(), 300);
        },
        null, null, 'Очистити', 'Скасувати', 'confirm-btn-discard', 'confirm-btn-save'
      );
    });
    // ==========================================

    settingsSheet.querySelectorAll('.settings-card').forEach(card => {
      card.addEventListener('click', e => {
        // Нижня частина картки (нижче роздільника) — тумблер не тригеримо
        const inBottomArea = !!e.target.closest('.settings-actions, .settings-rule, .settings-hint');
        if (inBottomArea) {
          // Ліва половина нижньої частини → відкриваємо довідку
          // (якщо клік не на кнопці — симулюємо натискання i-кнопки)
          if (!e.target.closest('button, a')) {
            const cardRect  = card.getBoundingClientRect();
            const isLeftHalf = e.clientX < cardRect.left + cardRect.width / 2;
            if (isLeftHalf) {
              card.querySelector('.settings-info-btn')?.click();
            }
          }
          return; // тумблер не чіпаємо
        }
        if (e.target.closest('button, a')) return;
        e.preventDefault();
        const input = card.querySelector('input[type="checkbox"]');
        if (input) {
          input.checked = !input.checked;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    // Кінематичний свайп
    MetroApp.initKinematicSwipe(settingsSheet, settingsSheet.querySelector('.sheet-body'), () => {
      document.getElementById('settingsClose').click();
    });

    // ── Експорт (Збереження у файл) ──
    document.getElementById('settingsExport')?.addEventListener('click', e => {
      e.stopPropagation();
      try {
        const allData = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          allData[key] = localStorage.getItem(key);
        }
        const dataStr = JSON.stringify(allData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `KyivMetroGO_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        MetroApp.showCustomConfirm?.('Не вдалося створити файл резервної копії.', () => {});
      }
    });

    // ── Імпорт (Відновлення з файлу) ──
    document.getElementById('settingsImport')?.addEventListener('click', e => {
      e.stopPropagation();
      // Створюємо input щоразу наново — єдиний надійний спосіб викликати
      // системний файловий picker на iOS/Android без затримок та обмежень безпеки.
      const input = document.createElement('input');
      input.type   = 'file';
      input.accept = '.json';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.addEventListener('change', () => {
        const file = input.files[0];
        document.body.removeChild(input);
        if (!file) return;
        MetroApp.showCustomConfirm(
          'Відновити дані з цього файлу? Поточні налаштування, Вибране та Check-in будуть замінені.',
          () => {
            const reader = new FileReader();
            reader.onload = function(ev) {
              try {
                const importedData = JSON.parse(ev.target.result);
                if (!importedData[STORAGE_KEYS.FAVS] && !importedData['metro_favs']) {
                  throw new Error('Invalid backup file');
                }
                localStorage.clear();
                for (const key in importedData) {
                  localStorage.setItem(key, importedData[key]);
                }
                window.location.reload();
              } catch (err) {
                MetroApp.showCustomConfirm?.('Помилка: файл пошкоджений або не є резервною копією KyivMetroGO.', () => {});
              }
            };
            reader.readAsText(file);
          },
          null, null,
          'Відновити', 'Скасувати',
          'confirm-btn-save', 'confirm-btn-discard'
        );
      });

      input.click();
    });
  }

// Синхронізуємо стан тумблерів при кожному відкритті — незалежно від того,
  // чи sheet тільки створено, чи відкривається повторно.
  function syncToggles() {
    const t = document.getElementById('settingsThemeToggle');
    const s = document.getElementById('settingsStartFavToggle');
    const c = document.getElementById('settingsCheckinToggle');
    const l = document.getElementById('settingsLocalFeedbackToggle');
    if (t) t.checked = (Storage.get(STORAGE_KEYS.THEME) || 'dark') === 'dark';
    if (s) s.checked = Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true';
    if (c) c.checked = isCheckinMode();
    if (l) l.checked = Storage.get(STORAGE_KEYS.LOCAL_ONLY_FEEDBACK) === 'true';

    // Стан кнопок «Очистити» — вимикаємо якщо нема чого чистити
    const hasFavs     = getExitFavs().length > 0 || getFavs().length > 0;
    const hasCheckins = Object.keys(getCheckins()).length > 0;
    const editsData   = Storage.get(STORAGE_KEYS.LOCAL_EDITS);
    const labelsData  = Storage.get(STORAGE_KEYS.EXIT_LABELS);
    const hasEdits    = (editsData && editsData !== '{}') || (labelsData && labelsData !== '{}');

    const clearFavsBtn     = document.getElementById('settingsClearFavs');
    const clearCheckinBtn  = document.getElementById('settingsClearCheckin');
    const clearLocalBtn    = document.getElementById('settingsClearLocalEdits');

    if (clearFavsBtn)    clearFavsBtn.disabled    = !hasFavs;
    if (clearCheckinBtn) clearCheckinBtn.disabled = !hasCheckins;
    if (clearLocalBtn)   clearLocalBtn.disabled   = !hasEdits;
  }
  syncToggles();

  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  settingsSheet.classList.add('sheet-open');
  sheetOverlay.classList.add('overlay-visible');
}