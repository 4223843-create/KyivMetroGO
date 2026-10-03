import { slugByName }          from '../data/stations.js';
import { state }               from '../core/state.js';
import { pill }                from '../ui/components.js';
import { LINE_COLOR }          from '../core/constants.js';
import { Icons }               from '../ui/icons.js';
import { isHideNoLiftEnabled, isShowHoistsEnabled } from '../features/settings.js';

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
      const color = LINE_COLOR[state.stationsData[targetSlug].line];
      return `<span class="transfer-label">` +
        `<span class="transfer-line" style="background:${color}"></span>` +
        `<span class="transfer-text">${text}</span>` +
        `<span class="transfer-line" style="background:${color}"></span>` +
        `</span>`;
    }
  }
  return `<span class="exit-label-text">${text}</span>`;
}

// ══ ПЕРЕСАДКИ НА ІНШИЙ ТРАНСПОРТ (station.connections) ══

const ROUTE_KINDS = [
  ['bus',     '🚌', 'Автобус'],
  ['trolley', '🚎', 'Тролейбус'],
  ['tram',    '🚋', 'Трамвай'],
  ['minibus', '🚐', 'Маршрутка'],
];

/** Маршрути наземного транспорту біля виходу з номером num (або ''). */
export function renderExitRoutes(s, num) {
  const routes = s.connections?.ground?.[num];
  if (!routes) return '';
  const groups = ROUTE_KINDS
    .filter(([key]) => routes[key]?.length)
    .map(([key, icon, title]) =>
      `<span class="exit-routes-group" aria-label="${title}"><span class="exit-routes-icon">${icon}</span>` +
      routes[key].map(r => `<span class="exit-route-chip">${r}</span>`).join('') +
      `</span>`
    );
  return groups.length ? `<span class="pos-numbered-exit-routes">${groups.join('')}</span>` : '';
}

/** Підпис «вихід N, M м» для пересадки (відстань округлена до 5 м). */
function connectionExitHint(conn) {
  const exits = conn?.exits;
  if (!exits?.length) return '';
  const word = exits.length > 1 ? 'виходи' : 'вихід';
  const dist = Number.isFinite(conn.distance_m)
    ? `, ${Math.max(5, Math.round(conn.distance_m / 5) * 5)}&nbsp;м`
    : '';
  return ` <span class="station-connection-exit">· ${word}&nbsp;${exits.join(', ')}${dist}</span>`;
}

/** Плашки пересадок на кільцеву електричку / фунікулер для шапки станції. */
export function renderStationConnections(s) {
  const c = s.connections;
  if (!c) return '';
  const items = [];
  if (c.city_train) items.push(`<span class="station-connection">🚆 Кільцева електричка${connectionExitHint(c.city_train)}</span>`);
  if (c.funicular)  items.push(`<span class="station-connection">🚡 Фунікулер${connectionExitHint(c.funicular)}</span>`);
  return items.length ? `<div class="station-connections">${items.join('')}</div>` : '';
}

// ══ ГОДИНИ РОБОТИ ТА ІНТЕРВАЛИ ══

/** [360, 390] с → «6–7 хвилин» (округлення до цілих хвилин). */
function fmtInterval([a, b]) {
  const lo = Math.round(a / 60);
  const hi = Math.round(b / 60);
  const n  = hi % 100;
  const word = n % 10 === 1 && n !== 11 ? 'хвилина'
    : n % 10 >= 2 && n % 10 <= 4 && (n < 12 || n > 14) ? 'хвилини' : 'хвилин';
  return `${lo === hi ? lo : `${lo}–${hi}`}&nbsp;${word}`;
}

/** «05:33» → хвилини від початку доби; час до 03:00 вважаємо після опівночі. */
function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h < 3 ? h + 24 : h) * 60 + m;
}

/** Поточний інтервал (пара секунд [мін, макс]) у бік кінцевої або null. */
function currentInterval(line, terminal, now) {
  const periods = state.lineIntervals?.[line];
  if (!periods) return null;
  const hh = String(now.getHours()).padStart(2, '0');
  const p = periods.find(x => x.from.startsWith(hh));
  if (!p) return null;
  const day = now.getDay();
  return p[day === 0 || day === 6 ? 'holiday' : 'weekday']?.[terminal] || null;
}

