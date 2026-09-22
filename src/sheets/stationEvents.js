// ══ STATION SHEET — EVENT DELEGATION ══
// Один набір listeners на sheetBody, живе весь час сесії.
// WeakMap<Element, GestureState> — auto-GC при innerHTML-заміні.
// Правило: жодного querySelector поза handlers, жодного addEventListener на row-елементи.

import { state }                  from '../core/state.js';
import { TIMING }                 from '../core/timing.js';
import { STORAGE_KEYS, Storage }  from '../core/storage.js';
import { bus }                    from '../core/eventBus.js';
import { slugByName }             from '../data/stations.js';
import { applyExitLabels }        from '../data/localEdits.js';
import {
  isFav, getExitFavs, isExitFav,
  toggleExitFav, replaceExitFav,
} from '../features/favorites/index.js';
import { dismissHintWithDoors } from '../ui/animations.js';
import { Icons }                from '../ui/icons.js';
import { applyFavPillStyles }     from './renderStation.js';
import { heartSvg }               from '../ui/components.js';
import { Haptics, NotificationType } from '@capacitor/haptics';
import { isEditModeEnabled }      from '../features/settings.js';

// ── Gesture state (auto-GC разом з DOM-елементами) ──────────
/**
 * @typedef {{ longPressId: ReturnType<typeof setTimeout>|null,
 *             tapCount: number,
 *             tapId: ReturnType<typeof setTimeout>|null }} GestureState
 */
/** @type {WeakMap<Element, GestureState>} */
const _gesture = new WeakMap();

function _getGS(el) {
  if (!_gesture.has(el)) _gesture.set(el, { longPressId: null, tapCount: 0, tapId: null });
  return _gesture.get(el);
}

function _cancelLongPress(el) {
  const gs = _gesture.get(el);
  if (!gs) return;
  clearTimeout(gs.longPressId);
  gs.longPressId = null;
}

// ── Toast ────────────────────────────────────────────────────
function _showExitFavToast(row) {
  let existing = row.querySelector('.exit-fav-toast');
  if (existing) {
    existing.classList.remove('fav-note-open');
    setTimeout(() => existing?.remove(), TIMING.TOAST_FADE);
  }
  const toast = document.createElement('div');
  toast.className = 'exit-fav-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.innerHTML =
    '<span class="exit-fav-toast-text">вихід&nbsp;додано<br>до&nbsp;' +
    '<span style="font-variant:small-caps;letter-spacing:0.04em">Вибраного</span></span>';
  row.prepend(toast);
  requestAnimationFrame(() => toast.classList.add('fav-note-open'));
  setTimeout(() => {
    toast.classList.remove('fav-note-open');
    setTimeout(() => toast.remove(), TIMING.TOAST_FADE);
  }, TIMING.TOAST_SHOW);
}

// ── Replace-confirm inline card ──────────────────────────────
function _showExitReplaceConfirm(row, existing, slug, dirLabel, newWagon, newDoors, lineColor) {
  document.querySelectorAll('.exit-replace-confirm').forEach(el => {
    el.classList.remove('exit-replace-open');
    setTimeout(() => el.remove(), 280);
  });

  const confirmEl = document.createElement('div');
  confirmEl.className = 'exit-replace-confirm';
  confirmEl.innerHTML =
    `<p class="exit-replace-text">Ви вже додали до&nbsp;` +
    `<span style="font-variant:small-caps;letter-spacing:0.04em">Вибраного</span>` +
    ` інший вихід з&nbsp;цієї станції. Замінити на цей?</p>` +
    `<div class="exit-replace-btns">` +
    `<button class="exit-replace-btn confirm-btn-save">Замінити</button>` +
    `<button class="exit-replace-btn confirm-btn-discard">Скасувати</button>` +
    `</div>`;
  row.after(confirmEl);
  requestAnimationFrame(() => confirmEl.classList.add('exit-replace-open'));

  const close = () => {
    confirmEl.classList.remove('exit-replace-open');
    setTimeout(() => confirmEl.remove(), 280);
  };
  // Ці два listeners — не витік: вони живуть рівно стільки, скільки confirmEl
  confirmEl.querySelector('.confirm-btn-save').addEventListener('click', e => {
    e.stopPropagation();
    replaceExitFav(slug, dirLabel, existing.wagon, existing.doors, newWagon, newDoors);
    close();
    bus.emit('station:refresh');
  });
  confirmEl.querySelector('.confirm-btn-discard').addEventListener('click', e => {
    e.stopPropagation();
    close();
  });
}




