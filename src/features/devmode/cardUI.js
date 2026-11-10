// ══ РЕЖИМ РОЗРОБНИКА: cardUI.js ══
// UI у картці станції: кнопка нотатки станції, кнопки рядків (підтвердження,
// ⋮, нотатка), панель підтвердження/виправлення, панель нотатки, closeAllDevPanels.
// Частина src/features/devmode.js (публічне API — там).

import { state } from '../../core/state.js';
import { escapeHtml } from '../../ui/html.js';
import { lineTextColor } from '../../ui/components.js';
import { isDevMode } from '../devFlags.js';
import { getAdjacentDoors, parseDoorValues, extractFinalValues } from '../feedback/fbUtils.js';
import { stationColor } from '../../domain/vestibules.js';
import { DEV_CHECK_SVG, DEV_CONFIRM_SVG, DEV_MORE_SVG, DEV_NOTE_SVG, DEV_PHOTO_SVG } from './icons.js';
import { _oldRowKeyFor } from './sync.js';
import { _setupDevStationPhotoButton, listPhotoIdsForPosition, toggleDevPhotoPanel } from './photos.js';
import { addDisputeVote, getConfirmationData, getDevNote, getStationNote, incrementConfirmCount, resetConfirmationData, setDevNote, setFinalConfirmed, setStationNote, undoLastConfirmAction } from './data.js';

/**
 * Показує/ховає кнопку загальної нотатки станції (праворуч від серця) і
 * прив'язує відкриття панелі. Викликається при кожному відкритті/оновленні
 * картки станції — так само, як attachDevModeUI.
 * @param {HTMLElement} sheet  — #stationSheet (не sheetBody — кнопка й панель поза ним)
 * @param {string} slug
 * @param {string} lineColor
 */
// Останній slug, для якого малювалась кнопка/панель нотатки станції —
// щоб при переході на ІНШУ станцію панель гарантовано закривалась і
// очищалась (інакше нотатка з попередньої станції "протікала" на нову,
// поки її не закриють руками).
let _lastStationNoteSlug = null;

export function setupDevStationNoteButton(sheet, slug, rawLineColor) {
  // Той самий відтінок, що й серце та годинник поруч (у світлій темі темніший)
  const lineColor = lineTextColor(rawLineColor);
  const btn = sheet.querySelector('#devStationNoteBtn');
  if (!btn) return;
  // Панель з index.html; якщо її колись видалили з DOM — створюємо заново,
  // інакше кнопка нотатки до перезапуску нічого не відкриває.
  let panel = sheet.querySelector('#devStationNotePanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'devStationNotePanel';
    panel.className = 'dev-note-panel dev-station-note-panel';
    sheet.querySelector('#sheetBody')?.before(panel);
  }

  const active = isDevMode();
  btn.classList.toggle('is-hidden', !active);
  _setupDevStationPhotoButton(sheet, slug, lineColor, active);
  if (!active) {
    panel.classList.remove('panel-open');
    panel.innerHTML = '';
    _lastStationNoteSlug = null;
    return;


  }



  if (slug !== _lastStationNoteSlug) {
    // Це інша станція, ніж та, для якої панель могла бути відкрита —
    // закриваємо й чистимо вміст, щоб чужа нотатка не малювалась тут.
    panel.classList.remove('panel-open');
    panel.innerHTML = '';
    _lastStationNoteSlug = slug;
  }

  // Орієнтир видимості — той самий сірий, що й у хрестика закриття шторки
  const defaultColor = 'var(--text-muted)';
  btn.innerHTML = DEV_NOTE_SVG;

  const hasNote = !!getStationNote(slug);
  btn.style.color = hasNote ? lineColor : defaultColor;

  btn.onclick = e => {
    e.stopPropagation();
    _toggleStationNotePanel(panel, slug, lineColor, btn, defaultColor);
  };
}

