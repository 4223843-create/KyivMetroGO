// ══ FEATURE: РЕЖИМ РОЗРОБНИКА (DEV MODE) ══
// Відповідальність: перегляд і верифікація даних позицій безпосередньо у UI станції.
// Активується прихованим жестом (5 тапів на футері About-шторки).
//
// Публічне API:
//   isDevMode()                          → boolean
//   toggleDevMode()                      → boolean
//   getDevLog()                          → LogEntry[]
//   appendDevLog(entry)                  → void
//   isVerified(slug, posIdx)             → boolean
//   toggleDevVerified(slug, posIdx)      → boolean
//   getDevNote(slug, posIdx)             → string
//   setDevNote(slug, posIdx, text)       → void
//   attachDevModeUI(container, slug)     → void
//   showDevModeToast(active)             → void
//   updateDevModeIndicator(sheet, active)→ void
//   setupDevModeTapCounter(aboutSheet)   → void


const DEV_CHECK_SVG = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M14.83 4.89l1.34.94-5.81 8.38H9.02L5.78 9.67l1.34-1.25 2.57 2.4z"/></svg>`;

const DEV_NOTE_SVG = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 12h14M5 16h6"/></svg>`;

const DEV_PHOTO_SVG = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><rect x="3" y="6" fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" width="26" height="20"/><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" points="3,22.3 11,14.3 22.5,25.9 "/><polyline fill="none" stroke="currentColor" stroke-width="2" stroke-miterlimit="10" points="17.4,20.9 22,16.3 28.9,23.2 "/></svg>`;

import { STORAGE_KEYS, Storage } from '../core/storage.js';
import { state }                  from '../core/state.js';
import { PhotoStorage }           from '../data/photoStorage.js';
import { bus }        from '../core/eventBus.js';
import { LINE_COLOR } from '../core/constants.js';
import { renderFeedbackPositions } from './feedback/fbRenderer.js';
import { auth } from '../services/firebase.js';
import { loginDev, uploadDevState, downloadDevState } from '../services/firebaseSync.js';



// ── Активація / деактивація ──────────────────────────
/** Повертає true якщо режим розробника активний. */
export function isDevMode() {
  return Storage.get(STORAGE_KEYS.DEV_MODE) === 'true';
}

/** Перемикає режим розробника. Повертає новий стан. */
export function toggleDevMode() {
  const next = !isDevMode();
  Storage.set(STORAGE_KEYS.DEV_MODE, String(next));
  return next;
}

// ── Локальний таймстамп останньої зміни (для синхронізації) ──
// Окремо від dev-логу: тут — лише "коли востаннє змінювались нотатки/
// верифікація/фото", щоб syncDevDataWithDrive() могло чесно порівняти
// "хто новіший" з updatedAt пейлоада на Google Drive.
function _touchSyncTimestamp() {
  Storage.set(STORAGE_KEYS.DEV_SYNC_LOCAL_TS, String(Date.now()));
  _scheduleAutoSync();
}

function _getSyncTimestamp() {
  return Number(Storage.get(STORAGE_KEYS.DEV_SYNC_LOCAL_TS) || 0);
}

// ── Автосинхронізація після кожної правки ─────────────
// Спрацьовує лише якщо Google Drive вже авторизовано в цій сесії (тобто
// розробник хоч раз натиснув кнопку синхронізації й пройшов вікно згоди) —
// інакше довелось би самим показувати вікно Google при кожній правці, а це
// вже нав'язливо, не "непомітно". Дебаунс 1.5с — щоб кілька швидких правок
// поспіль (наприклад, верифікація одразу кількох виходів) злились в один
// мережевий запит, а не спричиняли чергу окремих.
const AUTO_SYNC_DEBOUNCE_MS = 1500;
let _autoSyncTimer = null;

function _scheduleAutoSync() {
  // Якщо не авторизовані у Firebase — нічого не робимо
  if (!auth.currentUser) return; 
  
  clearTimeout(_autoSyncTimer);
  _autoSyncTimer = setTimeout(async () => {
    try {
      const localNotes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
      const localVerified = JSON.parse(Storage.get(STORAGE_KEYS.DEV_VERIFIED) || '{}');
      await uploadDevState(localNotes, localVerified);
      console.log('[KyivMetroGO] Автосинхронізація Firebase успішна');
    } catch (err) {
      console.warn('[KyivMetroGO] Автосинхронізація Firebase не вдалась:', err);
    }
  }, AUTO_SYNC_DEBOUNCE_MS);
}

// ── Лог змін ────────────────────────────────────────
/** @returns {object[]} масив записів про всі зміни позицій у dev-режимі */
export function getDevLog() {
  try { return JSON.parse(Storage.get(STORAGE_KEYS.DEV_LOG) || '[]'); }
  catch(e) { return []; }
}

/**
 * Додає запис до dev-лога.
 * @param {{ station:string, slug:string, dir:string, exit:string, posIdx:number, field:string, from:*, to:* }} entry
 */
export function appendDevLog(entry) {
  const log = getDevLog();
  log.push({ ts: Date.now(), ...entry });
  Storage.set(STORAGE_KEYS.DEV_LOG, JSON.stringify(log));
}

// ── Верифіковані позиції ─────────────────────────────
/**
 * @param {string} slug
 * @param {number} posIdx
 * @returns {boolean} true якщо позицію верифіковано в dev-режимі
 */
export function isVerified(slug, posIdx) {
  try {
    const v = JSON.parse(Storage.get(STORAGE_KEYS.DEV_VERIFIED) || '{}');
    return !!(v[slug]?.[posIdx]);
  } catch(e) { return false; }
}

/**
 * Перемикає прапор верифікації позиції.
 * @param {string} slug
 * @param {number} posIdx
 * @returns {boolean} новий стан верифікації
 */
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
    _touchSyncTimestamp();
    return nowOn;
  } catch(e) { return false; }
}

// ── Нотатки ──────────────────────────────────────────
/**
 * Повертає нотатку розробника для позиції або порожній рядок.
 * @param {string} slug
 * @param {number} posIdx
 * @returns {string}
 */
export function getDevNote(slug, posIdx) {
  try {
    const notes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
    return notes[slug]?.[posIdx] || '';
  } catch(e) { return ''; }
}

/**
 * Зберігає або видаляє нотатку розробника для позиції.
 * Порожній text — видаляє запис.
 * @param {string} slug
 * @param {number} posIdx
 * @param {string} text
 */
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
    _touchSyncTimestamp();
  } catch(e) {}
}

// ── UI: кнопки в картці станції ──────────────────────
/**
 * Вставляє кнопки dev-режиму (верифікація, нотатка, фото) у картку станції.
 * Нічого не робить якщо isDevMode() === false.
 * @param {HTMLElement} container — зазвичай sheetBody
 * @param {string}      slug
 */
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
  
  // Додаємо третю кнопку "Видалити" з червоним підсвічуванням (confirm-btn-discard)
  // Вона рендериться тільки якщо нотатка фізично вже існує в базі
  panel.innerHTML = `
    <textarea class="dev-note-textarea">${existingNote}</textarea> 
    <div class="dev-note-actions"> 
      <button type="button" class="dev-note-save confirm-btn-save">Зберегти</button> 
      <button type="button" class="dev-note-cancel confirm-btn-neutral">Скасувати</button> 
      ${existingNote ? `<button type="button" class="dev-note-delete confirm-btn-discard">Видалити</button>` : ''}
    </div>`;
    
  row.after(panel);
  requestAnimationFrame(() => panel.classList.add('panel-open'));

  const textarea = panel.querySelector('.dev-note-textarea');
  setTimeout(() => textarea.focus(), 60);

  // 1. ЗБЕРЕГТИ: Оновлює або створює вміст
  panel.querySelector('.dev-note-save').addEventListener('click', e => {
    e.stopPropagation();
    const text = textarea.value.trim();
    setDevNote(slug, posIdx, text);
    noteBtn.style.color   = text ? lineColor : defaultColor;
    noteBtn.style.opacity = text ? '1' : defaultOpacity;
    panel.classList.remove('panel-open');
    setTimeout(() => panel.remove(), 280);
  });

  // 2. СКАСУВАТИ: Просто закриває панель. Старі дані в Storage взагалі не чіпаємо!
  panel.querySelector('.dev-note-cancel').addEventListener('click', e => {
    e.stopPropagation();
    panel.classList.remove('panel-open');
    setTimeout(() => panel.remove(), 280);
  });

  // 3. ВИДАЛИТИ: Повністю очищує нотатку та гасить колір іконки олівця
  const deleteBtn = panel.querySelector('.dev-note-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      setDevNote(slug, posIdx, '');
      noteBtn.style.color   = defaultColor;
      noteBtn.style.opacity = defaultOpacity;
      panel.classList.remove('panel-open');
      setTimeout(() => panel.remove(), 280);
    });
  }
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
      _touchSyncTimestamp();
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
      _touchSyncTimestamp();
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
function _showToast(text) {
  document.querySelectorAll('.dev-mode-toast').forEach(t => t.remove());
  const toast = document.createElement('div');
  toast.className = 'dev-mode-toast';
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('dev-mode-toast-open'));
  setTimeout(() => {
    toast.classList.remove('dev-mode-toast-open');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

/**
 * Показує тимчасовий тост про стан dev-режиму.
 * @param {boolean} active
 */
export function showDevModeToast(active) {
  _showToast(active ? 'Режим розробника увімкнено' : 'Режим розробника вимкнено');
}

const DEV_MINI_SVG = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 15 15"><path fill="currentColor" fill-rule="evenodd" d="M9.964 2.686a.5.5 0 1 0-.928-.372l-4 10a.5.5 0 1 0 .928.372zm-6.11 2.46a.5.5 0 0 1 0 .708L2.207 7.5l1.647 1.646a.5.5 0 1 1-.708.708l-2-2a.5.5 0 0 1 0-.708l2-2a.5.5 0 0 1 .708 0m7.292 0a.5.5 0 0 1 .708 0l2 2a.5.5 0 0 1 0 .708l-2 2a.5.5 0 0 1-.708-.708L12.793 7.5l-1.647-1.646a.5.5 0 0 1 0-.708" clip-rule="evenodd"/></svg>`;