// ── Тост «спершу увімкніть режим редагування» ─────────────────
function _showEditModeLockToast(row) {
  document.querySelectorAll('.edit-mode-lock-toast').forEach(t => t.remove());
  const rect  = row.getBoundingClientRect();
  const toast = document.createElement('div');
  toast.className = 'dev-mode-toast dev-mode-toast-open edit-mode-lock-toast';
  toast.style.cssText = `
    position: fixed;
    top: ${rect.top - 45}px;
    left: 50%;
    transform: translateX(-50%);
    bottom: auto;
    z-index: 10000;
  `;
  toast.textContent = 'Спершу увімкніть режим редагування в налаштуваннях';
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('dev-mode-toast-open');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ── Тост над іконкою (ліфт / ескалатор / підйомник) — прямо над самим значком ──
function _showIconLabelToast(el, text) {
  document.querySelectorAll('.icon-info-toast').forEach(t => t.remove());
  const rect  = el.getBoundingClientRect();
  const toast = document.createElement('div');
  toast.className = 'dev-mode-toast dev-mode-toast-open icon-info-toast';
  toast.style.cssText = `
    position: fixed;
    top: ${rect.top - 38}px;
    left: ${rect.left + rect.width / 2}px;
    transform: translateX(-50%);
    bottom: auto;
    z-index: 10000;
  `;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.remove('dev-mode-toast-open');
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}


// ── Ядро: toggle exit fav ─────────────────────────────────────
function _triggerExitFav(favTarget, slug, lineColor) {
  const wagon    = favTarget.dataset.wagon;
  const doors    = favTarget.dataset.doors;
  if (!wagon || !doors) return;

  const row      = favTarget.closest('.position-row');
  const dirBlock = favTarget.closest('.direction-block, .long-transfer-block');
  const labelEl  = dirBlock?.querySelector('.direction-label, .transfer-text');
  const dirLabel = labelEl?.textContent.trim() ?? '';

  const result = toggleExitFav(slug, dirLabel, wagon, doors);

  if (result.status === 'replace') {
    _showExitReplaceConfirm(row, result.existing, slug, dirLabel, wagon, doors, lineColor);
    return;
  }

  const added = result.status === 'added';
  if (row) applyFavPillStyles(row, lineColor, added);
  
  if (added) {
    _showExitFavToast(row);

    // Соковитий подвійний нативний вібровідгук «Успіх»
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});

    _maybeShowCheckinHint(lineColor);
    _maybeDismissOnboarding(lineColor);
  }

  // Оновлюємо серце в шапці (тепер цей блок чітко всередині функції)
  const favBtnBar = document.querySelector(`.fav-btn-bar[data-slug="${slug}"]`);
  if (favBtnBar) {
    const nowFav = isFav(slug);
    favBtnBar.innerHTML = heartSvg(nowFav, slug, lineColor);
    favBtnBar.classList.toggle('fav-active', nowFav);
  }
}

function _maybeDismissOnboarding(lineColor) {
  const hint = document.getElementById('onboardingHint');
  if (hint) dismissHintWithDoors(hint, () => _maybeShowCheckinHint(lineColor));
  else      _maybeShowCheckinHint(lineColor);
}