function _toggleStationNotePanel(panel, slug, lineColor, btn, defaultColor) {
  if (panel.classList.contains('panel-open')) {
    panel.classList.remove('panel-open');
    return;
  }

  // Закриваємо та видаляємо відкриті нотатки виходів, але НЕ панель станції
  document.querySelectorAll('.dev-note-panel').forEach(p => {
    if (p !== panel) {
      p.classList.remove('panel-open');
      setTimeout(() => p.remove(), 280);
    }
  });

  const currentText = getStationNote(slug);
  panel.innerHTML = `
    <textarea class="dev-note-textarea dev-station-note-textarea" placeholder="Загальна нотатка по станції…">${escapeHtml(currentText)}</textarea>
    <div class="dev-note-actions">
      <button type="button" class="dev-station-note-save confirm-btn-save">Готово</button>
      ${currentText ? `<button type="button" class="dev-station-note-delete confirm-btn-discard">Видалити</button>` : ''}
    </div>`;

  const textarea = panel.querySelector('textarea');
  textarea.addEventListener('input', () => {
    setStationNote(slug, textarea.value, true);
    btn.style.color = textarea.value.trim() ? lineColor : defaultColor;
  });

  panel.querySelector('.dev-station-note-save').addEventListener('click', e => {
    e.stopPropagation();
    setStationNote(slug, textarea.value.trim(), false);
    btn.style.color = textarea.value.trim() ? lineColor : defaultColor;
    panel.classList.remove('panel-open');
  });

  const deleteBtn = panel.querySelector('.dev-station-note-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', e => {
      e.stopPropagation();
      setStationNote(slug, '', false);
      btn.style.color = defaultColor;
      panel.classList.remove('panel-open');
    });
  }

  panel.classList.add('panel-open');
  requestAnimationFrame(() => textarea.focus());
}

// ── UI: кнопки в картці станції ──────────────────────
/**
 * Вставляє кнопки dev-режиму (верифікація, нотатка, фото) у картку станції.
 * Нічого не робить якщо isDevMode() === false.
 * @param {HTMLElement} container — зазвичай sheetBody
 * @param {string}      slug
 */
function _closeDevMoreMenus() {
  document.querySelectorAll('.dev-more-menu.is-open').forEach(m => m.classList.remove('is-open'));
}
document.addEventListener('click', _closeDevMoreMenus);

// Меню «⋮» за замовчуванням відкривається вниз; якщо внизу не влазить
// (останній рядок картки, низ екрана) — відкриваємо вгору.
function _placeDevMoreMenu(menu) {
  menu.classList.remove('is-up');
  const rect = menu.getBoundingClientRect();
  let bottomLimit = window.visualViewport?.height ?? window.innerHeight;
  let topLimit = 0;
  for (let el = menu.parentElement; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if (oy === 'auto' || oy === 'scroll' || oy === 'hidden') {
      const r = el.getBoundingClientRect();
      bottomLimit = Math.min(bottomLimit, r.bottom);
      topLimit = Math.max(topLimit, r.top);
    }
  }
  if (rect.bottom <= bottomLimit - 8) return;
  menu.classList.add('is-up');
  // Якщо й угорі місця менше, ніж унизу — лишаємо вниз
  const up = menu.getBoundingClientRect();
  if (up.top < topLimit + 8 && (topLimit - up.top) > (rect.bottom - bottomLimit)) {
    menu.classList.remove('is-up');
  }
}

