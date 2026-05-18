// ══ FEEDBACK RENDERER ══
// Відповідальність: state → HTML-рядок.
// Правило: жодних addEventListener тут. Лише генерація розмітки.
// DOM-запис — лише один: posEl.innerHTML = ... в кінці renderFeedbackPositions.

import { state as appState }                      from '@core/state.js';
import { getLocalEdits, hasLocalEdits }           from '@data/localEdits.js';
import { fbState, initFeedbackState }             from './fbState.js';
import { Icons }                                  from '@ui/icons.js';
import { LINE_COLOR, STATIONS_WITH_POTENTIAL_EXITS } from '@core/constants.js';

// ── Константи ────────────────────────────────────────────────

const INFO_SVG = Icons.info;
const UNDO_SVG = Icons.undo;
const PENCIL   = Icons.pencil;

// ── Атомарні генератори ──────────────────────────────────────

/**
 * @returns {string} HTML-розмітка одного stepper-поля
 */
function stepperHtml(id, value, min, max, label) {
  return `<div class="fb-input-wrap">
    <span class="fb-input-label">${label}</span>
    <div class="fb-stepper">
      <button type="button" class="fb-step fb-step-down"
        aria-label="Зменшити ${label}"
        data-id="${id}" data-min="${min}" data-max="${max}">−</button>
      <span class="fb-step-val" id="${id}" aria-live="polite">${value}</span>
      <button type="button" class="fb-step fb-step-up"
        aria-label="Збільшити ${label}"
        data-id="${id}" data-min="${min}" data-max="${max}">+</button>
    </div>
  </div>`;
}

/**
 * @returns {string} HTML блоку label-рядка для одного виходу
 */