function _maybeShowCheckinHint(lineColor) {
  if (Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true') return;
  if (Storage.get(STORAGE_KEYS.CHECKIN_HINT_SEEN) === 'true') return;
  const sheetBodyEl = document.getElementById('sheetBody');
  if (!sheetBodyEl || document.getElementById('checkinHint')) return;
  Storage.set(STORAGE_KEYS.CHECKIN_HINT_SEEN, 'true');
  const hint = document.createElement('div');
  hint.id        = 'checkinHint';
  hint.className = 'onboarding-hint';
  hint.innerHTML =
    `<span class="hint-icon-wrap" style="color:${lineColor}">${Icons.info}</span>` +
    `Натисніть на&nbsp;шпильку, щоб&nbsp;позначити вихід&nbsp;зі&nbsp;станції як&nbsp;відвіданий`;
  sheetBodyEl.insertBefore(hint, sheetBodyEl.firstChild);
}

// ── Панель "виходи за номерами" — виїжджає ЗНИЗУ, розширюючи блок ──
// (той самий "блок" — пігулки, підпис напрямку, пін, значки розробника —
// що й для note/photo/confirm-панелей розробника: вставляємо як сусідній
// елемент ПІСЛЯ рядка, той самий .dev-note-panel-паттерн і той самий
// "закрити всі інші" механізм — щоб дві панелі не намагались відкритись
// одночасно під одним рядком).
// Спрацьовує на ОДИНАРНИЙ тап по .fav-tap-target (довге натискання і
// подвійний тап і далі відповідають за Вибране — не чіпаємо їх).
// Показується лише якщо у станції реально є numbered_exits в даних;
// інакше одинарний тап просто нічого не робить (як і раніше).
const COLLAPSE_ARROW_SVG = `<svg viewBox="0 0 32 10" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8 L16 2 L30 8"/></svg>`;

// ── Панель "виходи за номерами" — виїжджає ЗНИЗУ, розширюючи блок ──
// ── Панель "виходи за номерами" ──
function _openNumberedExitsPanel(favTarget, slug, lineColor) {
  const station = state.stationsData?.[slug];
  if (!station) return;

  const row = favTarget.closest('.position-row');
  if (!row) return;

  const wagon = favTarget.dataset.wagon;
  const doors = favTarget.dataset.doors;

  // 1. Пошук текстової мітки напрямку (з поточного блоку або попереднього сусіда)
  const dirBlock = favTarget.closest('.direction-block, .long-transfer-block');
  let labelEl = dirBlock?.querySelector('.direction-label, .transfer-text');
  if (!labelEl && dirBlock?.previousElementSibling) {
    labelEl = dirBlock.previousElementSibling.querySelector('.direction-label, .transfer-text')
      || (dirBlock.previousElementSibling.classList.contains('direction-label') ? dirBlock.previousElementSibling : null);
  }

  const dirName = labelEl?.dataset.name || (labelEl?.classList.contains('transfer-text') ? '__long_transfer__' : labelEl?.textContent.trim()) || '';

  // 2. Знаходимо напрямок за назвою або шукаємо будь-який напрямок, що містить ці вагони/двері
  let targetDir = station.directions?.find(d => d.from === dirName || d.from.trim() === dirName.trim());
  if (!targetDir && station.directions) {
    targetDir = station.directions.find(d =>
      d.exits?.some(ex =>
        ex.positions?.some(p => String(p.wagon).trim() === String(wagon).trim() && String(p.doors).trim() === String(doors).trim())
      )
    );
  }

  // 3. Знаходимо вихід у напрямку (або скан по всій станції як крайній фолбек)
  let targetExit = targetDir?.exits?.find(ex =>
    ex.positions?.some(p => String(p.wagon).trim() === String(wagon).trim() && String(p.doors).trim() === String(doors).trim())
  );

  if (!targetExit && station.directions) {
    for (const d of station.directions) {
      targetExit = d.exits?.find(ex =>
        ex.positions?.some(p => String(p.wagon).trim() === String(wagon).trim() && String(p.doors).trim() === String(doors).trim())
      );
      if (targetExit) break;
    }
  }

  if (!targetExit) return;

  // 4. Розпаковка списку виходів з урахуванням усіх можливих форматів
  const rawExits = targetExit.numbered_exits || targetExit.exit_numbers || (Array.isArray(station.numbered_exits) ? station.numbered_exits : []);
  const stationNumbered = station.numbered_exits;

  let exitsList = [];

  // Якщо номери виходів посилаються на словник станції (station.numbered_exits)
  if (Array.isArray(rawExits) && rawExits.length > 0 && stationNumbered) {
    if (typeof stationNumbered === 'object' && !Array.isArray(stationNumbered)) {
      const resolved = rawExits.map(key => {
        let text = '';
        let numStr = '';
        if (typeof key === 'object' && key !== null) {
          numStr = String(key.num || key.number || key.id || '');
          text = key.text || stationNumbered[numStr] || '';
        } else {
          numStr = String(key).trim();
          text = stationNumbered[numStr] || '';
        }
        return text ? { num: numStr, text: String(text) } : null;
      }).filter(Boolean);

      if (resolved.length > 0) exitsList = resolved;
    } else if (Array.isArray(stationNumbered)) {
      const resolved = rawExits.map((key, idx) => {
        if (typeof key === 'object' && key !== null) {
          return { num: String(key.num || key.number || (idx + 1)), text: String(key.text || '') };
        }
        const numIdx = parseInt(key) - 1;
        const text = !isNaN(numIdx) && stationNumbered[numIdx] ? stationNumbered[numIdx] : (typeof key === 'string' && isNaN(Number(key)) ? key : '');
        return text ? { num: String(key), text: String(text) } : null;
      }).filter(Boolean);

      if (resolved.length > 0) exitsList = resolved;
    }
  }

  // Якщо rawExits самі містять об'єкти чи текстові описи
  if (exitsList.length === 0 && Array.isArray(rawExits) && rawExits.length > 0) {
    exitsList = rawExits.map((item, index) => {
      if (typeof item === 'object' && item !== null) {
        return {
          num: String(item.num || item.number || (index + 1)),
          text: String(item.text || '')
        };
      }
      return {
        num: String(index + 1),
        text: String(item)
      };
    }).filter(item => item.text && item.text.trim() !== '');
  }

  if (!exitsList.length) return;

  // 5. Відкриття / закриття панелі
  const next = row.nextElementSibling;
  if (next?.classList.contains('dev-note-panel') && next.dataset.type === 'numbered-exits') {
    next.classList.remove('panel-open');
    setTimeout(() => next.remove(), 280);
    return;
  }

  document.querySelectorAll('.dev-note-panel').forEach(p => {
    p.classList.remove('panel-open');
    setTimeout(() => p.remove(), 280);
  });

  const panel = document.createElement('div');
  panel.className = 'dev-note-panel pos-numbered-exits';
  panel.dataset.type = 'numbered-exits';
  panel.innerHTML =
    exitsList.map(item =>
      `<div class="pos-numbered-exit-row"><span class="pos-numbered-exit-num" style="color:${lineColor}">${item.num}</span><span class="pos-numbered-exit-text">${item.text}</span></div>`
    ).join('') +
    `<button type="button" class="pos-numbered-exits-collapse" aria-label="Згорнути">${COLLAPSE_ARROW_SVG}</button>`;

  const dirLabel = row.previousElementSibling?.classList.contains('direction-label')
    ? row.previousElementSibling
    : row;
  dirLabel.before(panel);
  requestAnimationFrame(() => panel.classList.add('panel-open'));

  panel.querySelector('.pos-numbered-exits-collapse').addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.remove('panel-open');
    setTimeout(() => panel.remove(), 280);
  });
}

