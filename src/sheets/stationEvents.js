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
} from '../features/favorites.js';
import { applyFavPillStyles }     from './renderStation.js';
import { heartSvg }               from '../ui/components.js';

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
    _maybeShowCheckinHint(lineColor);
    _maybeDismissOnboarding(lineColor);
  }

  // Оновлюємо серце в шапці
  const favBtnBar = document.querySelector(`.fav-btn-bar[data-slug="${slug}"]`);
  if (favBtnBar) {
    const nowFav = isFav(slug);
    favBtnBar.innerHTML = heartSvg(nowFav, slug, lineColor);
    favBtnBar.classList.toggle('fav-active', nowFav);
  }
}

function _maybeDismissOnboarding(lineColor) {
  const hint = document.getElementById('onboardingHint');
  if (hint) MetroApp.dismissHintWithDoors?.(hint, () => _maybeShowCheckinHint(lineColor));
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
    `<span class="hint-icon-wrap" style="color:${lineColor}">${MetroApp.Icons.info}</span>` +
    `Натисніть на&nbsp;шпильку, щоб&nbsp;позначити вихід&nbsp;зі&nbsp;станції як&nbsp;відвіданий`;
  sheetBodyEl.insertBefore(hint, sheetBodyEl.firstChild);
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

    // 1. Pencil (відредагована позиція → відкрити feedback)
    const pencil = e.target.closest('.pos-edited-mark');
    if (pencil) {
      e.stopPropagation();
      const editSlug = pencil.dataset.slug;
      if (!editSlug) return;
      bus.emit('sheet:open-feedback-for', { slug: editSlug });
      return;
    }

    // 2. Скасувати exit-replace confirm
    if (e.target.closest('.exit-replace-confirm')) return;

    // 3. Nav-label → відкрити іншу станцію
    const navLabel = e.target.closest('.nav-link');
    if (navLabel) {
      const target = slugByName(navLabel.dataset.name || '');
      if (target && target !== slug) bus.emit('station:open', { slug: target });
      return;
    }

    // 4. Double-tap на .fav-tap-target
    const favTarget = e.target.closest('.fav-tap-target');
    if (!favTarget) return;
    // Ігноруємо кліки по службових елементах всередині target
    if (e.target.closest('.pos-edited-mark, .exit-fav-cancel, .edit-info-panel')) return;

    const gs = _getGS(favTarget);
    gs.tapCount++;
    clearTimeout(gs.tapId);
    gs.tapId = setTimeout(() => { gs.tapCount = 0; }, TIMING.DOUBLE_TAP);

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