export function attachDevModeUI(container, slug) {
  if (!isDevMode()) return;
  // Відтінок лінії з урахуванням теми — як у пілюль, серця й шпильок картки
  const lineColor = lineTextColor(stationColor(state.stationsData?.[slug]));

  const defaultColor   = 'var(--dev-icon)';
  const defaultOpacity = '1';

  container.querySelectorAll('.position-row').forEach((row, rowIdx) => {
    if (row.querySelector('.dev-confirm-btn')) return;

    // Дані розробника зберігаються за стабільним ключем рядка (devRowKey);
    // rowIdx — старий порядковий номер, потрібен лише для старих фото.
    const posIdx = row.dataset.rowKey || String(rowIdx);
    row.dataset.devPosIdx = rowIdx;
    // Фото, зняті до появи id позицій, лежать під старим ключем рядка
    row.dataset.devOldKey = _oldRowKeyFor(slug, posIdx);
    row.dataset.devSlug   = slug;

    // ── Кнопка «Підтвердження» (єдина — замінює колишню окрему галочку) ──
    // Стани іконки:
    //  - ще ніхто не чіпав          → сіра (як і решта неактивних кнопок)
    //  - лише "+1" (без спростувань) → кольорова (колір лінії), бейдж з цифрою
    //  - є хоч одне спростування     → бейдж стає темним/чорним (сигнал "є розбіжність")
    //  - "100%" (остаточно)          → повністю змінюється на іконку галочки (як стара)
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'dev-confirm-btn';
    confirmBtn.type = 'button';

    const renderConfirmBtn = () => {
      const data = getConfirmationData(slug, posIdx);

      if (data.finalConfirmed) {
        confirmBtn.classList.remove('is-text-badge');
        confirmBtn.classList.add('is-final');
        confirmBtn.innerHTML = DEV_CHECK_SVG;
        confirmBtn.style.color   = lineColor;
        confirmBtn.style.opacity = '1';
        return;
      }

      const hasConfirm = data.confirmCount > 0;
      const hasDispute = data.disputeCount > 0;

      if (!hasConfirm && !hasDispute) {
        confirmBtn.classList.remove('is-final', 'is-text-badge');
        confirmBtn.innerHTML = DEV_CONFIRM_SVG;
        confirmBtn.style.color   = defaultColor;
        confirmBtn.style.opacity = defaultOpacity;
        return;
      }

      // Плоский текстовий індикатор замість круглого бейджа: +N — тільки
      // підтвердження, −N — тільки спростування, ±N — є і те, і те (N тут
      // це баланс confirmCount−disputeCount зі знаком). Якщо кількість
      // дорівнює 1 у "чистому" +/− випадку — цифру не пишемо, лишається
      // сам знак; для ± цифра пишеться завжди (включно з 1).
      let text;
      let badgeColor;
      if (hasConfirm && !hasDispute) {
        text = data.confirmCount === 1 ? '+' : `+${data.confirmCount}`;
        badgeColor = lineColor;
      } else if (hasDispute && !hasConfirm) {
        text = data.disputeCount === 1 ? '−' : `−${data.disputeCount}`;
        badgeColor = 'var(--text)'; // контрастний, щоб «−» було добре видно на картці
      } else {
        // Є і підтвердження, і спростування — просто "±", без цифри
        text = '±';
        badgeColor = 'var(--text)';
      }

      confirmBtn.classList.remove('is-final');
      confirmBtn.classList.add('is-text-badge');
      confirmBtn.innerHTML = `<span class="dev-confirm-text${text.length > 1 ? ' has-count' : ''}">${text}</span>`;
      confirmBtn.style.color   = badgeColor;
      confirmBtn.style.opacity = '1';
    };
    renderConfirmBtn();

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

    // ── «⋮» праворуч від піна: ховає нотатку і фото, щоб ліворуч лишалась
    //    тільки кнопка підтвердження і не перекривала значки доступності ──
    const moreBtn = document.createElement('button');
    moreBtn.className = 'dev-more-btn';
    moreBtn.type = 'button';
    moreBtn.setAttribute('aria-label', 'Нотатка і фото');
    moreBtn.innerHTML = DEV_MORE_SVG;

    const moreMenu = document.createElement('div');
    moreMenu.className = 'dev-more-menu';
    moreMenu.append(noteBtn, photoBtn);

    // «⋮» підсвічується кольором лінії, якщо є нотатка або фото
    const syncMoreColor = () => {
      const active = [noteBtn, photoBtn].some(b => b.style.color !== defaultColor);
      moreBtn.style.color = active ? lineColor : defaultColor;
    };
    syncMoreColor();
    const colorObserver = new MutationObserver(syncMoreColor);
    colorObserver.observe(noteBtn,  { attributes: true, attributeFilter: ['style'] });
    colorObserver.observe(photoBtn, { attributes: true, attributeFilter: ['style'] });

    row.prepend(confirmBtn);
    row.append(moreBtn, moreMenu);

    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = !moreMenu.classList.contains('is-open');
      _closeDevMoreMenus();
      moreMenu.classList.toggle('is-open', willOpen);
      if (willOpen) _placeDevMoreMenu(moreMenu);
    });

    listPhotoIdsForPosition(slug, posIdx, [rowIdx, row.dataset.devOldKey]).then(ids => {
      if (ids.length) {
        photoBtn.style.color   = lineColor;
        photoBtn.style.opacity = '1';
      }
    }).catch(() => {});

    confirmBtn.addEventListener('click', e => {
      e.stopPropagation();
      toggleDevConfirmPanel(row, slug, posIdx, lineColor, renderConfirmBtn);
    });

    noteBtn.addEventListener('click', e => {
      e.stopPropagation();
      _closeDevMoreMenus();
      toggleDevNotePanel(row, slug, posIdx, lineColor, noteBtn, defaultColor, defaultOpacity);
    });

    photoBtn.addEventListener('click', e => {
      e.stopPropagation();
      _closeDevMoreMenus();
      toggleDevPhotoPanel(row, slug, posIdx, lineColor, photoBtn, defaultColor, defaultOpacity, container);
    });
  });
}