/** Назви кінцевих у родовому відмінку: «в бік Теремків». */
const TERMINAL_GEN = {
  'Теремки': 'Теремків', 'Героїв Дніпра': 'Героїв Дніпра',
  'Лісова': 'Лісової', 'Академмістечко': 'Академмістечка',
  'Червоний хутір': 'Червоного хутора', 'Сирець': 'Сирця',
};

/**
 * Вміст панелі годинника (кнопка біля серця) станом на час телефону:
 * «відкриється о …», якщо вхід зараз закритий; «вхід до …», якщо до закриття
 * менше двох годин; інтервал у кожен бік на поточну годину.
 */
export function renderStationClock(s, now = new Date()) {
  const sch = s.schedule;
  if (!sch) return '';
  const nowMin = toMin(`${now.getHours()}:${now.getMinutes()}`);
  const open   = toMin(sch.open);
  const close  = toMin(sch.close);
  const lines  = [];

  if (nowMin < open || nowMin >= close) {
    lines.push(`<div class="clock-head">Станція відкриється о ${sch.open}</div>`);
  } else if (close - nowMin <= 120) {
    lines.push(`<div class="clock-head">Вхід до ${sch.close}</div>`);
  }

  const ivs = Object.entries(sch.trains || {})
    .filter(([, t]) => nowMin >= toMin(t.first) && nowMin <= toMin(t.last))
    .map(([terminal]) => [terminal, currentInterval(s.line, terminal, now)])
    .filter(([, iv]) => iv);

  // Різниця між напрямками до 60 с — один рядок без назв напрямків
  const [x, y] = ivs;
  if (ivs.length === 2 && Math.abs(x[1][0] - y[1][0]) <= 60 && Math.abs(x[1][1] - y[1][1]) <= 60) {
    const iv = [Math.min(x[1][0], y[1][0]), Math.max(x[1][1], y[1][1])];
    lines.push(`<div class="clock-row">Інтервал руху: <span class="clock-interval">${fmtInterval(iv)}</span></div>`);
  } else if (ivs.length) {
    lines.push('<div class="clock-title">Інтервал руху</div>');
    ivs.forEach(([terminal, iv]) => lines.push(
      `<div class="clock-row">в бік ${TERMINAL_GEN[terminal] || terminal}: ` +
      `<span class="clock-interval">${fmtInterval(iv)}</span></div>`));
  }

  if (!lines.length) lines.push('<div class="clock-head">Немає даних про інтервал на цю годину</div>');
  return lines.join('');
}

// ══ РЕНДЕР ПОЗИЦІЙ ══

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

function groupPositions(positions) {
  const grouped = [];
  const map = new Map();

  positions.forEach(p => {
    if (p.closed) return;
    const key = `${String(p.wagon).trim()}:${String(p.doors).trim()}`;
    if (!map.has(key)) {
      const item = {
        ...p,
        isEscalator: !!p.isEscalator,
        isLift: !!p.isLift,
        isHoist: !!p.isHoist,
      };
      map.set(key, item);
      grouped.push(item);
    } else {
      const existing = map.get(key);
      if (p.isEscalator) existing.isEscalator = true;
      if (p.isLift) existing.isLift = true;
      if (p.isHoist) existing.isHoist = true;
      if (p._edited) {
        existing._edited = true;
        existing._slug = p._slug;
        existing._posIdx = p._posIdx;
      }
    }
  });

  return grouped;
}

function renderIcons(p) {
  let iconsHtml = '';

  // Підйомник вимкнено в налаштуваннях — ховаємо і його ескалатор
  const hoistHidden = p.isHoist && !isShowHoistsEnabled();

  if (p.isEscalator && !hoistHidden) {
    iconsHtml += `<span class="pos-lift-mark pos-escalator-mark" aria-label="Ескалатор">${Icons.escalator}</span>`;
  }

  if (p.isHoist) {
    if (isShowHoistsEnabled()) {
      iconsHtml += `<span class="pos-lift-mark pos-hoist-mark" aria-label="Спецпідйомник">${Icons.hoist}</span>`;
    }
  } else if (p.isLift) {
    iconsHtml += `<span class="pos-lift-mark pos-elevator-mark" aria-label="Ліфт">${Icons.elevator}</span>`;
  }

  if (!iconsHtml) return '';
  return `<div class="pos-lift-marks-wrap">${iconsHtml}</div>`;
}

