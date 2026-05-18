// ═══════════════════════════════════════════════════════
// РЕЖИМ РОЗРОБНИКА — DEV MODE
// ═══════════════════════════════════════════════════════

const DEV_CHECK_SVG = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M14.83 4.89l1.34.94-5.81 8.38H9.02L5.78 9.67l1.34-1.25 2.57 2.4z"/></svg>`;

const DEV_NOTE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 12h14M5 16h6"/></svg>`;

const DEV_PHOTO_SVG = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" width="26" height="20"/><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" points="3,22.3 11,14.3 22.5,25.9 "/><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" points="17.4,20.9 22,16.3 28.9,23.2 "/></svg>`;

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { state }                  from '../core/state.js';
import { PhotoStorage }           from '../data/photoStorage.js';
import { bus }        from '../core/eventBus.js';
import { LINE_COLOR } from '../core/constants.js';
import { renderFeedbackPositions } from './feedback/index.js';

// ── Активація / деактивація ──────────────────────────
export function isDevMode() {
  return Storage.get(STORAGE_KEYS.DEV_MODE) === 'true';
}

export function toggleDevMode() {
  const next = !isDevMode();
  Storage.set(STORAGE_KEYS.DEV_MODE, String(next));
  return next;
}

// ── Лог змін ────────────────────────────────────────
export function getDevLog() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_LOG) || '[]'); }
  catch(e) { return []; }
}

export function appendDevLog(entry) {
  const log = getDevLog();
  log.push({ ts: Date.now(), ...entry });
  Storage.set(STORAGE_KEYS.DEV_LOG, JSON.stringify(log));
}

// ── Верифіковані позиції ─────────────────────────────
export function isVerified(slug, posIdx) {
  try {
    const v = JSON.parse(Storage.get(STORAGE_KEYS.DEV_VERIFIED) || '{}');
    return !!(v[slug]?.[posIdx]);
  } catch(e) { return false; }
}

export function toggleDevVerified(slug, posIdx) {
  try {
    const v = JSON.parse(Storage.get(STORAGE_KEYS.DEV_VERIFIED) || '{}');
    if (!v[slug]) v[slug] = {};
    const nowOn = !v[slug][posIdx];
    if (nowOn) v[slug][posIdx] = true;
    else {
      delete v[slug][posIdx];
      if (!Object.keys(v[slug]).length) delete v[slug];
    }
    Storage.set(STORAGE_KEYS.DEV_VERIFIED, JSON.stringify(v));
    return nowOn;
  } catch(e) { return false; }
}

// ── Нотатки ──────────────────────────────────────────
export function getDevNote(slug, posIdx) {
  try {
    const notes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
    return notes[slug]?.[posIdx] || '';
  } catch(e) { return ''; }
}

export function setDevNote(slug, posIdx, text) {
  try {
    const notes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
    if (!notes[slug]) notes[slug] = {};
    if (text) notes[slug][posIdx] = text;
    else {
      delete notes[slug][posIdx];
      if (!Object.keys(notes[slug]).length) delete notes[slug];
    }
    Storage.set(STORAGE_KEYS.DEV_NOTES, JSON.stringify(notes));
  } catch(e) {}
}

// ── UI: кнопки в картці станції ──────────────────────
export function attachDevModeUI(container, slug) {
  if (!isDevMode()) return;
  const lineColor = LINE_COLOR[state.stationsData?.[slug]?.line] || 'var(--text-muted)';

  const defaultColor   = 'var(--border)';
  const defaultOpacity = '1';

  container.querySelectorAll('.position-row').forEach((row, posIdx) => {
    if (row.querySelector('.dev-check-btn')) return;

    row.dataset.devPosIdx = posIdx;
    row.dataset.devSlug   = slug;
    const photoId = `${slug}_${posIdx}`;

    // ── Кнопка «Перевірено» ──
    const checkBtn = document.createElement('button');
    checkBtn.className = 'dev-check-btn';
    checkBtn.type = 'button';
    checkBtn.innerHTML = DEV_CHECK_SVG;

    if (isVerified(slug, posIdx)) {
      checkBtn.style.color   = lineColor;
      checkBtn.style.opacity = '1';
    } else {
      checkBtn.style.color   = defaultColor;
      checkBtn.style.opacity = defaultOpacity;
    }

    // ── Кнопка «Нотатка» ──
    const noteBtn = document.createElement('button');
    noteBtn.className = 'dev-note-btn';
    noteBtn.type = 'button';
    noteBtn.innerHTML = DEV_NOTE_SVG;

    if (getDevNote(slug, posIdx)) {
      noteBtn.style.color   = lineColor;
      noteBtn.style.opacity = '1';
    } else {
      noteBtn.style.color   = defaultColor;
      noteBtn.style.opacity = defaultOpacity;
    }

    // ── Кнопка «Фото» ──
    const photoBtn = document.createElement('button');
    photoBtn.className = 'dev-photo-btn';
    photoBtn.type = 'button';
    photoBtn.innerHTML = DEV_PHOTO_SVG;
    photoBtn.style.color   = defaultColor;
    photoBtn.style.opacity = defaultOpacity;

    row.prepend(photoBtn, noteBtn, checkBtn);

    PhotoStorage.loadPhoto(photoId).then(hasPhoto => {
      if (hasPhoto) {
        photoBtn.style.color   = lineColor;
        photoBtn.style.opacity = '1';
      }
    }).catch(() => {});

    checkBtn.addEventListener('click', e => {
      e.stopPropagation();
      const nowVerified = toggleDevVerified(slug, posIdx);
      checkBtn.style.color   = nowVerified ? lineColor : defaultColor;
      checkBtn.style.opacity = nowVerified ? '1' : defaultOpacity;
    });

    noteBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleDevNotePanel(row, slug, posIdx, lineColor, noteBtn, defaultColor, defaultOpacity);
    });

    photoBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleDevPhotoPanel(row, slug, posIdx, lineColor, photoBtn, defaultColor, defaultOpacity);
    });
  });
}