// ── UI: панель підтвердження / виправлення ────────────
// Інтерфейс степера вагон/двері скопійований з "Запропонувати зміни"
// (fb-input-wrap/fb-stepper/fb-step/fb-step-val у fbRenderer.js) — той самий
// вигляд, лише спрощена логіка кроку (без сусідніх дверей і другого виходу,
// тут потрібен просто прямий вибір вагон+двері). Степер стартує з ПОТОЧНИХ
// фактичних значень позиції (беремо з .fav-tap-target у самому рядку), а не
// з довільної 1/1.
// Рядки степерів для виправлення «−1»: основні двері, другі (+1, лише
// сусідні) і треті (якщо позиція вже була діапазоном із трьох дверей).
// Розмітка й правила ті самі, що у формі «Локальні зміни» (fbRenderer/fbEvents).
function _fixStepperHtml(slot, role, value, label) {
  const [min, max] = role === 'w' ? [1, 5] : [1, 4];
  return `<div class="fb-input-wrap">
    <span class="fb-input-label">${label}</span>
    <div class="fb-stepper">
      <button type="button" class="fb-step fb-step-down" data-slot="${slot}" data-role="${role}" data-min="${min}" data-max="${max}" aria-label="Зменшити ${label}">−</button>
      <span class="fb-step-val" aria-live="polite">${value}</span>
      <button type="button" class="fb-step fb-step-up" data-slot="${slot}" data-role="${role}" data-min="${min}" data-max="${max}" aria-label="Збільшити ${label}">+</button>
    </div>
  </div>`;
}

function _fixRowHtml(slot, w, d, lineColor) {
  const cancel = slot === 'main' ? '' :
    `<button type="button" class="fb-cancel-extra-btn dev-fix-cancel" data-slot="${slot}"
       style="color:${lineTextColor(lineColor)}" aria-label="Прибрати ці двері">✕</button>`;
  return `<div class="fb-pos-wrap">
    <div class="fb-side-actions-left"></div>
    <div class="fb-pos-inputs">
      ${_fixStepperHtml(slot, 'w', w, 'вагон')}
      ${_fixStepperHtml(slot, 'd', d, 'двері')}
    </div>
    <div class="fb-side-actions">${cancel}</div>
  </div>`;
}

function _fixRowsHtml(fix, lineColor) {
  return [
    _fixRowHtml('main', fix.wMain, fix.dMain, lineColor),
    fix.hasExtra ? _fixRowHtml('ex',  fix.wEx,  fix.dEx,  lineColor) : '',
    fix.hasThird ? _fixRowHtml('ex2', fix.wEx2, fix.dEx2, lineColor) : '',
    fix.hasExtra ? '' :
      `<div class="fb-add-doors-row"><button type="button" class="fb-add-doors-link dev-fix-add">+1</button></div>`,
  ].join('');
}

// Треті двері: сусідні з другими, у тому самому вагоні, що й основні
// (щоб виходив суцільний діапазон «1-3»), і не збігаються з основними.
function _thirdDoorOptions(fix) {
  return getAdjacentDoors(fix.wEx, fix.dEx)
    .filter(a => a.w === fix.wMain && fix.wEx === fix.wMain && a.d !== fix.dMain);
}

