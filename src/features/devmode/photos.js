// ══ РЕЖИМ РОЗРОБНИКА: photos.js ══
// Фото: кілька знімків на позицію, фото станції, камера, стиснення,
// повноекранний перегляд.
// Частина src/features/devmode.js (публічне API — там).

import { PhotoStorage } from '../../data/photoStorage.js';
import { escapeHtml } from '../../ui/html.js';
import { showToast } from '../../ui/toast.js';
import { showCustomConfirm } from '../../ui/confirm.js';
import { attachPhotoZoom } from '../../ui/photoZoom.js';
import { TIMING } from '../../core/timing.js';
import { DEV_CAMERA_SVG, DEV_PHOTO_SVG } from './icons.js';
import { _touchSyncTimestamp, removeDevPhoto } from './sync.js';

// ── UI: панель фото ───────────────────────────────────
// ── Фото: підтримка кількох знімків на одну позицію ───
// Ключ у PhotoStorage тепер `${slug}_${posIdx}_${унікальний суфікс}` замість
// одного `${slug}_${posIdx}` — тобто кожне фото має свій власний запис,
// і на одну позицію їх може бути скільки завгодно.
function _photoPrefix(slug, posIdx) {
  return `${slug}_${posIdx}_`;
}

function _newPhotoId(slug, posIdx) {
  return `${_photoPrefix(slug, posIdx)}${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * @param {string} slug
 * @param {string} posIdx    — стабільний ключ рядка (devRowKey)
 * @param {Array<string|number>} [legacyKeys] — старі ключі рядка (порядковий номер,
 *   хеш до появи id позицій): фото, зняті раніше, лишаються під ними
 *   (їхні id у хмарі не перейменовуємо)
 * @returns {Promise<Array<{id:string, dataUrl:string}>>} усі фото для конкретної позиції
 */
export async function listPhotoIdsForPosition(slug, posIdx, legacyKeys = []) {
  const prefixes = [_photoPrefix(slug, posIdx)];
  for (const key of legacyKeys) {
    if (key !== undefined && key !== '') prefixes.push(_photoPrefix(slug, key));
  }
  // Лише ключі: самі фото (base64 на мегабайти) не читаємо. Раніше тут
  // вантажились УСІ фото для кожного рядка картки — на iPhone це переповнювало
  // пам'ять сторінки, і Safari перезавантажував застосунок.
  const ids = await PhotoStorage.getAllPhotoIds();
  return ids.filter(id => prefixes.some(prefix => id.startsWith(prefix))).sort();
}

async function listPhotosForPosition(slug, posIdx, legacyKeys = []) {
  const ids = await listPhotoIdsForPosition(slug, posIdx, legacyKeys);
  const photos = await Promise.all(ids.map(async id => ({ id, dataUrl: await PhotoStorage.loadPhoto(id) })));
  return photos.filter(p => p.dataUrl);
}

/**
 * Рядки відкритої картки станції, куди можна перенести фото (усі, крім fromRow),
 * з підписами напрямку, виходу й вагон/двері — як їх видно в картці.
 * @returns {Array<{row:HTMLElement, key:string, dir:string, exit:string, pos:string}>}
 */
function _photoMoveTargets(container, fromRow) {
  if (!container) return [];
  const clean = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const items = [];
  let dir = '', exit = '';
  container.querySelectorAll('.direction-label, .exit-label, .position-row').forEach(el => {
    if (el.classList.contains('direction-label')) { dir = clean(el); exit = ''; return; }
    if (el.classList.contains('exit-label')) { exit = clean(el); return; }
    if (el === fromRow || !el.dataset.devSlug) return;
    const pos = Array.from(el.querySelectorAll('.fav-tap-target'))
      .map(t => `вагон ${t.dataset.wagon}, двері ${t.dataset.doors}`)
      .join(' · ');
    items.push({ row: el, key: el.dataset.rowKey || el.dataset.devPosIdx, dir, exit, pos });
  });
  return items;
}

/**
 * Тап і довгий тап на одному елементі (миша й дотик).
 * Після довгого тапу звичайний тап не спрацьовує; рух пальця скасовує обидва.
 */
function bindLongPress(el, { onTap, onLongPress }) {
  let timer = null, start = null, fired = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  el.addEventListener('pointerdown', e => {
    fired = false;
    start = { x: e.clientX, y: e.clientY };
    cancel();
    timer = setTimeout(() => { timer = null; fired = true; onLongPress(); }, TIMING.LONG_PRESS);
  });
  el.addEventListener('pointermove', e => {
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10) { cancel(); start = null; }
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', () => { cancel(); start = null; });
  el.addEventListener('pointerleave', cancel);
  el.addEventListener('contextmenu', e => e.preventDefault()); // без системного меню зображення
  el.addEventListener('click', e => {
    e.stopPropagation();
    if (fired || !start) { fired = false; return; }
    onTap();
  });
}

// Ключ фото станції загалом (не конкретного виходу). Ключі рядків — 'k…' або
// числа, тож зі «station» вони не перетинаються.
const STATION_PHOTO_KEY = 'station';

export async function toggleDevPhotoPanel(row, slug, posIdx, lineColor, photoBtn, defaultColor, defaultOpacity, container) {
  const next = row.nextElementSibling;

  if (next?.classList.contains('dev-note-panel') && next.dataset.type === 'photo') {
    next.classList.remove('panel-open');
    setTimeout(() => next.remove(), 280);
    return;
  }

  _closeOtherDevPanels();

  const panel = document.createElement('div');
  panel.className = 'dev-note-panel';
  panel.dataset.type = 'photo';
  row.after(panel);
  requestAnimationFrame(() => panel.classList.add('panel-open'));

  const sheet = row.closest('.station-sheet');
  await _paintPhotoPanel(panel, {
    slug,
    key: posIdx,
    legacyKeys: [row.dataset.devPosIdx, row.dataset.devOldKey],
    setCount: count => {
      photoBtn.style.color   = count > 0 ? lineColor : defaultColor;
      photoBtn.style.opacity = count > 0 ? '1' : defaultOpacity;
    },
    // Куди можна перенести: станція загалом + інші виходи картки
    moveTargets: () => [
      _stationPhotoTarget(sheet),
      ..._photoMoveTargets(container, row),
    ].filter(Boolean),
    lineColor,
  });
}

// Закриває всі панелі розробника, крім постійної панелі нотатки станції
// (її лише ховаємо — без неї кнопка нотатки нічого не відкриє)
function _closeOtherDevPanels() {
  document.querySelectorAll('.dev-note-panel').forEach(p => {
    p.classList.remove('panel-open');
    if (p.id !== 'devStationNotePanel') {
      setTimeout(() => p.remove(), 280);
    }
  });
}

function _stationPhotoTarget(sheet) {
  const btn = sheet?.querySelector('#devStationPhotoBtn');
  if (!btn || btn.classList.contains('is-hidden')) return null;
  return { key: STATION_PHOTO_KEY, dir: '', exit: 'Станція загалом', pos: '', btn };
}

/**
 * Малює галерею фото в panel: мініатюри, «+» (вибрати з галереї телефона),
 * камера (знімати одне за одним), перенесення та видалення довгим тапом.
 * Спільна для фото виходу і фото станції загалом.
 */
async function _paintPhotoPanel(panel, { slug, key, legacyKeys = [], setCount, moveTargets, lineColor }) {
  const savePhoto = async file => {
    const id = _newPhotoId(slug, key);
    await PhotoStorage.savePhoto(id, await _photoToDataUrl(file));
    return id;
  };

  const paint = async () => {
    const photos = await listPhotosForPosition(slug, key, legacyKeys);
    setCount(photos.length);

    panel.innerHTML = `
      <div class="dev-photo-grid">
        ${photos.map(p => `
          <div class="dev-photo-thumb-wrap" data-id="${p.id}">
            <img src="${p.dataUrl}" class="dev-photo-thumb" draggable="false" alt="Фото, утримуйте, щоб видалити"/>
          </div>`).join('')}
        <button type="button" class="dev-photo-add-tile dev-photo-camera-tile" aria-label="Зняти фото">${DEV_CAMERA_SVG}</button>
        <label class="dev-photo-add-tile" aria-label="Додати фото з галереї">
          +
          <input type="file" accept="image/*" multiple class="dev-photo-input" style="display:none;">
        </label>
      </div>
      <div class="dev-note-actions">
        <button type="button" class="dev-photo-back confirm-main-btn confirm-btn-neutral">Назад</button>
      </div>`;

    // Тап — відкрити фото, довгий тап — запитати, що зробити
    panel.querySelectorAll('.dev-photo-thumb').forEach(img => {
      const photoId = img.closest('.dev-photo-thumb-wrap')?.dataset.id;
      bindLongPress(img, {
        onTap: () => showDevPhotoFullscreen(photos.map(p => p.dataUrl), photos.findIndex(p => p.id === photoId)),
        onLongPress: () => showCustomConfirm(
          'Що зробити з фото?',
          () => paintMovePicker(photoId),
          // Видаляємо одразу — вибір «Видалити» в першому вікні вже є підтвердженням
          async () => {
            try {
              // Через tombstone — інакше наступна синхронізація поверне фото з хмари
              await removeDevPhoto(photoId);
              await paint();
            } catch (err) {
              console.warn('[KyivMetroGO] Не вдалося видалити фото:', err);
              showToast('Не вдалося видалити фото');
            }
          },
          () => {},
          'Перенести', 'Видалити',
          'confirm-btn-neutral', 'confirm-btn-discard',
        ),
      });
    });

    panel.querySelector('.dev-photo-back').addEventListener('click', e => {
      e.stopPropagation();
      panel.classList.remove('panel-open');
      setTimeout(() => panel.remove(), 280);
    });

    // Камера: знімки зберігаються одразу, без кнопки «Підтвердити»
    panel.querySelector('.dev-photo-camera-tile').addEventListener('click', e => {
      e.stopPropagation();
      openDevCameraSession({
        onShot: async file => { const id = await savePhoto(file); _touchSyncTimestamp(); return id; },
        onDiscard: id => removeDevPhoto(id),
        onClose: () => paint(),
      });
    });

    const fileInput = panel.querySelector('.dev-photo-input');
    fileInput.addEventListener('click', e => e.stopPropagation());
    fileInput.addEventListener('change', async e => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      try {
        // По одному: кожне фото з камери в пам'яті займає десятки мегабайт
        for (const file of files) await savePhoto(file);
        _touchSyncTimestamp();
        await paint();
      } catch (err) {
        console.warn('[KyivMetroGO] Не вдалося зберегти фото:', err);
        showToast('Не вдалося зберегти одне або кілька фото');
      }
    });
  };

  // ── Перенести фото на інший вихід цієї ж станції (або на станцію загалом) ──
  // Список будуємо з рядків відкритої картки (той самий порядок і підписи,
  // що бачить користувач), поточний рядок пропускаємо.
  const paintMovePicker = (photoId) => {
    const items = moveTargets();
    if (!items.length) { showToast('На станції немає інших виходів'); return; }

    let lastDir = null;
    const listHtml = items.map((it, i) => {
      const dirHtml = it.dir !== lastDir && it.dir
        ? `<div class="dev-photo-move-dir">${escapeHtml(it.dir)}</div>` : '';
      lastDir = it.dir;
      return `${dirHtml}<button type="button" class="dev-photo-move-item" data-i="${i}">
        <span class="dev-photo-move-exit">${escapeHtml(it.exit || 'Вихід')}</span>
        ${it.pos ? `<span class="dev-photo-move-pos">${escapeHtml(it.pos)}</span>` : ''}
      </button>`;
    }).join('');

    panel.innerHTML = `
      <div class="dev-photo-move-title">Куди перенести фото?</div>
      <div class="dev-photo-move-list">${listHtml}</div>
      <div class="dev-note-actions">
        <button type="button" class="dev-photo-move-cancel confirm-main-btn confirm-btn-neutral">Назад</button>
      </div>`;

    panel.querySelector('.dev-photo-move-cancel').addEventListener('click', e => {
      e.stopPropagation();
      paint();
    });

    panel.querySelectorAll('.dev-photo-move-item').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const target = items[Number(btn.dataset.i)];
        try {
          const dataUrl = await PhotoStorage.loadPhoto(photoId);
          if (!dataUrl) throw new Error('photo not found');
          await PhotoStorage.savePhoto(_newPhotoId(slug, target.key), dataUrl);
          await removeDevPhoto(photoId);
          const targetBtn = target.btn || target.row?.querySelector('.dev-photo-btn');
          if (targetBtn) { targetBtn.style.color = lineColor; targetBtn.style.opacity = '1'; }
          showToast(target.exit ? `Фото перенесено: ${target.exit}` : 'Фото перенесено');
        } catch (err) {
          console.warn('[KyivMetroGO] Не вдалося перенести фото:', err);
          showToast('Не вдалося перенести фото');
        }
        await paint();
      });
    });
  };

  panel._repaint = paint;
  await paint();
}

// ── Фото станції загалом: кнопка в шапці картки праворуч від піна ──
let _lastStationPhotoSlug = null;

export function _setupDevStationPhotoButton(sheet, slug, lineColor, active) {
  const btn = sheet.querySelector('#devStationPhotoBtn');
  if (!btn) return;
  const openPanel = sheet.querySelector('.dev-station-photo-panel');
  btn.classList.toggle('is-hidden', !active);
  if (!active || slug !== _lastStationPhotoSlug) {
    openPanel?.remove();
    _lastStationPhotoSlug = active ? slug : null;
  }
  if (!active) return;

  const defaultColor = 'var(--text-muted)';
  btn.innerHTML = DEV_PHOTO_SVG;
  const setCount = count => { btn.style.color = count > 0 ? lineColor : defaultColor; };
  if (!sheet.querySelector('.dev-station-photo-panel')) setCount(0);
  listPhotoIdsForPosition(slug, STATION_PHOTO_KEY).then(ids => setCount(ids.length)).catch(() => {});

  btn.onclick = async e => {
    e.stopPropagation();
    const existing = sheet.querySelector('.dev-station-photo-panel');
    if (existing) {
      existing.classList.remove('panel-open');
      setTimeout(() => existing.remove(), 280);
      return;
    }
    _closeOtherDevPanels();
    const panel = document.createElement('div');
    panel.className = 'dev-note-panel dev-station-note-panel dev-station-photo-panel';
    panel.dataset.type = 'photo';
    sheet.querySelector('#sheetBody')?.before(panel);
    requestAnimationFrame(() => panel.classList.add('panel-open'));
    await _paintPhotoPanel(panel, {
      slug,
      key: STATION_PHOTO_KEY,
      setCount,
      moveTargets: () => _photoMoveTargets(sheet.querySelector('#sheetBody'), null),
      lineColor,
    });
  };
}

/**
 * Камера всередині застосунку: видошукач, кнопка знімка, після знімка —
 * [Скасувати] (прибрати цей знімок) і [Ще одне фото]. Знімок зберігається
 * одразу, окремого «Підтвердити» немає. ✕ закриває камеру.
 * Якщо камера недоступна (немає дозволу, старий браузер, Android-застосунок
 * без дозволу камери) — відкриваємо системну камеру через вибір файлу.
 * @param {{onShot:(file:Blob)=>Promise<string>, onDiscard:(id:string)=>Promise<void>, onClose:()=>void}} opts
 */
async function openDevCameraSession({ onShot, onDiscard, onClose }) {
  const fallback = () => openDevCamera(async files => {
    for (const file of files) await onShot(file);
    showToast(files.length > 1 ? `Збережено фото: ${files.length}` : 'Фото збережено');
    onClose();
  });

  if (!navigator.mediaDevices?.getUserMedia) { fallback(); return; }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
    });
  } catch (err) {
    console.warn('[KyivMetroGO] Камера недоступна, відкриваю системну:', err);
    fallback();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'dev-camera-overlay';
  overlay.innerHTML = `
    <video class="dev-camera-video" autoplay playsinline muted></video>
    <img class="dev-camera-preview" alt="" hidden>
    <button type="button" class="dev-camera-close" aria-label="Закрити камеру">✕</button>
    <div class="dev-camera-bar">
      <button type="button" class="dev-camera-shutter" aria-label="Зняти"></button>
      <div class="dev-note-actions dev-camera-after" hidden>
        <button type="button" class="dev-camera-cancel confirm-main-btn confirm-btn-neutral">Скасувати</button>
        <button type="button" class="dev-camera-more confirm-main-btn confirm-btn-save">Ще одне фото</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const video    = overlay.querySelector('.dev-camera-video');
  const preview  = overlay.querySelector('.dev-camera-preview');
  const shutter  = overlay.querySelector('.dev-camera-shutter');
  const after    = overlay.querySelector('.dev-camera-after');
  video.srcObject = stream;
  video.play?.().catch(() => {});

  let lastId = null;
  let lastUrl = null;
  let busy = false;
  let saved = 0;

  const showViewfinder = () => {
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = null;
    lastId = null;
    preview.hidden = true;
    preview.removeAttribute('src');
    video.hidden = false;
    shutter.hidden = false;
    after.hidden = true;
  };

  const close = () => {
    stream.getTracks().forEach(t => t.stop());
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    overlay.remove();
    document.removeEventListener('visibilitychange', onHide);
    if (saved) showToast(saved > 1 ? `Збережено фото: ${saved}` : 'Фото збережено');
    onClose();
  };
  // Застосунок пішов у фон — камеру вимикаємо (iOS однаково зупинить потік)
  const onHide = () => { if (document.visibilityState === 'hidden') close(); };
  document.addEventListener('visibilitychange', onHide);

  overlay.addEventListener('click', e => e.stopPropagation());
  overlay.querySelector('.dev-camera-close').addEventListener('click', close);

  shutter.addEventListener('click', async () => {
    if (busy || !video.videoWidth) return;
    busy = true;
    try {
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
      canvas.width = canvas.height = 0;
      if (!blob) throw new Error('empty frame');
      lastUrl = URL.createObjectURL(blob);
      preview.src = lastUrl;
      preview.hidden = false;
      video.hidden = true;
      shutter.hidden = true;
      after.hidden = false;
      lastId = await onShot(blob); // зберігаємо одразу — без «Підтвердити»
      saved++;
    } catch (err) {
      console.warn('[KyivMetroGO] Не вдалося зберегти фото:', err);
      showToast('Не вдалося зберегти фото');
      showViewfinder();
    } finally {
      busy = false;
    }
  });

  overlay.querySelector('.dev-camera-cancel').addEventListener('click', async () => {
    if (busy) return;
    const id = lastId;
    showViewfinder();
    if (id) {
      saved--;
      try { await onDiscard(id); } catch (err) { console.warn('[KyivMetroGO] Не вдалося прибрати фото:', err); }
    }
  });

  overlay.querySelector('.dev-camera-more').addEventListener('click', () => {
    if (!busy) showViewfinder();
  });
}

