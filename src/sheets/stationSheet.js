// ══ STATION SHEET ══
// Відповідальність: відкриття/оновлення картки станції.
// Рендер HTML    → renderStation.js  (renderDirections, applyFavPillStyles)
// Жести / події  → stationEvents.js  (bindSheetGestures, applyInitialFavStyles)
// Зворотний зв'язок між модулями — через bus (eventBus.js).

import { state }                   from '../core/state.js';
import { STORAGE_KEYS, Storage }   from '../core/storage.js';
import { pill, heartSvg }          from '../ui/components.js';
import { slugByName }              from '../data/stations.js';
import { applyExitLabels }         from '../data/localEdits.js';
import { isFav, getExitFavs }      from '../features/favorites.js';
import { attachDevModeUI }         from '../features/devmode.js';
import { bus }                     from '../core/eventBus.js';
import { bindSheetGestures, applyInitialFavStyles } from './stationEvents.js';

// ══ DOM-вузли (існують в index.html, не lazy) ══
const sheet            = document.getElementById('stationSheet');
const sheetBody        = document.getElementById('sheetBody');
const sheetOverlay     = document.getElementById('sheetOverlay');
const stationTitleMain = document.getElementById('stationTitleMain');

// ══ ФОРМАТУВАННЯ ══

function formatDirLabel(raw) {
  if (!raw) return raw;
  const match = raw.trim().match(/^([^\s&]+)(?:\s+|&nbsp;)(.*)$/i);
  if (!match) return raw;
  return `${match[1].toLowerCase()} <span class="dir-name-caps">${match[2]}</span>`;
}

function formatLabel(raw) {
  const text      = raw.trim();
  const cleanText = text.replace(/&nbsp;/g, ' ').toLowerCase();
  const isTransfer = cleanText.includes('пересадка') || cleanText.includes('перехід');
  if (isTransfer) {
    const targetSlug = slugByName(cleanText);
    if (targetSlug && state.stationsData?.[targetSlug]) {
      const color = MetroApp.LINE_COLOR[state.stationsData[targetSlug].line];
      return `<span class="transfer-label">` +
        `<span class="transfer-line" style="background:${color}"></span>` +
        `<span class="transfer-text">${text}</span>` +
        `<span class="transfer-line" style="background:${color}"></span>` +
        `</span>`;
    }
  }
  return `<span class="exit-label-text">${text}</span>`;
}

// ══ РЕНДЕР ПОЗИЦІЙ ══
// data-wagon + data-doors на кожному .fav-tap-target —
// єдине джерело правди для stationEvents.js (без зайвих querySelector).

function generatePills(wStr, dStr, color) {
  const wArr   = String(wStr).split(',').map(s => s.trim());
  const dArr   = String(dStr).split(',').map(s => s.trim());
  const blocks = [];
  const count  = Math.max(wArr.length, dArr.length);
  for (let i = 0; i < count; i++) {
    blocks.push(
      `${pill('вагон', wArr[i] || wArr[0], color)}\n${pill('двері', dArr[i] || dArr[0], color)}`
    );
  }
  return blocks.join('<span class="pos-multi-sep" style="margin: 0 6px;">·</span>');
}

function favTargetHtml(wStr, dStr, color) {
  return `<div class="fav-tap-target"
               data-wagon="${wStr}"
               data-doors="${dStr}"
               style="display:flex;gap:6px;align-items:center;">
    ${generatePills(wStr, dStr, color)}
  </div>`;
}

function renderPositions(positions, color, multiRow) {
  positions = positions.filter(p => !p.closed);
  if (!positions.length) return '';

  if (positions.length === 1) {
    const p       = positions[0];
    const isMulti = String(p.wagon).includes(',');
    const edited  = p._edited
      ? `<span class="pos-edited-mark" data-slug="${p._slug}" data-idx="${p._posIdx}">${MetroApp.Icons.pencil}</span>`
      : '';
    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">
      ${edited}${favTargetHtml(p.wagon, p.doors, color)}
    </div>`;
  }

  if (multiRow) {
    const editedPos = positions.find(p => p._edited);
    const edited    = editedPos
      ? `<span class="pos-edited-mark" data-slug="${editedPos._slug}" data-idx="${editedPos._posIdx}">${MetroApp.Icons.pencil}</span>`
      : '';
    const spacer = editedPos ? `<span class="pos-edited-spacer"></span>` : '';
    const targets = positions.map((p, i) =>
      `${i > 0 ? '<span class="pos-multi-sep">·</span>' : ''}${favTargetHtml(p.wagon, p.doors, color)}`
    ).join('');
    return `<div class="position-row position-row-multi">${edited}${targets}${spacer}</div>`;
  }

  return positions.map(p => {
    const isMulti = String(p.wagon).includes(',');
    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''}">
      ${favTargetHtml(p.wagon, p.doors, color)}
    </div>`;
  }).join('');
}

// ══ РЕНДЕР НАПРЯМКІВ ══

