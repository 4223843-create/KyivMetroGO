import { STORAGE_KEYS, Storage }        from '../core/storage.js';
import { applyTheme }           from '../ui/theme.js';
import { getFavs, getExitFavs, saveFavs, updateFavDock } from './favorites.js';
import { isCheckinMode, getCheckins, updateCheckinDock, invalidateCheckinsCache } from './checkin.js';
import { state }                from '../core/state.js';
import { isDevMode, getDevLog } from './devmode.js';

function showCheckinLockToast(rowEl) {
  const existing = document.getElementById('checkinLockToast');
  if (existing) return;

  const rect = rowEl.getBoundingClientRect(); 
  const toast = document.createElement('div');
  toast.id = 'checkinLockToast';
  toast.className = 'dev-mode-toast dev-mode-toast-open';
  
  toast.style.cssText = `
    position: fixed;
    top: ${rect.top - 45}px; 
    left: 50%;
    transform: translateX(-50%);
    bottom: auto;
    z-index: 10000;
  `;
  
  toast.innerHTML = 'Спершу активуйте режим <span style="font-variant: small-caps; letter-spacing: 0.04em;">Check-in</span>';
  
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('dev-mode-toast-open');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

export function openSettingsSheet() {
  MetroApp.pushSheetHistory();
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

document.getElementById('settingsThemeSeg')?.querySelectorAll('.settings-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.themeVal));
    });
    applyTheme(null, false); // ініціалізуємо активну кнопку

    const startFavToggle = document.getElementById('settingsStartFavToggle');
    if (startFavToggle) {
      startFavToggle.checked = Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true';
      startFavToggle.addEventListener('change', e => {
        Storage.set(STORAGE_KEYS.START_ON_FAV, e.target.checked);
        if (e.target.checked) MetroApp.dismissFavOnlyHint?.();
      });
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

    // ── Check-in Головний ──
    const checkinToggle = document.getElementById('settingsCheckinToggle');
    if (checkinToggle) {
      checkinToggle.checked = isCheckinMode();
      checkinToggle.addEventListener('change', e => {
        const isMainOn = e.target.checked;
        Storage.set(STORAGE_KEYS.CHECKIN_MODE, isMainOn);
        updateCheckinDock();

        const hatchToggle = document.getElementById('settingsCheckinHatchToggle');

        if (isMainOn && hatchToggle) {
          // Автоматично вмикаємо штриховку при увімкненні чекіну
          Storage.set(STORAGE_KEYS.CHECKIN_HATCH, 'true');
          hatchToggle.checked = true;
        }

        const currentSlug = document.getElementById('stationSheet').classList.contains('sheet-open')
          ? (state.currentStationSlug ?? null)
          : null;

        if (currentSlug) {
          const stData  = state.stationsData;
          const color   = MetroApp.LINE_COLOR[stData?.[currentSlug]?.line] || 'var(--text-muted)';
          const sheet   = document.getElementById('stationSheet');
          sheet.querySelector('.row-checkin-btn')?.remove();
          if (isMainOn) MetroApp.attachCheckinButtons?.(sheet, currentSlug, color);
        }
        
        // Оновлюємо карту
        MetroApp.syncMapWithCheckins?.();
      });
    }

    // ── Check-in Штриховка (НОВИЙ БЛОК) ──
    const hatchToggle = document.getElementById('settingsCheckinHatchToggle');
    if (hatchToggle) {
      hatchToggle.checked = Storage.get(STORAGE_KEYS.CHECKIN_HATCH) !== 'false';
      hatchToggle.addEventListener('change', e => {
        Storage.set(STORAGE_KEYS.CHECKIN_HATCH, e.target.checked);
        MetroApp.syncMapWithCheckins?.();
      });
    }

    // ── Check-in по виходам ──
const statSeg = document.getElementById('settingsCheckinStatSeg');
    if (statSeg) {
      const initStat = Storage.get(STORAGE_KEYS.CHECKIN_BY_STATION) || 'station';
      statSeg.querySelectorAll('.settings-seg-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.statVal === initStat);
        btn.addEventListener('click', () => {
          Storage.set(STORAGE_KEYS.CHECKIN_BY_STATION, btn.dataset.statVal);
          statSeg.querySelectorAll('.settings-seg-btn').forEach(b =>
            b.classList.toggle('is-active', b === btn)
          );
        });
      });
    }
    // ── ОБ'ЄДНАНА Кнопка «i» (Довідка Check-in) ──
    document.getElementById('settingsCheckinCombinedInfo')?.addEventListener('click', e => {
      e.stopPropagation();
      const hint = document.getElementById('settingsCheckinCombinedHint');
      const btn  = document.getElementById('settingsCheckinCombinedInfo');
      if (!hint || !btn) return;
      
      const wasOpen = !hint.hidden;
      closeAllSettingsHints(); 
      
      if (!wasOpen) {
        hint.hidden = false;
        btn.classList.add('settings-info-btn-active');
      }
    });

    // ── Приховати інформаційні блоки ──
    const hideInfoToggle = document.getElementById('settingsHideInfoToggle');
    if (hideInfoToggle) {
      hideInfoToggle.checked = Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true';
      hideInfoToggle.addEventListener('change', e =>
        Storage.set(STORAGE_KEYS.HIDE_INFO_BLOCKS, e.target.checked)
      );
    }

    // ── Кнопка «i» (Довідка Приховати блоки) ──
    document.getElementById('settingsHideInfoBtn')?.addEventListener('click', e => {
      e.stopPropagation();
      const hint = document.getElementById('settingsHideInfoHint');
      const btn  = document.getElementById('settingsHideInfoBtn');
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
          setTimeout(() => document.getElementById('settingsClose').click(), 180);
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
          invalidateCheckinsCache();
          updateCheckinDock();
          setTimeout(() => document.getElementById('settingsClose').click(), 180);
        },
        null, null, 'Очистити', 'Скасувати', 'confirm-btn-discard', 'confirm-btn-save'
      );
    });

    // ── Очистити локальні зміни ──
    document.getElementById('settingsClearLocalEdits')?.addEventListener('click', e => {
      e.stopPropagation();
      if (e.currentTarget.disabled) {
        MetroApp.showCustomConfirm('Дані користувача відсутні', () => {}, null, null, 'Зрозуміло', '', 'confirm-btn-save', '');
        return;
      }
      MetroApp.showCustomConfirm('Очистити всі дані користувача (<span style="font-variant:small-caps;letter-spacing:0.04em">Вибране</span>, <span style="font-variant:small-caps;letter-spacing:0.04em">Check-in</span>, назви виходів)?',
        () => {
          // Чистимо лише користувацькі ключі
          Storage.remove(STORAGE_KEYS.FAVS);
          Storage.remove(STORAGE_KEYS.EXIT_FAVS);
          Storage.remove(STORAGE_KEYS.CHECKINS);
          Storage.remove(STORAGE_KEYS.LOCAL_EDITS);
          Storage.remove(STORAGE_KEYS.EXIT_LABELS);
          Storage.remove(STORAGE_KEYS.FAV_ROWS_ORDER);
          
          setTimeout(() => {
            document.getElementById('settingsClose').click();
            setTimeout(() => window.location.reload(), 300);
          }, 180);
        },
        null, null, 'Очистити', 'Скасувати', 'confirm-btn-discard', 'confirm-btn-save'
      );
    });

    settingsSheet.querySelectorAll('.settings-card').forEach(card => {
      card.addEventListener('click', e => {
        const inBottomArea = !!e.target.closest('.settings-actions, .settings-rule, .settings-hint');
        if (inBottomArea) {
          if (!e.target.closest('button, a')) {
            const cardRect  = card.getBoundingClientRect();
            if (e.clientX < cardRect.left + cardRect.width / 2) {
              card.querySelector('.settings-info-btn')?.click();
            }
          }
          return;
        }

        if (e.target.closest('button, a')) return;

        const row = e.target.closest('.settings-row');
        if (!row) return;

        const isExitsRow = row.id === 'checkinExitsRow';
        const isMainOn = document.getElementById('settingsCheckinToggle')?.checked;

        if (isExitsRow && !isMainOn) {
          e.preventDefault();
          showCheckinLockToast(row);
          return;
        }

        e.preventDefault();
        const input = row.querySelector('input[type="checkbox"]');
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

        if (isDevMode()) {
          const log = getDevLog();
          if (log.length > 0) {
            allData['═══════════════════════════════════════════════════════════'] =
              '══ ЛОГ ЗМІН — РЕЖИМ РОЗРОБНИКА ══';
            allData['_dev_change_log'] = log.map(entry => ({
              час:     new Date(entry.ts).toLocaleString('uk-UA'),
              станція: entry.station,
              slug:    entry.slug,
              напрям:  entry.dir   || '—',
              вихід:   entry.exit  || '—',
              поле:    entry.field || '—',
              було:    entry.from  ?? '—',
              стало:   entry.to    ?? '—',
            }));
          }
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

function syncToggles() {
    const isMainOn = isCheckinMode();
    
    const hatchTgl = document.getElementById('settingsCheckinHatchToggle');
    if (hatchTgl) hatchTgl.checked = Storage.get(STORAGE_KEYS.CHECKIN_HATCH) !== 'false';

const s = document.getElementById('settingsStartFavToggle');
const savedStat = Storage.get(STORAGE_KEYS.CHECKIN_BY_STATION) || 'station';
    document.querySelectorAll('#settingsCheckinStatSeg .settings-seg-btn').forEach(btn =>
      btn.classList.toggle('is-active', btn.dataset.statVal === savedStat)
    );
    const c = document.getElementById('settingsCheckinToggle');
    const l = document.getElementById('settingsLocalFeedbackToggle');
    const h = document.getElementById('settingsHideInfoToggle');
    
    if (s) s.checked = Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true';
    if (c) c.checked = isMainOn;
    if (l) l.checked = Storage.get(STORAGE_KEYS.LOCAL_ONLY_FEEDBACK) === 'true';
    if (h) h.checked = Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true';

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
    if (clearLocalBtn)   clearLocalBtn.disabled   = !(hasFavs || hasCheckins || hasEdits);
  }
  syncToggles();

  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  settingsSheet.classList.add('sheet-open');
  sheetOverlay.classList.add('overlay-visible');
}