// Після зміни основних/других дверей підтягує залежні рядки, щоб вони
// лишалися сусідніми (інакше вийшов би неможливий «діапазон»).
function _revalidateFix(fix) {
  if (!fix.hasExtra) return;
  const adj = getAdjacentDoors(fix.wMain, fix.dMain);
  if (!adj.some(a => a.w === fix.wEx && a.d === fix.dEx)) { fix.wEx = adj[0].w; fix.dEx = adj[0].d; }
  if (!fix.hasThird) return;
  const opts = _thirdDoorOptions(fix);
  if (!opts.some(a => a.w === fix.wEx2 && a.d === fix.dEx2)) {
    if (opts.length) { fix.wEx2 = opts[0].w; fix.dEx2 = opts[0].d; }
    else { fix.hasThird = false; fix.wEx2 = '-'; fix.dEx2 = '-'; }
  }
}

function _cycle(options, w, d, step) {
  const i = options.findIndex(a => a.w === w && a.d === d);
  return options[i === -1 ? 0 : (i + step + options.length) % options.length];
}

function _applyFixAction(fix, btn) {
  if (btn.classList.contains('dev-fix-add')) {
    const adj = getAdjacentDoors(fix.wMain, fix.dMain);
    Object.assign(fix, { hasExtra: true, wEx: adj[0].w, dEx: adj[0].d });
    return;
  }
  if (btn.classList.contains('dev-fix-cancel')) {
    if (btn.dataset.slot === 'ex') {
      // Як у «Локальних змінах»: ✕ других дверей прибирає й треті
      Object.assign(fix, { hasExtra: false, hasThird: false, wEx: '-', dEx: '-', wEx2: '-', dEx2: '-' });
    } else {
      Object.assign(fix, { hasThird: false, wEx2: '-', dEx2: '-' });
    }
    return;
  }
  const step = btn.classList.contains('fb-step-up') ? 1 : -1;
  const slot = btn.dataset.slot;
  if (slot === 'main') {
    const key = btn.dataset.role === 'w' ? 'wMain' : 'dMain';
    const min = parseInt(btn.dataset.min), max = parseInt(btn.dataset.max);
    fix[key] = Math.max(min, Math.min(max, fix[key] + step));
  } else if (slot === 'ex') {
    // Другі двері гортаються лише серед сусідніх з основними
    const next = _cycle(getAdjacentDoors(fix.wMain, fix.dMain), fix.wEx, fix.dEx, step);
    fix.wEx = next.w; fix.dEx = next.d;
  } else {
    const opts = _thirdDoorOptions(fix);
    if (opts.length) { const next = _cycle(opts, fix.wEx2, fix.dEx2, step); fix.wEx2 = next.w; fix.dEx2 = next.d; }
  }
  _revalidateFix(fix);
}