// ── UI: панель нотатки ───────────────────────────────
function toggleDevNotePanel(row, slug, posIdx, lineColor, noteBtn, defaultColor, defaultOpacity) {
  const next = row.nextElementSibling;

  if (next?.classList.contains('dev-note-panel') && next.dataset.type === 'note') {
    next.classList.remove('panel-open');
    setTimeout(() => next.remove(), 280);
    return;
  }

  document.querySelectorAll('.dev-note-panel').forEach(p => {
    p.classList.remove('panel-open');
    setTimeout(() => p.remove(), 280);
  });

  const existingNote = getDevNote(slug, posIdx);
  const panel = document.createElement('div');
  panel.className = 'dev-note-panel';
  panel.dataset.type = 'note';
  panel.innerHTML = `<textarea class="dev-note-textarea">${existingNote}</textarea> <div class="dev-note-actions"> <button type="button" class="dev-note-save confirm-btn-save">Зберегти</button> <button type="button" class="dev-note-clear confirm-btn-neutral">Скасувати</button> </div>`;
  row.after(panel);
  requestAnimationFrame(() => panel.classList.add('panel-open'));

  const textarea = panel.querySelector('.dev-note-textarea');
  setTimeout(() => textarea.focus(), 60);

  panel.querySelector('.dev-note-save').addEventListener('click', e => {
    e.stopPropagation();
    const text = textarea.value.trim();
    setDevNote(slug, posIdx, text);
    noteBtn.style.color   = text ? lineColor : defaultColor;
    noteBtn.style.opacity = text ? '1' : defaultOpacity;
    panel.classList.remove('panel-open');
    setTimeout(() => panel.remove(), 280);
  });

  panel.querySelector('.dev-note-clear').addEventListener('click', e => {
    e.stopPropagation();
    setDevNote(slug, posIdx, '');
    noteBtn.style.color   = defaultColor;
    noteBtn.style.opacity = defaultOpacity;
    panel.classList.remove('panel-open');
    setTimeout(() => panel.remove(), 280);
  });
}

// ── UI: панель фото ───────────────────────────────────
async function toggleDevPhotoPanel(row, slug, posIdx, lineColor, photoBtn, defaultColor, defaultOpacity) {
  const next = row.nextElementSibling;

  if (next?.classList.contains('dev-note-panel') && next.dataset.type === 'photo') {
    next.classList.remove('panel-open');
    setTimeout(() => next.remove(), 280);
    return;
  }

  document.querySelectorAll('.dev-note-panel').forEach(p => {
    p.classList.remove('panel-open');
    setTimeout(() => p.remove(), 280);
  });

  const photoId = `${slug}_${posIdx}`;
const existingPhoto = await PhotoStorage.loadPhoto(photoId);
  const panel = document.createElement('div');
  panel.className = 'dev-note-panel';
  panel.dataset.type = 'photo';
  panel.innerHTML = `<div style="text-align: center; margin-top: 8px;"> ${existingPhoto  ?`<img src="${existingPhoto}" style="max-width: 100%; max-height: 200px; border-radius: 8px; cursor: pointer; border: 1px solid var(--border);" id="devPhotoThumb"/>` :`<p style="font-size: 13px; color: var(--text-muted); margin: 10px 0;">Фото не прикріплено</p>`} </div> <div class="dev-note-actions"> <button type="button" class="dev-photo-upload confirm-main-btn confirm-btn-save"> ${existingPhoto ? 'Змінити' : 'Вибрати'} </button> <button type="button" class="dev-photo-back confirm-main-btn confirm-btn-neutral">Назад</button> ${existingPhoto ? `<button type="button" class="dev-photo-clear confirm-main-btn confirm-btn-discard">Видалити</button>`: ''} </div> <input type="file" accept="image/*" class="dev-photo-input" style="display: none;" />`;

  row.after(panel);
  requestAnimationFrame(() => panel.classList.add('panel-open'));

  panel.querySelector('.dev-photo-back').addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.remove('panel-open');
    setTimeout(() => panel.remove(), 280);
  });

  const thumb = panel.querySelector('#devPhotoThumb');
  if (thumb) thumb.addEventListener('click', () => showDevPhotoFullscreen(existingPhoto));

  const fileInput = panel.querySelector('.dev-photo-input');
  panel.querySelector('.dev-photo-upload').addEventListener('click', e => {
    e.stopPropagation();
    fileInput.click();
  });

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      await PhotoStorage.savePhoto(photoId, ev.target.result);
      photoBtn.style.color   = lineColor;
      photoBtn.style.opacity = '1';
      panel.classList.remove('panel-open');
      setTimeout(() => {
        panel.remove();
        toggleDevPhotoPanel(row, slug, posIdx, lineColor, photoBtn, defaultColor, defaultOpacity);
      }, 280);
    };
    reader.readAsDataURL(file);
  });

  const clearBtn = panel.querySelector('.dev-photo-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', async e => {
      e.stopPropagation();
await PhotoStorage.removePhoto(photoId);
      photoBtn.style.color   = defaultColor;
      photoBtn.style.opacity = defaultOpacity;
      panel.classList.remove('panel-open');
      setTimeout(() => panel.remove(), 280);
    });
  }
}

