// ══ FEATURE: НАЛАШТУВАННЯ — UI-ШАР ══
// Відповідальність: відкриття шторки налаштувань, синхронізація тогглів,
// управління темою, check-in, резервними копіями та очищенням даних.

import { STORAGE_KEYS, Storage }   from '../core/storage.js';
import { getPref, setPref } from '../core/prefs.js';
import { LINE_COLOR }              from '../core/constants.js';
import { applyTheme }              from '../ui/theme.js';
import { initKinematicSwipe }      from '../ui/swipe.js';
import { showSheet, hideSheet }    from '../ui/sheetNav.js';
import { bus }                     from '../core/eventBus.js';
import { state }                   from '../core/state.js';
import { isDevMode, getDevLog }    from './devFlags.js';
import { BackupService }           from '../services/backup.js';

import {
  getFavs, getExitFavs, saveFavs, updateFavDock, clearExitFavs,
} from './favorites/index.js';
import {
  isCheckinMode, getCheckins, updateCheckinDock, invalidateCheckinsCache,
} from './checkin/index.js';

// ══ ТОСТ «CHECK-IN ЩЕ НЕ АКТИВНИЙ» ══════════════════════════

function showCheckinLockToast(rowEl) {
  const existing = document.getElementById('checkinLockToast');
  if (existing) return;

  const rect  = rowEl.getBoundingClientRect();
  const toast = document.createElement('div');
  toast.id        = 'checkinLockToast';
  toast.className = 'dev-mode-toast dev-mode-toast-open';
  toast.style.cssText = `
    position: fixed;
    top: ${rect.top - 45}px;
    left: 50%;
    transform: translateX(-50%);
    bottom: auto;
    z-index: 10000;
  `;
  toast.innerHTML = 'Спершу увімкніть режим <span style="font-variant: small-caps; letter-spacing: 0.04em;">Check-in</span>';
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('dev-mode-toast-open');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ══ ТОСТ-ПОЯСНЕННЯ ДО «ЗА 2 ГОД» ═════════════════════════════

function showHoursSoonToast(btnEl) {
  document.getElementById('hoursSoonToast')?.remove();
  const rect  = btnEl.getBoundingClientRect();
  const toast = document.createElement('div');
  toast.id        = 'hoursSoonToast';
  toast.className = 'dev-mode-toast dev-mode-toast-open';
  toast.style.cssText = `
    position: fixed;
    top: ${rect.top - 60}px;
    left: 50%;
    transform: translateX(-50%);
    bottom: auto;
    z-index: 10000;
    width: max-content;
    max-width: calc(100vw - 32px);
    text-align: center;
  `;
  toast.innerHTML = 'За 2 години до закриття<br>і впродовж 2 годин після відкриття';
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('dev-mode-toast-open');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ══ ВІДКРИТТЯ ШТОРКИ НАЛАШТУВАНЬ ══════════════════════════════

/** Відкриває шторку налаштувань. При першому виклику — ліниво створює DOM з template. */
export function openSettingsSheet() {
  let settingsSheet  = document.getElementById('settingsSheet');

  if (!settingsSheet) {
    settingsSheet = document.createElement('div');
    settingsSheet.id        = 'settingsSheet';
    settingsSheet.className = 'station-sheet settings-station-sheet';
    const tpl = document.getElementById('tpl-settings-sheet');
    settingsSheet.appendChild(tpl.content.cloneNode(true));
    document.body.appendChild(settingsSheet);

    // ── Тема ──
    document.getElementById('settingsThemeSeg')?.querySelectorAll('.settings-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => applyTheme(btn.dataset.themeVal));
    });
    applyTheme(null, false);

    // ── Стартовий екран ──
    const startSegButtons = document.querySelectorAll('#settingsStartSeg .settings-seg-btn');
    if (startSegButtons.length > 0) {
      startSegButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const val = btn.dataset.startVal;
          setPref('startOnFav', val === 'true');
          startSegButtons.forEach(b => b.classList.remove('is-active'));
          btn.classList.add('is-active');
          if (val === 'true') bus.emit('fav:dismiss-hint');
        });
      });
    }

    const editModeToggle = document.getElementById('settingsEditModeToggle');
    if (editModeToggle) {
      editModeToggle.checked = getPref('editMode');
      editModeToggle.addEventListener('change', e => {
        const isEditOn = e.target.checked;
        setPref('editMode', isEditOn);
        
        // Показуємо/приховуємо рядок "Локальні зміни"
        const localFbRow = document.getElementById('settingsLocalFbRow');
        if (localFbRow) localFbRow.classList.toggle('is-hidden', !isEditOn);
      });
    }




    // ── Інтервали руху та години роботи станції (панель годинника) ──
    const showIntervalsToggle = document.getElementById('settingsShowIntervalsToggle');
    if (showIntervalsToggle) {
      showIntervalsToggle.addEventListener('change', e => {
        setPref('showIntervals', e.target.checked);
        bus.emit('station:clock-settings');
      });
    }
    const morningToggle = document.getElementById('settingsMorningIntervalToggle');
    morningToggle?.addEventListener('change', e => {
      setPref('morningInterval', e.target.checked);
      bus.emit('station:clock-settings');
    });
    const hoursSeg = document.getElementById('settingsStationHoursSeg');
    hoursSeg?.querySelectorAll('.settings-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setPref('stationHours', btn.dataset.hoursVal);
        hoursSeg.querySelectorAll('.settings-seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
        bus.emit('station:clock-settings');
        if (btn.dataset.hoursVal === 'soon') showHoursSoonToast(btn);
      });
    });

    const hideNoLiftToggle = document.getElementById('settingsHideNoLiftToggle');
    if (hideNoLiftToggle) {
      hideNoLiftToggle.checked = getPref('hideNoLift');
      hideNoLiftToggle.addEventListener('change', e => {
        setPref('hideNoLift', e.target.checked);
        bus.emit('station:refresh');
      });
    }

    // ── Доступність на карті (ВИПРАВЛЕНО: винесено з закриття) ──
    const showMapAccToggle = document.getElementById('settingsShowMapAccessibilityToggle');
    if (showMapAccToggle) {
      showMapAccToggle.checked = getPref('showMapAccessibility');
      showMapAccToggle.addEventListener('change', e => {
        setPref('showMapAccessibility', e.target.checked);
        bus.emit('map:update-accessibility');
      });
    }

    // ── Показувати підйомники на станціях ──
    const showHoistsToggle = document.getElementById('settingsShowHoistsToggle');
    if (showHoistsToggle) {
      showHoistsToggle.checked = getPref('showHoists');
      showHoistsToggle.addEventListener('change', e => {
        setPref('showHoists', e.target.checked);
        bus.emit('station:refresh');
        bus.emit('map:update-accessibility');
      });
    }

    // ── Закрити ──
    document.getElementById('settingsClose').addEventListener('click', () => {
      hideSheet(settingsSheet);
    });

    // ── Check-in головний ──
    const checkinToggle = document.getElementById('settingsCheckinToggle');
    if (checkinToggle) {
      checkinToggle.checked = isCheckinMode();
      checkinToggle.addEventListener('change', e => {
        const isMainOn    = e.target.checked;
        const collapsible = document.getElementById('settingsCheckinCollapsible');
        collapsible?.classList.toggle('is-hidden', !isMainOn);
        setPref('checkinMode', isMainOn);
        updateCheckinDock();
        const currentSlug = document.getElementById('stationSheet').classList.contains('sheet-open')
          ? (state.currentStationSlug ?? null)
          : null;

        if (currentSlug) {
          const color = LINE_COLOR[state.stationsData?.[currentSlug]?.line] || 'var(--text-muted)';
          const sheet = document.getElementById('stationSheet');
          sheet.querySelector('.row-checkin-btn')?.remove();
          if (isMainOn) bus.emit('checkin:attach-buttons', { sheetEl: sheet, slug: currentSlug, color });
        }

        bus.emit('map:sync-checkins');
      });
    }

    // ── Check-in штриховка ──
    const hatchToggle = document.getElementById('settingsCheckinHatchToggle');
    if (hatchToggle) {
      hatchToggle.checked = Storage.get(STORAGE_KEYS.CHECKIN_HATCH) !== 'false';
      hatchToggle.addEventListener('change', e => {
        Storage.set(STORAGE_KEYS.CHECKIN_HATCH, String(e.target.checked));
        bus.emit('map:sync-checkins');
      });
    }

    // ── Check-in по виходах ──
    const statSeg = document.getElementById('settingsCheckinStatSeg');
    if (statSeg) {
      const initStat = getPref('checkinByStation');
      statSeg.querySelectorAll('.settings-seg-btn').forEach(btn => {
        btn.classList.toggle('is-active', btn.dataset.statVal === initStat);
        btn.addEventListener('click', () => {
          setPref('checkinByStation', btn.dataset.statVal);
          statSeg.querySelectorAll('.settings-seg-btn').forEach(b =>
            b.classList.toggle('is-active', b === btn)
          );
        });
      });
    }

    // Ініціалізація та збереження тумблера чекінів по виходах
    const checkinByExitToggle = document.getElementById('settingsCheckinByExitToggle');
    if (checkinByExitToggle) {
      // Тумблер «Check-in за попередньою станцією» — обернене значення checkinByExit
      checkinByExitToggle.checked = !getPref('checkinByExit');
      checkinByExitToggle.addEventListener('change', e => {
        setPref('checkinByExit', !e.target.checked);
      });
    }

    // ── Приховати інформаційні блоки ──
    // ── Локальні зміни: правки не надсилаються розробнику ──
    const localFbToggle = document.getElementById('settingsLocalFeedbackToggle');
    if (localFbToggle) {
      localFbToggle.addEventListener('change', e => {
        setPref('localOnlyFeedback', e.target.checked);
      });
    }

    const hideInfoToggle = document.getElementById('settingsHideInfoToggle');
    if (hideInfoToggle) {
      hideInfoToggle.checked = getPref('hideInfoBlocks');
      hideInfoToggle.addEventListener('change', e =>
        setPref('hideInfoBlocks', e.target.checked)
      );
    }

    // ── Очистити Вибране ──
    document.getElementById('settingsClearFavs')?.addEventListener('click', e => {
      e.stopPropagation();
      if (e.currentTarget.disabled) {
        bus.emit('ui:confirm', {
          message:  '<span style="font-variant: small-caps; letter-spacing: 0.04em;">Вибраного</span> немає',
          onYes:    () => {},
          labelYes: 'Зрозуміло',
          labelNo:  '',
          styleYes: 'confirm-btn-neutral',
          styleNo:  '',
        });
        return;
      }
      bus.emit('ui:confirm', {
        message: 'Очистити <span style="font-variant: small-caps; letter-spacing: 0.04em;">Вибране</span>?',
        onYes:   () => {
          saveFavs([]);
          clearExitFavs();
          updateFavDock();
          bus.emit('station:refresh');
          setTimeout(() => document.getElementById('settingsClose').click(), 180);
        },
        labelYes: 'Очистити',
        labelNo:  'Скасувати',
        styleYes: 'confirm-btn-discard',
        styleNo:  'confirm-btn-save',
      });
    });

    // ── Очистити Check-in ──
    document.getElementById('settingsClearCheckin')?.addEventListener('click', e => {
      e.stopPropagation();
      if (e.currentTarget.disabled) {
        bus.emit('ui:confirm', {
          message:  'Список Check-in порожній',
          onYes:    () => {},
          labelYes: 'Зрозуміло',
          labelNo:  '',
          styleYes: 'confirm-btn-neutral',
          styleNo:  '',
        });
        return;
      }
      bus.emit('ui:confirm', {
        message: 'Очистити історію Check-in?',
        onYes:   () => {
          Storage.remove(STORAGE_KEYS.CHECKINS);
          invalidateCheckinsCache();
          updateCheckinDock();
          bus.emit('map:sync-checkins');
          setTimeout(() => document.getElementById('settingsClose').click(), 180);
        },
        labelYes: 'Очистити',
        labelNo:  'Скасувати',
        styleYes: 'confirm-btn-discard',
        styleNo:  'confirm-btn-save',
      });
    });

    // ── Очистити локальні зміни ──
    document.getElementById('settingsClearLocalEdits')?.addEventListener('click', e => {
      e.stopPropagation();
      if (e.currentTarget.disabled) {
        bus.emit('ui:confirm', {
          message:  'Немає збережених даних',
          onYes:    () => {},
          labelYes: 'Зрозуміло',
          labelNo:  '',
          styleYes: 'confirm-btn-neutral',
          styleNo:  '',
        });
        return;
      }
      bus.emit('ui:confirm', {
        message: 'Очистити всі дані користувача (<span style="font-variant:small-caps;letter-spacing:0.04em">Вибране</span>, <span style="font-variant:small-caps;letter-spacing:0.04em">Check-in</span>, назви виходів)?',
        onYes:   () => {
          Storage.remove(STORAGE_KEYS.FAVS);
          Storage.remove(STORAGE_KEYS.EXIT_FAVS);
          Storage.remove(STORAGE_KEYS.CHECKINS);
          Storage.remove(STORAGE_KEYS.LOCAL_EDITS);
          Storage.remove(STORAGE_KEYS.EXIT_LABELS);
          Storage.remove(STORAGE_KEYS.FAV_ROWS_ORDER);
          setTimeout(() => {
            document.getElementById('settingsClose').click();
            setTimeout(() => Storage.flush().then(() => window.location.reload()), 300);
          }, 180);
        },
        labelYes: 'Очистити',
        labelNo:  'Скасувати',
        styleYes: 'confirm-btn-discard',
        styleNo:  'confirm-btn-save',
      });
    });

    // ── Dropdown «Очистити дані» ──
    const clearDataRow      = settingsSheet.querySelector('#clearDataRow');
    const clearDataDropdown = settingsSheet.querySelector('#clearDataDropdown');
    const clearDataChevron  = settingsSheet.querySelector('#clearDataChevron');
    clearDataRow?.addEventListener('click', () => {
      const isOpen = clearDataDropdown.classList.toggle('open');
      clearDataChevron.classList.toggle('open', isOpen);
    });

    // ── Клік по картці ──
    settingsSheet.querySelectorAll('.settings-card').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('button, a')) return;
        const row = e.target.closest('.settings-row');
        if (!row) return;

        const isExitsRow = row.id === 'checkinExitsRow';
        const isMainOn   = document.getElementById('settingsCheckinToggle')?.checked;
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

    // ── Кінематичний свайп ──
    initKinematicSwipe(settingsSheet, settingsSheet.querySelector('.sheet-body'), () => {
      document.getElementById('settingsClose').click();
    });

    // ── Експорт ──
    document.getElementById('settingsExport')?.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await BackupService.exportData({ devLog: isDevMode() ? getDevLog() : null });
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

  // ── Синхронізація стану тогглів при кожному відкритті ──
  function syncToggles() {
    const isMainOn    = isCheckinMode();
    const collapsible = document.getElementById('settingsCheckinCollapsible');
    if (collapsible) collapsible.classList.toggle('is-hidden', !isMainOn);

    const hatchTgl = document.getElementById('settingsCheckinHatchToggle');
    if (hatchTgl) hatchTgl.checked = Storage.get(STORAGE_KEYS.CHECKIN_HATCH) !== 'false';

    const savedStart = String(getPref('startOnFav'));
    document.querySelectorAll('#settingsStartSeg .settings-seg-btn').forEach(btn =>
      btn.classList.toggle('is-active', btn.dataset.startVal === savedStart)
    );

    const savedStat = getPref('checkinByStation');
    document.querySelectorAll('#settingsCheckinStatSeg .settings-seg-btn').forEach(btn =>
      btn.classList.toggle('is-active', btn.dataset.statVal === savedStat)
    );

    const eX = document.getElementById('settingsCheckinByExitToggle');
    if (eX) eX.checked = !getPref('checkinByExit');

    const isEditOn = getPref('editMode');
    const localFbRow = document.getElementById('settingsLocalFbRow');
    if (localFbRow) localFbRow.classList.toggle('is-hidden', !isEditOn);

    const c  = document.getElementById('settingsCheckinToggle');
    const l  = document.getElementById('settingsLocalFeedbackToggle');
    const h  = document.getElementById('settingsHideInfoToggle');
    const em = document.getElementById('settingsEditModeToggle');
    const nl = document.getElementById('settingsHideNoLiftToggle');

    if (c)  c.checked  = isMainOn;
    if (l)  l.checked  = getPref('localOnlyFeedback');
    if (h)  h.checked  = getPref('hideInfoBlocks');
    if (em) em.checked = isEditOn;
    if (nl) nl.checked = getPref('hideNoLift');

    const si = document.getElementById('settingsShowIntervalsToggle');
    if (si) si.checked = getPref('showIntervals');
    const mi = document.getElementById('settingsMorningIntervalToggle');
    if (mi) mi.checked = getPref('morningInterval');
    const hoursMode = getPref('stationHours');
    document.querySelectorAll('#settingsStationHoursSeg .settings-seg-btn').forEach(b =>
      b.classList.toggle('is-active', b.dataset.hoursVal === hoursMode));

    const clearFavsBtn    = document.getElementById('settingsClearFavs');
    const clearCheckinBtn = document.getElementById('settingsClearCheckin');
    const clearLocalBtn   = document.getElementById('settingsClearLocalEdits');
    const hasFavs         = getExitFavs().length > 0 || getFavs().length > 0;
    const hasCheckins     = Object.keys(getCheckins()).length > 0;
    const hasAnyData      = BackupService.hasUserData();

    // .disabled на div — лише прапорець для обробника кліку; візуально — клас is-empty
    [[clearFavsBtn, !hasFavs], [clearCheckinBtn, !hasCheckins], [clearLocalBtn, !hasAnyData]]
      .forEach(([btn, empty]) => {
        if (!btn) return;
        btn.disabled = empty;
        btn.classList.toggle('is-empty', empty);
      });

    const ma = document.getElementById('settingsShowMapAccessibilityToggle');
    if (ma) ma.checked = getPref('showMapAccessibility');

    const sh = document.getElementById('settingsShowHoistsToggle');
    if (sh) sh.checked = getPref('showHoists');
  }

  syncToggles();

  showSheet(settingsSheet);
}