// ── Головний bind — викликається ОДИН РАЗ ────────────────────
/**
 * @param {HTMLElement} sheetBody
 * @param {() => { slug: string, lineColor: string }} getCtx
 *   Getter повертає актуальний slug та колір на момент події.
 *   Це критично: не передаємо значення, бо вони змінюються між відкриттями.
 */
export function bindSheetGestures(sheetBody, getCtx) {

  // ── touchstart: початок long-press ──────────────────────────
  sheetBody.addEventListener('touchstart', e => {
    const favTarget = e.target.closest('.fav-tap-target');
    if (!favTarget) return;

    const gs = _getGS(favTarget);
    clearTimeout(gs.longPressId);

    gs.longPressId = setTimeout(() => {
      gs.longPressId = null;
      const { slug, lineColor } = getCtx();
      _triggerExitFav(favTarget, slug, lineColor);
    }, TIMING.LONG_PRESS);

  }, { passive: true });

  // ── touchmove: скасувати long-press (не блокуємо скрол) ─────
  sheetBody.addEventListener('touchmove', e => {
    // Скасовуємо для всіх активних .fav-tap-target в зоні дотику
    // e.target може бути дочірнім елементом — тому .closest()
    const favTarget = e.target.closest('.fav-tap-target');
    if (favTarget) _cancelLongPress(favTarget);
  }, { passive: true });

  // ── touchend: скасувати, якщо не спрацював ──────────────────
  sheetBody.addEventListener('touchend', e => {
    const favTarget = e.target.closest('.fav-tap-target');
    if (favTarget) _cancelLongPress(favTarget);
  }, { passive: true });

  // ── click: double-tap fav + pencil + nav-link ────────────────
  sheetBody.addEventListener('click', e => {
    const { slug, lineColor } = getCtx();

    // 1. Значок підйомника → показати текст про часткову доступність
    const hoistMark = e.target.closest('.pos-hoist-mark');
    if (hoistMark) {
      e.stopPropagation();
      _showIconLabelToast(hoistMark, 'Забезпечує часткову доступність');
      return;
    }

    // 1b. Значок ліфта → показати підпис "Ліфт"
    const elevatorMark = e.target.closest('.pos-elevator-mark');
    if (elevatorMark) {
      e.stopPropagation();
      _showIconLabelToast(elevatorMark, 'Ліфт');
      return;
    }

    // 1c. Значок ескалатора → показати підпис "Ескалатор"
    const escalatorMark = e.target.closest('.pos-escalator-mark');
    if (escalatorMark) {
      e.stopPropagation();
      _showIconLabelToast(escalatorMark, 'Ескалатор');
      return;
    }

    // 2. Pencil (відредагована позиція → відкрити feedback)
    const pencil = e.target.closest('.pos-edited-mark');
    if (pencil) {
      e.stopPropagation();
      const editSlug = pencil.dataset.slug;
      if (!editSlug) return;
      if (!isEditModeEnabled()) {
        _showEditModeLockToast(pencil);
        return;
      }
      bus.emit('sheet:open-feedback-for', { slug: editSlug });
      return;
    }

    // 3. Скасувати exit-replace confirm
    if (e.target.closest('.exit-replace-confirm')) return;

    // 4. Nav-label → відкрити іншу станцію
    const navLabel = e.target.closest('.nav-link');
    if (navLabel) {
      const target = slugByName(navLabel.dataset.name || '');
      if (target && target !== slug) bus.emit('station:open', { slug: target });
      return;
    }

    // 5. Double-tap на .fav-tap-target
    const favTarget = e.target.closest('.fav-tap-target');
    if (!favTarget) return;
    // Ігноруємо кліки по службових елементах всередині target
    if (e.target.closest('.pos-edited-mark, .exit-fav-cancel, .edit-info-panel')) return;

    const gs = _getGS(favTarget);
    gs.tapCount++;
    clearTimeout(gs.tapId);
    gs.tapId = setTimeout(() => {
      // Якщо це був лише один тап (не подвійний) — показуємо виходи за номерами
      if (gs.tapCount === 1) _openNumberedExitsPanel(favTarget, slug, lineColor);
      gs.tapCount = 0;
    }, TIMING.DOUBLE_TAP);

    if (gs.tapCount >= 2) {
      gs.tapCount = 0;
      clearTimeout(gs.tapId);
      _triggerExitFav(favTarget, slug, lineColor);
    }
  });
}

// ── Початкове зафарбовування улюблених при відкритті картки ──
/**
 * Проходиться по всіх .fav-tap-target у sheetBody
 * і підфарбовує ті, що є у exitFavs.
 * Викликається після кожного innerHTML = (без повторного bind).
 *
 * @param {HTMLElement} sheetBody
 * @param {string} slug
 * @param {string} lineColor
 */
export function applyInitialFavStyles(sheetBody, slug, lineColor) {
  sheetBody.querySelectorAll('.fav-tap-target').forEach(favTarget => {
    const wagon    = favTarget.dataset.wagon;
    const doors    = favTarget.dataset.doors;
    if (!wagon || !doors) return;

    const row      = favTarget.closest('.position-row');
    const dirBlock = favTarget.closest('.direction-block, .long-transfer-block');
    const labelEl  = dirBlock?.querySelector('.direction-label, .transfer-text');
    const dirLabel = labelEl?.textContent.trim() ?? '';

    if (row && isExitFav(slug, dirLabel, wagon, doors)) {
      applyFavPillStyles(row, lineColor, true);
    }
  });
}