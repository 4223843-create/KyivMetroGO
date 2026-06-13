// ══ SHEETS MANAGER ══
// Відповідальність: управління відкриттям/закриттям шторок,
// overlay, swipe-жести основної шторки, делегування bus-подій.
// Єдина точка входу для навігації між шторками ззовні (openStation, openAboutSheet).

import { bus }                from '../core/eventBus.js';
import { withUnsavedCheck }  from '../core/unsavedCheck.js';
import { openStation }       from './stationSheet.js';
import { openAboutSheet }    from './aboutSheet.js';
import { isFav, toggleFav } from '../features/favorites/index.js';
import { heartSvg }          from '../ui/components.js';
import { reloadStationsData, getSlugByLower } from '../data/stations.js';
import { animateSheetClose }  from '../ui/animations.js';
import { initKinematicSwipe } from '../ui/swipe.js';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export { openStation, openAboutSheet, withUnsavedCheck };

const sheet        = document.getElementById('stationSheet');
const sheetBody    = document.getElementById('sheetBody');
const sheetClose   = document.getElementById('sheetClose');
const sheetOverlay = document.getElementById('sheetOverlay');
const dropMenuEl   = document.getElementById('dropMenu');

// ══ ЗАКРИТТЯ ВСІХ ШТОРОК ══
/**
 * Закриває всі відкриті шторки (або тільки верхню).
 * Якщо force=false — спочатку перевіряє незбережений фідбек.
 * @param {boolean} [force=false]
 */
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
  animateSheetClose(topSheet, () => {
    openSheets.forEach(el => el.classList.remove('sheet-open'));
    if (sheetOverlay) sheetOverlay.classList.remove('overlay-visible');
  });
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
      const slug  = getSlugByLower(rawId);
      if (slug) { openStation(slug); return; }
    }
    closeAllSheets();
  });
}

const mainFavBtn = sheet?.querySelector('.fav-btn-bar');
if (mainFavBtn) {
  mainFavBtn.addEventListener('click', e => {
    const btn  = e.currentTarget;
    const slug = btn.dataset.slug;
    if (!slug) return;

    // Додаємо вібровідгук саме сюди: після перевірки, перед збереженням
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});

    const nowFav = toggleFav(slug);
    btn.innerHTML = heartSvg(nowFav, slug, btn.dataset.color || 'var(--text-muted)');
    btn.classList.toggle('fav-active', nowFav);
  });
}

setTimeout(() => {
  initKinematicSwipe(sheet, sheetBody, () => closeAllSheets());
}, 0);

// ══ BUS-ПІДПИСКИ ══

// feedback/index.js емітує 'sheet:close' коли треба закрити шторку.
bus.on('sheet:close', ({ sheetEl }) => {
  if (!sheetEl) return;
  animateSheetClose(sheetEl, () => {
    sheetEl.classList.remove('sheet-open');
    if (!document.querySelectorAll('.station-sheet.sheet-open').length) {
      sheetOverlay?.classList.remove('overlay-visible');
    }
  });
});

// fbEvents.js емітує 'data:reload-stations' після скидання локальних змін.
bus.on('data:reload-stations', async ({ onDone } = {}) => {
  try {
    await reloadStationsData();
    onDone?.();
  } catch (err) {
    console.error('[sheetsManager] data:reload-stations failed:', err);
  }
});