function exitLabelHtml(idx, rawExit) {
  const escaped = rawExit.replace(/"/g, '&quot;');
  const editOrAdd = rawExit
    ? `<button type="button" class="fb-exit-label-edit-btn" data-item-idx="${idx}" aria-label="Редагувати">${PENCIL}</button>`
    : `<button type="button" class="fb-add-desc-btn" data-item-idx="${idx}">додати опис</button>`;

  return `<div class="fb-exit-label-row">
    <div class="fb-exit-label-row-inner">
      <span class="fb-exit-label-text">${rawExit}</span>
      ${editOrAdd}
    </div>
  </div>
  <div class="fb-exit-label-input-wrap" id="fbLabelWrap${idx}">
    <input type="text" class="fb-exit-label-input"
      id="fbLabelInput${idx}" value="${escaped}" maxlength="60">
  </div>`;
}

/**
 * @returns {string} HTML одного рядка позиції (відкритий або закритий)
 */
function positionItemHtml(item, st, lineColor) {
  const { i }    = item;
  const isClosed = !!st.isClosed;

  const closedBlock = `
    <div class="fb-closed-note-wrap">
      <span class="fb-closed-note">Вихід позначено як недоступний</span>
      <button type="button" class="fb-restore-exit"
        data-idx="${i}" aria-label="Відновити вихід">${UNDO_SVG}</button>
    </div>`;

  const openBlock = `
    <div class="fb-pos-wrap">
      <div class="fb-side-actions-left">
        <button type="button" class="fb-add-doors-info"
          style="color:${lineColor}" data-idx="${i}">${INFO_SVG}</button>
      </div>
      <div class="fb-pos-inputs">
        ${stepperHtml(`fbW${i}`, st.wMain, 1, 5, 'вагон')}
        ${stepperHtml(`fbD${i}`, st.dMain, 1, 4, 'двері')}
      </div>
      <div class="fb-side-actions">
        <button type="button" class="fb-close-exit"
          style="color:${lineColor}" data-idx="${i}">✕</button>
      </div>
    </div>

    <div class="fb-extra-door-wrap ${st.hasExtra ? '' : 'is-hidden'}" id="fbExtraWrap${i}">
      <div class="fb-pos-wrap" style="margin-top:4px">
        <div class="fb-side-actions-left"></div>
        <div class="fb-pos-inputs">
          ${stepperHtml(`fbW_ex${i}`, st.wEx, 1, 5, 'вагон')}
          ${stepperHtml(`fbD_ex${i}`, st.dEx, 1, 4, 'двері')}
        </div>
        <div class="fb-side-actions">
          <button type="button" class="fb-cancel-extra-btn"
            style="color:${lineColor}" data-idx="${i}">✕</button>
        </div>
      </div>
    </div>

    <div class="fb-extra-door-wrap ${st.hasThird ? '' : 'is-hidden'}" id="fbExtraWrap2_${i}">
      <div class="fb-pos-wrap" style="margin-top:4px">
        <div class="fb-side-actions-left"></div>
        <div class="fb-pos-inputs">
          ${stepperHtml(`fbW_ex2_${i}`, st.wEx2, 1, 5, 'вагон')}
          ${stepperHtml(`fbD_ex2_${i}`, st.dEx2, 1, 4, 'двері')}
        </div>
        <div class="fb-side-actions">
          <button type="button" class="fb-cancel-third-btn"
            style="color:${lineColor}" data-idx="${i}">✕</button>
        </div>
      </div>
    </div>

    <div class="fb-add-doors-row ${st.hasExtra ? 'is-hidden' : ''}" id="fbAddDoorsRow${i}">
      <button type="button" class="fb-add-doors-link"
        id="fbAddBtn${i}" data-idx="${i}"
        data-can-have-third="${st.hasThird ? '1' : '0'}">+1</button>
    </div>

    <div class="fb-add-doors-hint" id="fbHint${i}">
      <div class="fb-add-doors-hint-inner">
        <div class="hint-1-door">
          <p>+1 — другі зручні двері для виходу. Можна&nbsp;обрати тільки&nbsp;сусідні&nbsp;двері</p>
          <p><span style="color:var(--line-red)">✕</span> позначає&nbsp;вихід як&nbsp;тимчасово&nbsp;недоступний</p>
        </div>
        <div class="hint-2-doors">
          <p><span style="color:var(--line-blue)">✕</span> скасовує додавання других дверей.</p>
        </div>
      </div>
    </div>`;

  const classes = [
    'fb-item-inner',
    st.hasExtra ? 'fb-pos-multi has-extra-doors' : '',
    st.hasThird ? 'has-three-doors'               : '',
    isClosed    ? 'fb-pos-closed'                 : '',
  ].filter(Boolean).join(' ');

  return `${exitLabelHtml(i, fbState.labels[i] ?? '')}
    <div class="${classes}" data-idx="${i}" id="fbItemInner${i}">
      ${isClosed ? closedBlock : openBlock}
    </div>`;
}

/**
 * @returns {string} HTML однієї групи виходів (напрям + items + кнопка «додати»)
 */
function dirGroupHtml(g, slug, lineColor) {
  const dirLabel = g.dir === '__long_transfer__'
    ? 'Довгий перехід на Майдан Незалежності'
    : g.dir;

  const itemsHtml = g.items.map((item, index) => {
    const st      = fbState.current[item.i] ?? { wMain: 1, dMain: 1, isClosed: false };
    const divider = index < g.items.length - 1 ? '<div class="fb-item-divider"></div>' : '';
    return positionItemHtml(item, st, lineColor) + divider;
  }).join('');

  const canAddMore  = STATIONS_WITH_POTENTIAL_EXITS.has(slug);
  const hasNewAlrdy = Object.values(fbState.current).some(s => s.isNew && s.dir === g.dir);
  const addBtnHtml  = (canAddMore && !hasNewAlrdy)
    ? `<div class="fb-add-exit-row">
         <button type="button" class="fb-add-exit-btn" data-dir="${g.dir}">
           + Додати ще один вихід
         </button>
       </div>`
    : '';

  return `<div class="fb-pos-row">
    <div class="fb-dir-label-wrap"><div class="fb-dir-label">${dirLabel}</div></div>
    ${itemsHtml}
    ${addBtnHtml}
  </div>`;
}

// ── Головна функція рендеру ──────────────────────────────────

/**
 * Єдина точка, що пише у DOM.
 * Читає fbState + appState, генерує HTML, робить один innerHTML =.
 * Після запису — викликає onAfterRender (зазвичай markFeedbackDirty).
 *
 * @param {string|null} slug
 * @param {{ onAfterRender?: () => void }} [opts]
 */
export function renderFeedbackPositions(slug, { onAfterRender } = {}) {
  const posEl   = document.getElementById('fbPositions');
  const sendBtn = document.getElementById('fbSend');
  if (!posEl || !sendBtn) return;

  if (!slug) {
    posEl.innerHTML  = '';
    sendBtn.disabled = true;
    return;
  }

  if (fbState.slug !== slug) initFeedbackState(slug);

  try {
    const s         = appState.stationsData[slug];
    const lineColor = LINE_COLOR[s?.line] ?? 'var(--text-muted)';

    // Оновлюємо заголовок шторки
    const titleEl     = document.getElementById('fbStationTitle');
    const mainTitleEl = document.getElementById('fbSheetTitle');
    if (titleEl && mainTitleEl) {
      titleEl.textContent = s.name;
      titleEl.hidden      = false;
      mainTitleEl.hidden  = true;
    }

    // Збираємо групи напрямів
    const groupsMap = new Map();

    s?.positions?.forEach((p, i) => {
      const dir = p.dir || '';
      if (!groupsMap.has(dir)) groupsMap.set(dir, { dir, items: [] });
      groupsMap.get(dir).items.push({ p, i });
    });

    // Додаємо нові (isNew) виходи з fbState
    Object.keys(fbState.current).forEach(idx => {
      const st = fbState.current[idx];
      if (!st.isNew) return;
      const dir = st.dir || '';
      if (!groupsMap.has(dir)) groupsMap.set(dir, { dir, items: [] });
      groupsMap.get(dir).items.push({
        p: { dir, exit: fbState.labels[idx] || '', wagon: st.wMain, doors: st.dMain },
        i: parseInt(idx),
      });
    });

    // Один запис у DOM
    posEl.innerHTML = [...groupsMap.values()]
      .map(g => dirGroupHtml(g, slug, lineColor))
      .join('');

  } catch (err) {
    posEl.innerHTML = `
      <div style="color:var(--line-red);padding:16px;text-align:center;
                  font-size:14px;background:var(--bg-card);border-radius:12px;">
        Помилка рендеру:<br>${err.message}
      </div>`;
    console.error('[fbRenderer] Render error:', err);
  }

  onAfterRender?.();
}

/**
 * Рендерить кнопку «Скинути локальні зміни».
 * Окрема функція — бо її потрібно перемалювати після submit/restore.
 *
 * @param {{ onReset: () => void }} callbacks
 */
export function renderResetBtn({ onReset } = {}) {
  const wrap = document.getElementById('fbResetWrap');
  if (!wrap) return;

  const show = hasLocalEdits() && !fbState.slug;
  wrap.innerHTML = show
    ? '<button id="fbReset" class="fb-reset-btn">Скинути локальні зміни</button>'
    : '';

  document.getElementById('fbReset')?.addEventListener('click', () => onReset?.());
}

/**
 * Рендерить список станцій у шторці вибору станції.
 * Чиста функція: state → innerHTML рядок.
 *
 * @param {string} activeLine  — '' означає «всі»
 * @param {string} activeSlug  — поточно обраний slug (для підсвітки)
 * @returns {string} HTML для вставки у #fbStationList
 */
export function stationListHtml(activeLine, activeSlug = '') {
  return Object.entries(appState.stationsData ?? {})
    .map(([sl, st]) => ({ slug: sl, ...st }))
    .filter(st => activeLine === '' || st.line === activeLine)
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'))
    .map(st => {
      const color  = LINE_COLOR[st.line] ?? '#888';
      const active = st.slug === activeSlug ? ' fb-station-active' : '';
      return `<div class="search-item fb-station-item${active}" data-slug="${st.slug}">
        <div class="search-item-line" style="background-color:${color}"></div>
        <div>${st.name}</div>
      </div>`;
    })
    .join('');
}