function renderExitLabel(exit) {
  if (!exit.label) return '';
  const edited = exit._labelEdited
    ? `<span class="pos-edited-mark label-pencil" data-slug="${exit._slug}">${MetroApp.Icons.pencil}</span>`
    : '';
  return `<div class="exit-label nav-label" data-name="${exit.label}">
    <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;">
      ${formatLabel(exit.label)}${edited}
    </div>
  </div>`;
}

function renderDirections(s, color) {
  const isKhreshchatyk = s.slug === 'R.Khreshchatyk';

  if (isKhreshchatyk) {
    const mainDirs = s.directions.filter(d => d.from !== '__long_transfer__');
    const longDir  = s.directions.find(d => d.from === '__long_transfer__');

    const mainHtml = mainDirs.map(dir => `
      <div class="direction-block">
        <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
        ${dir.exits.map(exit => `${renderExitLabel(exit)}${renderPositions(exit.positions, color, true)}`).join('')}
      </div>`).join('');

    let longHtml = '';
    if (longDir) {
      const rows = longDir.exits.map(exit => {
        const posRows = exit.positions.map(p =>
          `<div class="long-transfer-pos-row">${pill('вагон', p.wagon, color)}${pill('двері', p.doors, color)}</div>`
        ).join('');
        const edited = exit._labelEdited
          ? `<span class="pos-edited-mark" data-slug="${exit._slug}">${MetroApp.Icons.pencil}</span>`
          : '';
        return `<div class="long-transfer-exit">
          <div class="long-transfer-exit-label" style="position:relative;">${edited}${exit.label}</div>
          ${posRows}
        </div>`;
      }).join('');

      longHtml = `<div class="long-transfer-block">
        <div class="long-transfer-title">
          <span class="transfer-label">
            <span class="transfer-line" style="background:${MetroApp.LINE_COLOR['blue']}"></span>
            <span class="transfer-text">довгий&nbsp;перехід на&nbsp;Майдан&nbsp;Незалежності</span>
            <span class="transfer-line" style="background:${MetroApp.LINE_COLOR['blue']}"></span>
          </span>
        </div>
        ${rows}
      </div>`;
    }
    return mainHtml + longHtml;
  }

  return s.directions.map(dir => {
    if (dir.from === 'вихід праворуч') {
      return `<div class="direction-block direction-exit-right">
        <div class="direction-label">вихід праворуч</div>
      </div>`;
    }
    if (dir.from.trim().toLowerCase() === 'кінцева') {
      return `<div class="direction-block direction-exit-right" style="margin-bottom:10px;">
          <div class="direction-label" style="margin:0;">кінцева</div>
        </div>
        <div class="direction-block">
          ${dir.exits.map(exit => `${renderExitLabel(exit)}${renderPositions(exit.positions, color, false)}`).join('')}
        </div>`;
    }
    return `<div class="direction-block">
      <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
      ${dir.exits.map(exit => `${renderExitLabel(exit)}${renderPositions(exit.positions, color, false)}`).join('')}
    </div>`;
  }).join('');
}

// Експортуємо для stationEvents.js (підфарбовування улюблених)
export function applyFavPillStyles(container, lineColor, isFaved) {
  container.querySelectorAll('.pos-pill').forEach(p => {
    p.style.background = isFaved ? lineColor : '';
    const num = p.querySelector('.pos-pill-num');
    const lbl = p.querySelector('.pos-pill-label');
    if (num) num.style.color = isFaved ? 'var(--bg)' : lineColor;
    if (lbl) lbl.style.color = isFaved ? 'var(--bg)' : '';
  });
}

// ══ ІНІЦІАЛІЗАЦІЯ ЖЕСТІВ (один раз на весь час сесії) ══
// getCtx() — getter, бо slug і color змінюються між відкриттями,
// а сам listener залишається той самий.

bindSheetGestures(
  sheetBody,
  () => ({
    slug:      state.currentStationSlug,
    lineColor: MetroApp.LINE_COLOR[state.stationsData?.[state.currentStationSlug]?.line]
               ?? 'var(--text-muted)',
  }),
);

// ══ BUS-ПІДПИСКИ ══

// feedback/index.js та devmode.js емітують 'station:refresh'
bus.on('station:refresh', refreshCurrentStation);

// stationEvents.js емітує 'station:open' при кліку на nav-label
bus.on('station:open', ({ slug }) => openStation(slug));

// stationEvents.js емітує 'sheet:open-feedback-for' при кліку на олівець
bus.on('sheet:open-feedback-for', ({ slug: editSlug }) => {
  MetroApp.animateSheetClose?.(sheet, () => {
    sheet.classList.remove('sheet-open');
    MetroApp.openFeedbackSheet?.();
    setTimeout(() => {
      document.querySelector(`.fb-station-item[data-slug="${editSlug}"]`)?.click();
    }, 50);
  });
});

// ══ ХЕЛПЕР: nav-label → nav-link ══

function applyNavLinks(slug) {
  sheetBody.querySelectorAll('.nav-label').forEach(el => {
    const target = slugByName(el.dataset.name || '');
    if (target && target !== slug) {
      el.classList.add('nav-link');
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
    }
  });
}

