// ══ TOAST «НОВА ВЕРСІЯ ДОСТУПНА» ══

import { bus }       from '../core/eventBus.js';
import { showToast } from '../ui/toast.js';
import { Storage }   from '../core/storage.js';
import { withUnsavedCheck } from '../core/unsavedCheck.js';
import { reloadStationsData } from '../data/stations.js';
import { state }            from '../core/state.js';

/**
 * Тост «щось оновилось» з кнопкою перезавантаження і ✕.
 * Один і той самий для нової збірки і для нових даних станцій.
 */
function _showReloadToast(id, text, buttonText, onApply = _reloadPage) {
  if (document.getElementById(id)) return;

  const toast = document.createElement('div');
  toast.id        = id;
  toast.className = 'sw-update-toast';
  toast.innerHTML = `
    <span class="sw-update-text"></span>
    <button class="sw-update-btn"></button>
    <button class="sw-update-dismiss" aria-label="Закрити">✕</button>`;
  toast.querySelector('.sw-update-text').textContent = text;
  toast.querySelector('.sw-update-btn').textContent  = buttonText;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('sw-toast-visible'));

  const close = () => {
    toast.classList.remove('sw-toast-visible');
    setTimeout(() => toast.remove(), 300);
  };
  toast.querySelector('.sw-update-btn').addEventListener('click', () => { close(); onApply(); });
  toast.querySelector('.sw-update-dismiss').addEventListener('click', close);
}

/** Перезавантаження сторінки: спершу незбережена форма правок, потім запис у сховище. */
function _reloadPage() {
  withUnsavedCheck(async () => {
    await Storage.flush();
    location.reload();
  });
}

export function showUpdateToast() {
  _showReloadToast('swUpdateToast', 'Доступна нова версія', 'Оновити');
}

// ── Нові дані станцій ─────────────────────────────────────────
// SW (або на Android — data/stations.js) знайшов і зберіг нову версію stations.json.
// Якщо жодна шторка не відкрита — підхоплюємо її одразу, без перезавантаження.
// Інакше (людина дивиться картку чи заповнює форму) — тост, і оновлення лише за дотиком.

/** Відкрита якась шторка (картка, Вибране, налаштування…) — її затемнення видно. */
function _sheetOpen() {
  return !!document.getElementById('sheetOverlay')?.classList.contains('overlay-visible')
    || !!document.querySelector('.sheet-open');
}

function _dateLabel(version) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(version ?? ''));
  return m ? ` від ${m[3]}.${m[2]}.${m[1]}` : '';
}

let _applying = false;
async function applyStationsUpdate() {
  if (_applying) return;
  _applying = true;
  try {
    await reloadStationsData();
    bus.emit('station:refresh');
    return true;
  } catch (err) {
    console.error('[swUpdate] не вдалося застосувати нові дані:', err);
    return false;
  } finally {
    _applying = false;
  }
}

function onStationsUpdated(version) {
  // Застосунок ще запускається (дані не гідратовано) — запуск і так візьме
  // нову копію чи підхопить її одразу після себе
  if (!state.stationsData) {
    const later = () => { bus.off('data:stations-hydrated', later); setTimeout(() => onStationsUpdated(version), 0); };
    bus.on('data:stations-hydrated', later);
    return;
  }
  if (!_sheetOpen()) {
    applyStationsUpdate().then(ok => { if (ok) showToast(`Оновлено дані станцій${_dateLabel(version)}`); });
    return;
  }
  _showReloadToast('swDataUpdateToast', `Нові дані станцій${_dateLabel(version)}`, 'Оновити',
    () => withUnsavedCheck(async () => {
      await Storage.flush();
      if (!(await applyStationsUpdate())) location.reload();
    }));
}

// ── Дані в новішому форматі, ніж уміє цей застосунок ──────────
// Лише на Android/iOS (data/stations.js): PWA оновлюється разом із сайтом.
let _outdatedShown = false;
function showAppOutdatedToast() {
  if (_outdatedShown) return;
  _outdatedShown = true;
  showToast('Оновіть застосунок, щоб отримувати нові дані станцій', 6000);
}

let _started = false;

/**
 * Тости про нову збірку й нові дані станцій. Викликає main.js один раз,
 * якомога раніше: повідомлення від SW може прийти ще під час запуску.
 */
export function initUpdateToasts() {
  if (_started) return;
  _started = true;

  if ('serviceWorker' in navigator) {
    // Перше встановлення SW (clients.claim) теж дає controllerchange — тоді це не оновлення.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', async () => {
      if (!hadController) return;
      // Сторінка могла вже завантажитися з новою збіркою (перше відкриття, перезавантаження повз кеш),
      // а новий SW активувався слідом. Якщо наш головний скрипт є в кеші нового SW,
      // то ми й так на новій версії. Кеш нового SW — kyivmetro-<час збірки> з
      // найбільшим часом (старий у цей момент ще може існувати).
      const mainScript = /** @type {HTMLScriptElement|null} */ (document.querySelector('script[type="module"][src]'))?.src;
      try {
        const newest = (await caches.keys())
          .filter(k => /^kyivmetro-\d+$/.test(k))
          .sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]))
          .pop();
        if (mainScript && newest && await (await caches.open(newest)).match(mainScript)) return;
      } catch { /* немає доступу до кешу — показуємо тост */ }
      showUpdateToast();
    });

    // Слухаємо повідомлення від SW — зокрема STATIONS_UPDATED.
    navigator.serviceWorker.addEventListener('message', event => {
      try {
        if (event.data?.type === 'STATIONS_UPDATED') {
          onStationsUpdated(event.data.version);
        }
      } catch {
        // Ігноруємо нерозпізнані повідомлення.
      }
    });
  }

  // Нативна платформа: SW не реєструється, тому stations.js емітує подію через bus.
  // Дзеркало SW-логіки: той самий тост, той самий UX — незалежно від платформи.
  bus.on('stations:updated', ({ version }) => onStationsUpdated(version));
  bus.on('stations:app-outdated', showAppOutdatedToast);
}
