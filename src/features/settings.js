import { STORAGE_KEYS, Storage }   from '../core/storage.js';
import { applyTheme }              from '../ui/theme.js';
import { getFavs, getExitFavs, saveFavs, updateFavDock } from './favorites.js';
import { isCheckinMode, getCheckins, updateCheckinDock, invalidateCheckinsCache } from './checkin.js';
import { state }                   from '../core/state.js';
import { isDevMode, getDevLog }    from './devmode.js';
import { bus }                     from '../core/eventBus.js';
import { BackupService }           from '../services/backup.js';

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

    // ── Стартовий екран (Сегментований) ──
    const startSegButtons = document.querySelectorAll('#settingsStartSeg .settings-seg-btn');
    if (startSegButtons.length > 0) {
      startSegButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.startVal;
          Storage.set(STORAGE_KEYS.START_ON_FAV, val);
          
          startSegButtons.forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          
          if (val === 'true') MetroApp.dismissFavOnlyHint?.();
        });
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

    // ── Check-in Головний ──
    const checkinToggle = document.getElementById('settingsCheckinToggle');
    if (checkinToggle) {
      checkinToggle.checked = isCheckinMode();
      checkinToggle.addEventListener('change', e => {
        const isMainOn = e.target.checked;
        // Показуємо/приховуємо решту блоку
        const collapsible = document.getElementById('settingsCheckinCollapsible');
        collapsible?.classList.toggle('is-hidden', !isMainOn);
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
    
    // ── Приховати інформаційні блоки ──
    const hideInfoToggle = document.getElementById('settingsHideInfoToggle');
    if (hideInfoToggle) {
      hideInfoToggle.checked = Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true';
      hideInfoToggle.addEventListener('change', e =>
        Storage.set(STORAGE_KEYS.HIDE_INFO_BLOCKS, e.target.checked)
      );
    }

    // ── Очистити Вибране ──
    document.getElementById('settingsClearFavs')?.addEventListener('click', e => {
      e.stopPropagation();
      if (e.currentTarget.disabled) {
        MetroApp.showCustomConfirm('<span style="font-variant: small-caps; letter-spacing: 0.04em;">Вибраного</span> немає', () => {}, null, null, 'Зрозуміло', '', 'confirm-btn-neutral', '');
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
        MetroApp.showCustomConfirm('Список check-in порожній', () => {}, null, null, 'Зрозуміло', '', 'confirm-btn-neutral', '');
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
        MetroApp.showCustomConfirm('Дані користувача відсутні', () => {}, null, null, 'Зрозуміло', '', 'confirm-btn-neutral', '');
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

// ── Dropdown «Очистити дані» ──
    const clearDataRow      = settingsSheet.querySelector('#clearDataRow');
    const clearDataDropdown = settingsSheet.querySelector('#clearDataDropdown');
    const clearDataChevron  = settingsSheet.querySelector('#clearDataChevron');

    clearDataRow?.addEventListener('click', () => {
      const isOpen = clearDataDropdown.classList.toggle('open');
      clearDataChevron.classList.toggle('open', isOpen);
    });

    settingsSheet.querySelectorAll('.settings-card').forEach(card => {      card.addEventListener('click', e => {
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

    // ── Експорт ──
    document.getElementById('settingsExport')?.addEventListener('click', e => {
      e.stopPropagation();
      try {
        BackupService.exportData({
          devLog: isDevMode() ? getDevLog() : null,
        });
      } catch {
        bus.emit('ui:confirm', {
          message:  'Не вдалося створити файл резервної копії.',
          onYes:    () => {},
          labelYes: 'Зрозуміло',
          styleYes: 'confirm-btn-save',
        });
      }
    });

    // ── Імпорт ──
    document.getElementById('settingsImport')?.addEventListener('click', async e => {
      e.stopPropagation();
      const result = await BackupService.pickAndValidateBackup();

      if (result.status === 'cancelled') return;

      if (result.status === 'invalid' || result.status === 'error') {
        bus.emit('ui:confirm', {
          message:  result.reason ?? 'Не вдалося прочитати файл.',
          onYes:    () => {},
          labelYes: 'Зрозуміло',
          styleYes: 'confirm-btn-save',
        });
        return;
      }

      // status === 'success': просимо підтвердження перед записом
      bus.emit('ui:confirm', {
        message:  'Відновити дані з цього файлу? Поточні налаштування, Вибране та Check-in будуть замінені.',
        onYes:    () => BackupService.restoreAndReload(result.data),
        onNo:     () => {},
        labelYes: 'Відновити',
        labelNo:  'Скасувати',
        styleYes: 'confirm-btn-save',
        styleNo:  'confirm-btn-discard',
      });
    });
  }

  function syncToggles() {
    const isMainOn = isCheckinMode();
    const collapsible = document.getElementById('settingsCheckinCollapsible');
    if (collapsible) collapsible.classList.toggle('is-hidden', !isCheckinMode());
    const hatchTgl = document.getElementById('settingsCheckinHatchToggle');
    if (hatchTgl) hatchTgl.checked = Storage.get(STORAGE_KEYS.CHECKIN_HATCH) !== 'false';

    // Синхронізація нового сегментованого старту
    const savedStart = Storage.get(STORAGE_KEYS.START_ON_FAV) === 'true' ? 'true' : 'false';
    document.querySelectorAll('#settingsStartSeg .settings-seg-btn').forEach(btn =>
      btn.classList.toggle('is-active', btn.dataset.startVal === savedStart)
    );

    const savedStat = Storage.get(STORAGE_KEYS.CHECKIN_BY_STATION) || 'station';
    document.querySelectorAll('#settingsCheckinStatSeg .settings-seg-btn').forEach(btn =>
      btn.classList.toggle('is-active', btn.dataset.statVal === savedStat)
    );
    
    const c = document.getElementById('settingsCheckinToggle');
    const l = document.getElementById('settingsLocalFeedbackToggle');
    const h = document.getElementById('settingsHideInfoToggle');
    
    if (c) c.checked = isMainOn;
    if (l) l.checked = Storage.get(STORAGE_KEYS.LOCAL_ONLY_FEEDBACK) === 'true';
    if (h) h.checked = Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true';

    const clearFavsBtn    = document.getElementById('settingsClearFavs');
    const clearCheckinBtn = document.getElementById('settingsClearCheckin');
    const clearLocalBtn   = document.getElementById('settingsClearLocalEdits');

    const hasFavs     = getExitFavs().length > 0 || getFavs().length > 0;
    const hasCheckins = Object.keys(getCheckins()).length > 0;
    const hasAnyData  = BackupService.hasUserData(); 

    if (clearFavsBtn)    clearFavsBtn.disabled    = !hasFavs;
    if (clearCheckinBtn) clearCheckinBtn.disabled = !hasCheckins;
    if (clearLocalBtn)   clearLocalBtn.disabled   = !hasAnyData;
  }
  
  syncToggles();

  document.querySelectorAll('.station-sheet').forEach(el => el.classList.remove('sheet-open'));
  settingsSheet.classList.add('sheet-open');
  sheetOverlay.classList.add('overlay-visible');
}