// ══ ВІДКРИТТЯ СТАНЦІЇ ══

export function openStation(slug) {
  if (MetroApp.hasUnsavedFeedback?.()) {
    const fbSlug      = document.getElementById('fbStation')?.value || '';
    const stationName = (fbSlug ? state.stationsData?.[fbSlug]?.name : '') || '';
    const question    = stationName
      ? `Зберегти зміни для станції <span style="white-space:nowrap">${stationName}?</span>`
      : 'Зберегти зміни?';

    bus.emit('ui:confirm', {
      message:  question,
      onYes:    () => { MetroApp.triggerFeedbackSubmit?.(true); actualOpenStation(slug); },
      onNo:     () => actualOpenStation(slug),
      onCancel: () => {},
    });
    return;
  }
  actualOpenStation(slug);
}

function actualOpenStation(slug) {
  if (!state.stationsData?.[slug]) return;
  state.currentStationSlug = slug;

  MetroApp.dismissFavOnlyHint?.();

  const s     = state.stationsData[slug];
  const color = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
  const fav   = isFav(slug);

  const hideInfoBlocks = Storage.get(STORAGE_KEYS.HIDE_INFO_BLOCKS) === 'true';

  const onboardingHtml = (!hideInfoBlocks && getExitFavs().length === 0)
    ? `<div class="onboarding-hint" id="onboardingHint">` +
      `<span class="hint-icon-wrap" style="color:${color}">${MetroApp.Icons.info}</span>` +
      `Натисніть двічі на вагон та двері,<br>щоб зберегти вихід` +
      `</div>`
    : '';

  stationTitleMain.textContent = s.name;

  const hasDirections  = s.directions?.length > 0;
  const allExitsClosed = hasDirections && !s.directions.some(dir =>
    dir.exits?.some(exit => exit.positions?.some(pos => !pos.closed))
  );

  if (!hasDirections) {
    sheetBody.innerHTML =
      `<p class="fav-empty-text" style="text-align:center;margin:40px 0 0 0;width:100%;">Дані про виходи відсутні</p>`;
  } else if (allExitsClosed) {
    sheetBody.innerHTML =
      `<p class="fav-empty-text" style="text-align:center;margin:40px 0 0 0;width:100%;">Усі виходи закриті</p>`;
  } else {
    sheetBody.innerHTML = onboardingHtml + renderDirections(s, color);
  }

  sheetBody.scrollTop = 0;

  applyNavLinks(slug);

  if (s.slug === 'R.Khreshchatyk') {
    sheet.classList.add('sheet-fullscreen', 'sheet-scrollable');
    sheet.style.maxHeight = '';
  } else {
    sheet.style.maxHeight = '';
    sheet.classList.remove('sheet-fullscreen', 'sheet-scrollable');
  }

  const handle = sheet.querySelector('.sheet-handle');
  if (handle) handle.style.background = color;

  const favBtnBar = sheet.querySelector('.fav-btn-bar');
  if (favBtnBar) {
    favBtnBar.dataset.slug  = slug;
    favBtnBar.dataset.color = color;
    favBtnBar.innerHTML     = heartSvg(fav, slug, color);
    favBtnBar.classList.toggle('fav-active', fav);
  }

  document.querySelectorAll('.station-sheet').forEach(el => {
    if (el.id !== 'stationSheet') el.classList.remove('sheet-open');
  });

  if (!sheet.classList.contains('sheet-open')) {
    sheet.classList.add('sheet-open');
    sheetOverlay?.classList.add('overlay-visible');
  }

  // Підфарбовуємо вже збережені виходи — listeners вже є (bindSheetGestures)
  applyInitialFavStyles(sheetBody, slug, color);
  attachDevModeUI(sheetBody, slug);

  sheet.querySelector('.row-checkin-btn')?.remove();
  MetroApp.attachCheckinButtons?.(sheet, slug, color);
}

// ══ ОНОВЛЕННЯ ПОТОЧНОЇ КАРТКИ ══

export function refreshCurrentStation() {
  if (!state.currentStationSlug) return;
  applyExitLabels(state.stationsData);

  const s = state.stationsData?.[state.currentStationSlug];
  if (!s || !sheet.classList.contains('sheet-open')) return;

  const slug      = state.currentStationSlug;
  const color     = MetroApp.LINE_COLOR[s.line] || 'var(--text-muted)';
  const prevScroll = sheetBody.scrollTop;

  stationTitleMain.textContent = s.name;
  sheetBody.innerHTML = renderDirections(s, color);

  applyNavLinks(slug);

  // Listeners живуть — лише оновлюємо стилі
  applyInitialFavStyles(sheetBody, slug, color);
  attachDevModeUI(sheetBody, slug);

  sheet.querySelector('.row-checkin-btn')?.remove();
  MetroApp.attachCheckinButtons?.(sheet, slug, color);

  sheetBody.scrollTop = prevScroll;
}

// Фасад для devmode.js і feedback/index.js (перехідний шар)
// TODO: після повної міграції на bus — видалити
MetroApp.refreshCurrentStation = refreshCurrentStation;