function renderPositions(positions, color, multiRow, exit = null) {
  const grouped = groupPositions(positions);
  if (!grouped.length) return '';

  if (grouped.length === 1) {
    const p          = grouped[0];
    const isMulti    = String(p.wagon).includes(',');
    const edited     = p._edited
      ? `<span class="pos-edited-mark" data-slug="${p._slug}" data-idx="${p._posIdx}">${Icons.pencil}</span>`
      : '';
    const icons      = renderIcons(p, exit);
    const hasSpecial = !!icons;

    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''} ${hasSpecial ? 'position-row-lift' : ''}">
      ${edited}${favTargetHtml(p.wagon, p.doors, color)}${icons}
    </div>`;
  }

  if (multiRow) {
    const editedPos = grouped.find(p => p._edited);
    const edited    = editedPos
      ? `<span class="pos-edited-mark" data-slug="${editedPos._slug}" data-idx="${editedPos._posIdx}">${Icons.pencil}</span>`
      : '';
    const spacer  = editedPos ? `<span class="pos-edited-spacer"></span>` : '';
    const targets = grouped.map((p, i) => {
      const icons = renderIcons(p, exit);
      return `${i > 0 ? '<span class="pos-multi-sep">·</span>' : ''}${favTargetHtml(p.wagon, p.doors, color)}${icons}`;
    }).join('');

    return `<div class="position-row position-row-multi">${edited}${targets}${spacer}</div>`;
  }

  return grouped.map(p => {
    const isMulti    = String(p.wagon).includes(',');
    const icons      = renderIcons(p, exit);
    const hasSpecial = !!icons;

    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''} ${hasSpecial ? 'position-row-lift' : ''}">
      ${favTargetHtml(p.wagon, p.doors, color)}${icons}
    </div>`;
  }).join('');
}






function renderExitLabel(exit) {
  if (!exit.label) return '';
  const edited = exit._labelEdited
    ? `<span class="pos-edited-mark label-pencil" data-slug="${exit._slug}">${Icons.pencil}</span>`
    : '';
  return `<div class="exit-label nav-label" data-name="${exit.label}">
    <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;">
      ${formatLabel(exit.label)}${edited}
    </div>
  </div>`;
}

// ══ РЕНДЕР НАПРЯМКІВ ══

export function renderDirections(s, color) {
  const isKhreshchatyk = s.slug === 'R.Khreshchatyk';

  // Перевірка налаштування та наявності хоча б одного ліфта на станції
  const hideNoLift = isHideNoLiftEnabled();
  const hasLift = s.directions?.some(dir =>
    dir.exits?.some(exit =>
      exit.positions?.some(p => p.isLift || (p.isHoist && isShowHoistsEnabled()))
    )
  );
  const filterLiftOnly = hideNoLift && hasLift;

  if (isKhreshchatyk) {
    const mainDirs = s.directions.filter(d => d.from !== '__long_transfer__');
    const longDir  = s.directions.find(d => d.from === '__long_transfer__');

    const mainHtml = mainDirs.map(dir => {
      const exitsHtml = dir.exits.map(exit => {
        const visiblePos = exit.positions?.filter(p => !p.closed && (!filterLiftOnly || p.isLift || (p.isHoist && isShowHoistsEnabled()))) || [];
        if (!visiblePos.length) return '';
        return `${renderExitLabel(exit)}${renderPositions(visiblePos, color, true, exit)}`;
      }).join('');

      if (!exitsHtml) return '';
      return `<div class="direction-block">
        <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
        ${exitsHtml}
      </div>`;
    }).join('');

    let longHtml = '';
    if (longDir) {
      const rows = longDir.exits.map(exit => {
        const visiblePos = exit.positions?.filter(p => !p.closed && (!filterLiftOnly || p.isLift || (p.isHoist && isShowHoistsEnabled()))) || [];
        if (!visiblePos.length) return '';
        const posRows = visiblePos.map(p =>
          `<div class="long-transfer-pos-row">${pill('вагон', p.wagon, color)}${pill('двері', p.doors, color)}</div>`
        ).join('');
        const edited = exit._labelEdited
          ? `<span class="pos-edited-mark" data-slug="${exit._slug}">${Icons.pencil}</span>`
          : '';
        return `<div class="long-transfer-exit">
          <div class="long-transfer-exit-label" style="position:relative;">${edited}${exit.label}</div>
          ${posRows}
        </div>`;
      }).filter(Boolean).join('');

      if (rows) {
        longHtml = `<div class="long-transfer-block">
          <div class="long-transfer-title">
            <span class="transfer-label">
              <span class="transfer-line" style="background:${LINE_COLOR['blue']}"></span>
              <span class="transfer-text">довгий&nbsp;перехід на&nbsp;Майдан&nbsp;Незалежності</span>
              <span class="transfer-line" style="background:${LINE_COLOR['blue']}"></span>
            </span>
          </div>
          ${rows}
        </div>`;
      }
    }

    return mainHtml + longHtml;
  }

  return s.directions.map(dir => {
    const fromLower = dir.from.trim().toLowerCase();

    const exitsHtml = dir.exits?.map(exit => {
      const visiblePos = exit.positions?.filter(p => !p.closed && (!filterLiftOnly || p.isLift || (p.isHoist && isShowHoistsEnabled()))) || [];
      if (!visiblePos.length) return '';
      return `${renderExitLabel(exit)}${renderPositions(visiblePos, color, false, exit)}`;
    }).join('') || '';

    if (fromLower === 'вихід праворуч' || fromLower === 'кінцева') {
      const headerBlock = `<div class="direction-block direction-exit-right" style="${dir.exits?.length ? 'margin-bottom:10px;' : ''}">
        <div class="direction-label" style="margin:0;">${fromLower}</div>
      </div>`;

      if (!dir.exits?.length || !exitsHtml) {
        return headerBlock;
      }

      const positionsBlock = `<div class="direction-block">${exitsHtml}</div>`;
      return headerBlock + positionsBlock;
    }

    if (!exitsHtml) return '';

    return `<div class="direction-block">
      <div class="direction-label nav-label" data-name="${dir.from}">${formatDirLabel(dir.from)}</div>
      ${exitsHtml}
    </div>`;
  }).join('');
}