function toggleDevConfirmPanel(row, slug, posIdx, lineColor, onUpdate) {
  const next = row.nextElementSibling;

  if (next?.classList.contains('dev-note-panel') && next.dataset.type === 'confirm') {
    next.classList.remove('panel-open');
    setTimeout(() => next.remove(), 280);
    return;
  }

  document.querySelectorAll('.dev-note-panel').forEach(p => {
    p.classList.remove('panel-open');
    if (p.id !== 'devStationNotePanel') {
      setTimeout(() => p.remove(), 280);
    }
  });

  // Поточні фактичні вагон/двері цієї позиції — дефолт для степера виправлення.
  // Розбираємо так само, як форма «Локальні зміни» (діапазон «1-3», пара «2, 3»),
  // щоб і виправлення можна було вказати діапазоном дверей.
  const currentTarget = row.querySelector('.fav-tap-target');
  const fix = parseDoorValues(currentTarget?.dataset.wagon || '1', currentTarget?.dataset.doors || '1');

  const renderCorrectionsList = (data) => {
    const entries = Object.entries(data.corrections);
    if (!entries.length) return '';
    return `<div class="dev-confirm-corrections">
      ${entries.map(([key, count]) => {
        const [w, d] = key.split('/');
        return `<div class="dev-confirm-correction-row">Вагон ${w} / двері ${d} — ${count} ${count === 1 ? 'раз' : 'рази'}</div>`;
      }).join('')}
    </div>`;
  };

  const panel = document.createElement('div');
  panel.className = 'dev-note-panel dev-confirm-panel';
  panel.dataset.type = 'confirm';

  const paint = () => {
    const data = getConfirmationData(slug, posIdx);
    const netCount = data.confirmCount - data.disputeCount;

    panel.innerHTML = `
      <div class="dev-confirm-count-line">
        ${data.finalConfirmed
          ? '<b>Остаточно підтверджено (100%)</b>'
          : `Підтверджень: <b>${data.confirmCount}</b>, спростувань: <b>${data.disputeCount}</b> (разом: ${netCount})`}
      </div>
      ${renderCorrectionsList(data)}
      <div class="dev-note-actions dev-confirm-main-actions">
        <button type="button" class="dev-confirm-final confirm-btn-save">100%</button>
        <button type="button" class="dev-confirm-plus confirm-btn-save">+1</button>
        <button type="button" class="dev-confirm-minus confirm-btn-discard">−1</button>
      </div>
      <div class="dev-confirm-fix-wrap is-hidden">
        <div class="dev-confirm-fix-rows">${_fixRowsHtml(fix, lineColor)}</div>
        <button type="button" class="dev-confirm-save-fix confirm-btn-save">Зберегти виправлення</button>
      </div>
      <div class="dev-confirm-secondary-actions">
        <button type="button" class="dev-confirm-undo" ${data.lastAction ? '' : 'disabled'}>Скасувати останню дію</button>
        <button type="button" class="dev-confirm-reset">Скинути лічильник</button>
      </div>`;

    const fixRows = panel.querySelector('.dev-confirm-fix-rows');
    fixRows.addEventListener('click', e => {
      const btn = e.target.closest('.fb-step, .dev-fix-cancel, .dev-fix-add');
      if (!btn) return;
      e.stopPropagation();
      _applyFixAction(fix, btn);
      fixRows.innerHTML = _fixRowsHtml(fix, lineColor);
    });

    const closePanel = () => {
      panel.classList.remove('panel-open');
      setTimeout(() => panel.remove(), 280);
    };

    panel.querySelector('.dev-confirm-final').addEventListener('click', e => {
      e.stopPropagation();
      setFinalConfirmed(slug, posIdx);
      onUpdate();
      closePanel();
    });

    panel.querySelector('.dev-confirm-plus').addEventListener('click', e => {
      e.stopPropagation();
      incrementConfirmCount(slug, posIdx);
      onUpdate();
      closePanel();
    });

    panel.querySelector('.dev-confirm-minus').addEventListener('click', e => {
      e.stopPropagation();
      panel.querySelector('.dev-confirm-fix-wrap').classList.toggle('is-hidden');
    });

    panel.querySelector('.dev-confirm-save-fix').addEventListener('click', e => {
      e.stopPropagation();
      const { finalW, finalD } = extractFinalValues(fix);
      addDisputeVote(slug, posIdx, finalW, finalD);
      onUpdate();
      closePanel();
    });

    panel.querySelector('.dev-confirm-undo').addEventListener('click', e => {
      e.stopPropagation();
      undoLastConfirmAction(slug, posIdx);
      onUpdate();
      paint();
    });

    panel.querySelector('.dev-confirm-reset').addEventListener('click', e => {
      e.stopPropagation();
      resetConfirmationData(slug, posIdx);
      onUpdate();
      paint();
    });
  };

  paint();
  row.after(panel);
  requestAnimationFrame(() => panel.classList.add('panel-open'));
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
    if (p.id !== 'devStationNotePanel') {
      setTimeout(() => p.remove(), 280);
    }
  });

  const existingNote = getDevNote(slug, posIdx);
  const panel = document.createElement('div');
  panel.className = 'dev-note-panel';
  panel.dataset.type = 'note';
  
  // Додаємо третю кнопку "Видалити" з червоним підсвічуванням (confirm-btn-discard)
  // Вона рендериться тільки якщо нотатка фізично вже існує в базі
  panel.innerHTML = `
    <textarea class="dev-note-textarea">${escapeHtml(existingNote)}</textarea> 
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



export function closeAllDevPanels() {
  // Закриваємо панелі та видаляємо з DOM лише динамічні панелі виходів
  document.querySelectorAll('.dev-note-panel, .dev-station-note-modal, .dev-note-overlay')
    .forEach(el => {
      el.classList.remove('panel-open', 'modal-open');
      if (el.id !== 'devStationNotePanel') {
        el.remove();
      }
    });
}