/**
 * Системна камера: відкриває камеру телефона (на комп'ютері — вибір файлу).
 * Запасний шлях, коли камера всередині застосунку недоступна. Тут системний
 * крок iOS «Використати фото» вебсторінка пропустити не може.
 * @param {(files: File[]) => Promise<void>} onFiles
 */
function openDevCamera(onFiles) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.setAttribute('capture', 'environment');
  input.style.display = 'none';
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    input.remove();
    if (!files.length) return;
    try {
      await onFiles(files);
    } catch (err) {
      console.warn('[KyivMetroGO] Не вдалося зберегти фото:', err);
      showToast('Не вдалося зберегти фото');
    }
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  input.click();
}

// ── Стиснення фото перед збереженням ──────────────────
// Фото з камери iPhone — 12–48 Мп; у base64 і розкодоване в картинку воно
// займає десятки мегабайт. Для перевірки виходу вистачає 2000 px по довшій
// стороні (зум теж лишається чітким).
const PHOTO_MAX_SIDE = 2000;

function _readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function _photoToDataUrl(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width  = Math.round(img.naturalWidth  * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    canvas.width = canvas.height = 0; // одразу звільнити пам'ять полотна (iOS)
    return dataUrl;
  } catch {
    return _readAsDataUrl(file); // не вдалося розкодувати — зберігаємо як є
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Повноекранний перегляд фото ───────────────────────
// Свайп ліворуч / праворуч гортає фото того самого виходу.
let _photoZoom = null;
let _photoList = [];
let _photoIndex = 0;

function _showPhotoAt(overlay, index) {
  _photoIndex = index;
  overlay.querySelector('img').src = _photoList[index];
  const counter = overlay.querySelector('.dev-photo-counter');
  counter.textContent = `${index + 1} / ${_photoList.length}`;
  counter.hidden = _photoList.length < 2;
}

/**
 * @param {string[]} srcs — усі фото виходу
 * @param {number} [index] — яке показати першим
 */
function showDevPhotoFullscreen(srcs, index = 0) {
  let overlay = document.getElementById('devPhotoOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'devPhotoOverlay';
    overlay.className = 'dev-photo-overlay';
    overlay.innerHTML = `<img src="" alt="" draggable="false" /><div class="dev-photo-counter" hidden></div>`;
    document.body.appendChild(overlay);
    _photoZoom = attachPhotoZoom(
      overlay,
      overlay.querySelector('img'),
      () => { overlay.classList.remove('open'); _photoList = []; },
      dir => {
        const next = _photoIndex + dir;
        if (next < 0 || next >= _photoList.length) return false;
        _showPhotoAt(overlay, next);
        return true;
      },
    );
  }
  _photoZoom.reset();
  _photoList = srcs;
  _showPhotoAt(overlay, Math.max(0, index));
  requestAnimationFrame(() => overlay.classList.add('open'));
}