export function applyFavPillStyles(container, lineColor, isFaved) {
  container.querySelectorAll('.pos-pill').forEach(p => {
    p.style.background = isFaved ? lineColor : '';
    const num = p.querySelector('.pos-pill-num');
    const lbl = p.querySelector('.pos-pill-label');
    if (num) num.style.color = isFaved ? 'var(--bg)' : lineColor;
    if (lbl) lbl.style.color = isFaved ? 'var(--bg)' : '';
  });
}

/**
 * Розшифровує posIdx (порядковий номер .position-row у відрендереному DOM —
 * саме так attachDevModeUI() у devmode.js нумерує позиції) у людський опис:
 * напрямок, підпис виходу, вагон/двері. Потрібно, бо posIdx сам по собі —
 * лише індекс, він нічого не каже про те, ЯКА це позиція.
 *
 * Рендерить renderDirections() у відв'язаний від документа контейнер і йде
 * по тих самих .direction-label/.exit-label/.position-row в порядку DOM —
 * тобто гарантовано той самий порядок, що й при реальному відкритті станції.
 *
 * Застереження: якщо на момент створення нотатки в іншого користувача було
 * увімкнено/вимкнено налаштування "Приховати виходи без ліфтів", порядок
 * рядків міг відрізнятись від того, що видно зараз — це успадкована
 * особливість самої системи posIdx, а не щось, що можна виправити тут.
 *
 * @param {object} s     — об'єкт станції зі state.stationsData
 * @param {string} color — колір лінії (для рендеру пігулок, на сам опис не впливає)
 * @returns {Array<{posIdx:number, dirFrom:string, exitLabel:string, wagonDoors:string}>}
 */
export function getPositionDescriptorsForStation(s, color) {
  const wrap = document.createElement('div');
  wrap.innerHTML = renderDirections(s, color || '#888888');

  const descriptors = [];
  let currentDir  = '';
  let currentExit = '';

  wrap.querySelectorAll('.direction-label, .exit-label, .position-row').forEach(el => {
    if (el.classList.contains('direction-label')) {
      currentDir  = el.dataset.name || el.textContent.trim();
      currentExit = '';
      return;
    }
    if (el.classList.contains('exit-label')) {
      currentExit = el.dataset.name || el.textContent.trim();
      return;
    }
    // .position-row
    const wagonDoors = Array.from(el.querySelectorAll('.fav-tap-target'))
      .map(t => `${t.dataset.wagon}/${t.dataset.doors}`)
      .join(' · ');
    descriptors.push({
      posIdx: descriptors.length,
      dirFrom: currentDir,
      exitLabel: currentExit,
      wagonDoors,
    });
  });

  return descriptors;
}