// ── Повноекранний перегляд фото ───────────────────────
function showDevPhotoFullscreen(src) {
  let overlay = document.getElementById('devPhotoOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'devPhotoOverlay';
    overlay.className = 'dev-photo-overlay';
    overlay.innerHTML = `<img src="" />`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => overlay.classList.remove('open'));
  }
  overlay.querySelector('img').src = src;
  requestAnimationFrame(() => overlay.classList.add('open'));
}

// ── UI: тост активації ────────────────────────────────
export function showDevModeToast(active) {
  document.querySelectorAll('.dev-mode-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'dev-mode-toast';
  toast.textContent = active ? 'Режим розробника увімкнено' : 'Режим розробника вимкнено';
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('dev-mode-toast-open'));
  setTimeout(() => {
    toast.classList.remove('dev-mode-toast-open');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

const DEV_MINI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 15 15"><path fill="currentColor" fill-rule="evenodd" d="M9.964 2.686a.5.5 0 1 0-.928-.372l-4 10a.5.5 0 1 0 .928.372zm-6.11 2.46a.5.5 0 0 1 0 .708L2.207 7.5l1.647 1.646a.5.5 0 1 1-.708.708l-2-2a.5.5 0 0 1 0-.708l2-2a.5.5 0 0 1 .708 0m7.292 0a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L12.793 7.5l-1.647-1.646a.5.5 0 0 1 0-.708" clip-rule="evenodd"/></svg>`;

export function updateDevModeIndicator(aboutSheet, active) {
  const container = aboutSheet.querySelector('#aboutDevBtnContainer');
  if (!container) return;
  container.innerHTML = '';
  if (active) {
    container.innerHTML = DEV_MINI_SVG;
    setupDevDataClear(container);
  }
}

// ── Лічильник тапів на футері ─────────────────────────
export function setupDevModeTapCounter(aboutSheet) {
  let tapCount = 0;
  let tapTimer = null;
  let lastTapTime = 0;

  const footer = aboutSheet.querySelector('.about-footer');
  if (!footer) return;

  footer.style.pointerEvents = 'auto';
  updateDevModeIndicator(aboutSheet, isDevMode());

  footer.addEventListener('click', (e) => {
    const now = Date.now();
    if (now - lastTapTime < 50) return;
    lastTapTime = now;

    tapCount++;
    clearTimeout(tapTimer);

    if (tapCount >= 5) {
      tapCount = 0;
      const nowActive = toggleDevMode();
      showDevModeToast(nowActive);
      updateDevModeIndicator(aboutSheet, nowActive);
      bus.emit('station:refresh');
    } else {
      tapTimer = setTimeout(() => { tapCount = 0; }, 2000);
    }
  });
}

// ── Очищення даних розробника ─────────────────────────
function setupDevDataClear(container) {
  let clearTaps = 0;
  let tapTimer = null;

  container.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    clearTaps++;
    clearTimeout(tapTimer);

    if (clearTaps === 1) showDevModeToast(true);

    tapTimer = setTimeout(() => {
      if (clearTaps >= 5) {
        document.querySelectorAll('.dev-mode-toast').forEach(t => t.remove());
        // Прямий виклик — без typeof guard
        bus.emit('ui:confirm', {
        message:  'Очистити всі дані режиму розробника?',

          onYes:    async () => {
            Storage.remove(STORAGE_KEYS.DEV_LOG);
            Storage.remove(STORAGE_KEYS.DEV_VERIFIED);
            Storage.remove(STORAGE_KEYS.DEV_NOTES);
            await PhotoStorage.clearAllPhotos().catch(err =>
              console.warn('[KyivMetroGO] Помилка очищення PhotoStorage:', err)
            );
            setTimeout(() => location.reload(), 180);
          },
            onNo:     null,
            onCancel: null,
            labelYes: 'Очистити',
            labelNo:  'Скасувати',
            styleYes: 'confirm-btn-discard',
            styleNo:  'confirm-btn-neutral',
          });
      }
      clearTaps = 0;
    }, 400); 
  };
}