/**
 * Оновлює SVG-іконку dev-режиму у About-шторці.
 * @param {HTMLElement} aboutSheet
 * @param {boolean}     active
 */


export function updateDevModeIndicator(aboutSheet, active) {
  const container = aboutSheet.querySelector('#aboutDevBtnContainer');
  if (!container) return;
  container.innerHTML = '';

  if (active) {
    const isLogged = auth.currentUser !== null;
    
    container.innerHTML = `
      <div style="margin: 14px 0; text-align: center;">
        <button type="button" id="devFirebaseBtn" class="confirm-main-btn confirm-btn-save" style="padding: 10px 18px; font-size: 13px; margin: 0 auto; display: inline-flex; align-items: center; gap: 8px;">
          ${isLogged ? '🔄 Синхронізувати з Firebase' : '🔥 Авторизація Firebase'}
        </button>
        <div id="devFirebaseStatus" style="font-size: 12px; color: var(--text-muted); margin-top: 6px;"></div>
      </div>
    `;

    const syncBtn = container.querySelector('#devFirebaseBtn');
    const statusEl = container.querySelector('#devFirebaseStatus');

    syncBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();

      try {
        if (!auth.currentUser) {
          const email = prompt("Введіть email розробника:");
          if (!email) return;
          const pass = prompt("Введіть пароль:");
          if (!pass) return;

          statusEl.textContent = 'Авторизація...';
          await loginDev(email, pass);
          syncBtn.textContent = '🔄 Синхронізувати з Firebase';
          statusEl.textContent = 'Успішний вхід. Натисніть ще раз для синхронізації.';
          return;
        }

        syncBtn.textContent = '🔄 Синхронізація...';
        syncBtn.disabled = true;
        statusEl.textContent = 'Зчитування бази...';

        const cloudData = await downloadDevState();
        if (cloudData) {
          if (cloudData.notes) Storage.set(STORAGE_KEYS.DEV_NOTES, JSON.stringify(cloudData.notes));
          if (cloudData.verified) Storage.set(STORAGE_KEYS.DEV_VERIFIED, JSON.stringify(cloudData.verified));
        }

        statusEl.textContent = 'Відправка бази...';
        const localNotes = JSON.parse(Storage.get(STORAGE_KEYS.DEV_NOTES) || '{}');
        const localVerified = JSON.parse(Storage.get(STORAGE_KEYS.DEV_VERIFIED) || '{}');
        await uploadDevState(localNotes, localVerified);

        syncBtn.textContent = '✓ Синхронізовано';
        statusEl.textContent = 'Дані успішно оновлено';
        
        setTimeout(() => {
          syncBtn.disabled = false;
          syncBtn.textContent = '🔄 Синхронізувати з Firebase';
        }, 3000);

        bus.emit('station:refresh');

      } catch (err) {
        statusEl.textContent = 'Помилка: ' + err.message;
        syncBtn.disabled = false;
      }
    });

    setupDevDataClear(container);
  }
}

// ── Активація Dev Mode прихованим жестом (5 тапів) ──
export function setupDevModeTapCounter(aboutSheet) {
  // Відображаємо актуальний стан при відкритті шторки
  updateDevModeIndicator(aboutSheet, isDevMode());

  const trigger = aboutSheet.querySelector('.about-footer') || 
                  aboutSheet.querySelector('.about-subtitle') || 
                  aboutSheet.querySelector('.sheet-handle-bar');
  if (!trigger) return;

  let taps = 0;
  let tapTimer = null;

  trigger.addEventListener('click', (e) => {
    taps++;
    clearTimeout(tapTimer);

    tapTimer = setTimeout(() => {
      if (taps >= 5) {
        const active = toggleDevMode();
        showDevModeToast(active);
        updateDevModeIndicator(aboutSheet, active);
      }
      taps = 0;
    }, 400);
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
          onNo:      null,
          onCancel:  null,
          labelYes:  'Очистити',
          labelNo:   'Скасувати',
          styleYes:  'confirm-btn-discard',
          styleNo:   'confirm-btn-neutral',
        });
      }
      clearTaps = 0;
    }, 400); 
  };
}