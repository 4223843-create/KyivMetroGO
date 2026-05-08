import { state }               from '../core/state.js';
import { slugByName }          from '../data/stations.js';
import { openStation, refreshCurrentStation } from './stationSheet.js';
import { openAboutSheet }      from './aboutSheet.js';
import { isFav, toggleFav }   from '../features/favorites.js';
import { heartSvg }            from '../ui/components.js';

export { openStation, openAboutSheet };

const sheet        = document.getElementById('stationSheet');
const sheetBody    = document.getElementById('sheetBody');
const sheetClose   = document.getElementById('sheetClose');
const sheetOverlay = document.getElementById('sheetOverlay');
const dropMenuEl   = document.getElementById('dropMenu');

// ══ ПЕРЕВІРКА НЕЗБЕРЕЖЕНИХ ЗМІН ══
export function withUnsavedCheck(proceed) {
  if (MetroApp.hasUnsavedFeedback?.()) {
    const _fbSlug = document.getElementById('fbStation')?.value || '';
    const _fbData = _fbSlug ? state.stationsData?.[_fbSlug] : null;
    const stationName = _fbData?.name || '';
    const question    = stationName
      ? `Зберегти зміни для станції <span style="white-space: nowrap; font-variant: small-caps; letter-spacing: 0.04em;">${stationName}?</span>`
      : 'Зберегти зміни?';
    MetroApp.showCustomConfirm?.(question,
      () => { MetroApp.triggerFeedbackSubmit?.(true); MetroApp.fbUnsaved = false; proceed(); },
      () => { MetroApp.fbUnsaved = false; proceed(); },
      () => {}
    );
    return true;
  }
  proceed();
  return false;
}

// ══ ЗАКРИТТЯ ВСІХ ШТОРОК ══
export function closeAllSheets(force = false) {
  if (!force) {
    if (withUnsavedCheck(() => closeAllSheets(true))) return false;
  }

  const openSheets = [...document.querySelectorAll('.station-sheet.sheet-open')];
  const dropMenu   = document.getElementById('dropMenu');
  if (dropMenu) { dropMenu.classList.remove('show'); dropMenu.hidden = true; }

  if (!openSheets.length) {
    if (sheetOverlay) sheetOverlay.classList.remove('overlay-visible');
    return;
  }

  const topSheet = openSheets[openSheets.length - 1];
  MetroApp.animateSheetClose?.(topSheet, () => {
    openSheets.forEach(el => el.classList.remove('sheet-open'));
    if (sheetOverlay) sheetOverlay.classList.remove('overlay-visible');
  });
  if (!MetroApp.animateSheetClose) {
    openSheets.forEach(el => el.classList.remove('sheet-open'));
    if (sheetOverlay) sheetOverlay.classList.remove('overlay-visible');
  }
}

// ══ ОБРОБНИКИ ПОДІЙ ══

if (sheetClose) {
  sheetClose.addEventListener('click', () => closeAllSheets());
}

if (sheetOverlay) {
  sheetOverlay.addEventListener('click', e => {
    if (e.target !== sheetOverlay) return;
    if (dropMenuEl?.classList.contains('show')) return;

    sheetOverlay.style.pointerEvents = 'none';
    const elUnder = document.elementFromPoint(e.clientX, e.clientY);
    sheetOverlay.style.pointerEvents = '';

    const zone = elUnder?.closest('[id]');
    if (zone?.id) {
      const rawId = zone.id.replace(/\d+$/, '').toLowerCase();
      const slug  = MetroApp.SLUG_BY_LOWER?.[rawId];
      if (slug && slug !== state.currentStationSlug) { openStation(slug); return; }
    }
    closeAllSheets();
  });
}

if (sheetBody) {
  sheetBody.addEventListener('click', e => {
    const navLabel = e.target.closest('.nav-label');
    if (navLabel) {
      const target = slugByName(navLabel.dataset.name || '');
      if (target && target !== state.currentStationSlug) {
        e.stopPropagation();
        openStation(target);
      }
    }
  });
}

const mainFavBtn = sheet?.querySelector('.fav-btn-bar');
if (mainFavBtn) {
  mainFavBtn.addEventListener('click', e => {
    const btn  = e.currentTarget;
    const slug = btn.dataset.slug;
    if (!slug) return;
    const nowFav = toggleFav(slug);
    btn.innerHTML = heartSvg(nowFav, slug, btn.dataset.color || 'var(--text-muted)');
    btn.classList.toggle('fav-active', nowFav);
  });
}

setTimeout(() => {
  MetroApp.initKinematicSwipe?.(sheet, sheetBody, () => closeAllSheets());
}, 0);