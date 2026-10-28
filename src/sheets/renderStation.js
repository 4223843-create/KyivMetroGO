import { positionId }          from '../data/positions.js';
import { state }               from '../core/state.js';
import { pill, lineTextColor } from '../ui/components.js';
import { LINE_COLOR }          from '../core/constants.js';
import { Icons }               from '../ui/icons.js';
import { getPref }             from '../core/prefs.js';
import { appNow }              from '../core/clock.js';
import { richText } from '../ui/html.js';

function formatDirLabel(raw) {
  if (!raw) return raw;
  const match = raw.trim().match(/^([^\s&]+)(?:\s+|&nbsp;)(.*)$/i);
  if (!match) return richText(raw);
  return `${richText(match[1].toLowerCase())} <span class="dir-name-caps">${richText(match[2])}</span>`;
}

/** Атрибут data-target для підпису, що веде на іншу станцію (поля з stations.json). */
const navTargetAttr = slug => slug ? ` data-target="${richText(slug)}"` : '';

// Пересадку позначає поле transfer_to виходу в exits_catalog (stations.json),
// а не слова «пересадка» / «перехід» у підписі.
function formatLabel(exit) {
  const text       = exit.label.trim();
  const target = state.stationsData?.[exit.transfer_to];
  if (target) {
    const color = lineTextColor(LINE_COLOR[target.line]);
    return `<span class="transfer-label">` +
      `<span class="transfer-line" style="background:${color}"></span>` +
      `<span class="transfer-text">${richText(text)}</span>` +
      `<span class="transfer-line" style="background:${color}"></span>` +
      `</span>`;
  }
  return `<span class="exit-label-text">${richText(text)}</span>`;
}

// ══ ПЕРЕСАДКИ НА ІНШИЙ ТРАНСПОРТ (station.connections) ══

const ROUTE_KINDS = [
  ['bus',     '🚌', 'автобус'],
  ['trolley', '🚎', 'тролейбус'],
  ['tram',    '🚋', 'трамвай'],
  ['minibus', '🚐', 'маршрутка'],
];

/**
 * Значки й номери маршрутів. oneWay — {вид: {маршрут: відстань}}: маршрути,
 * що зупиняються лише з одного боку (пунктирна рамка, підказка по тапу).
 */
function routeGroups(routes, oneWay = {}) {
  return ROUTE_KINDS
    .filter(([key]) => routes[key]?.length)
    .map(([key, icon, title]) =>
      `<span class="exit-routes-group" data-kind-label="${title}" aria-label="${title}"><span class="exit-routes-icon">${icon}</span>` +
      routes[key].map(r => {
        if (!oneWay[key] || !(r in oneWay[key])) return `<span class="exit-route-chip">${r}</span>`;
        const d = oneWay[key][r];
        const where = Number.isFinite(d) ? ` (${roundMeters(d)} м)` : '';
        return `<span class="exit-route-chip exit-route-chip--oneway" data-oneway-label="лише в один бік${where}">${r}</span>`;
      }).join('') +
      `</span>`
    );
}

const roundMeters = m => Math.max(5, Math.round(m / 5) * 5);

/** «, 15 м» або «, 15–110 м» (зупинки в обидва боки — діапазон, тап → підказка). */
function _stopDistance(st) {
  if (!Number.isFinite(st.distance_m)) return '';
  const lo = roundMeters(st.distance_m);
  const hi = Number.isFinite(st.distance_max) ? roundMeters(st.distance_max) : lo;
  return hi > lo
    ? `, <span class="exit-stop-range">${lo}–${hi}&nbsp;м</span>`
    : `, ${lo}&nbsp;м`;
}

function _stopsHtml(stops) {
  return `<span class="pos-numbered-exit-stops">` + stops.map(st =>
    `<span class="exit-stop"><span class="exit-stop-name">${richText(st.name)}${_stopDistance(st)}` +
    `</span><span class="pos-numbered-exit-routes">${routeGroups(st.routes || {}, st.one_way).join('')}</span></span>`
  ).join('') + `</span>`;
}

/**
 * Наземний транспорт біля виходу з номером num.
 * Якщо в даних є зупинки (connections.stops) — кожна окремим рядком з назвою
 * й відстанню від виходу; інакше лише маршрути (connections.ground).
 * Вимикається в налаштуваннях («Дані»).
 */
export function renderExitRoutes(s, num) {
  if (!getPref('showGroundTransport')) return '';
  const stops = s.connections?.stops?.filter(st => String(st.exit) === String(num));
  if (stops?.length) return _stopsHtml(stops);
  const routes = s.connections?.ground?.[num];
  if (!routes) return '';
  const groups = routeGroups(routes);
  return groups.length ? `<span class="pos-numbered-exit-routes">${groups.join('')}</span>` : '';
}

/**
 * Зупинки без прив'язки до виходу (у виходів станції немає координат:
 * Хрещатик, Майдан, Дніпро) — окремим рядком без номера наприкінці панелі.
 */
export function renderUnlinkedStops(s) {
  if (!getPref('showGroundTransport')) return '';
  const stops = s.connections?.stops?.filter(st => st.exit == null);
  return stops?.length
    ? `<div class="pos-numbered-exit-row"><span class="pos-numbered-exit-num" style="visibility:hidden" aria-hidden="true">1</span>${_stopsHtml(stops)}</div>`
    : '';
}

/** 213 → «215&nbsp;м», 4130 → «4,1&nbsp;км». */
function fmtWalk(m) {
  if (m >= 1000) return `${(Math.round(m / 100) / 10).toString().replace('.', ',')}&nbsp;км`;
  return `${Math.max(5, Math.round(m / 5) * 5)}&nbsp;м`;
}

const HUB_ICON = { railway: '🚉', bus: '🚌' };

/** Плашки однієї пересадки: назва, «виходи 5 і 6» (лише коли виходів кілька),
 *  відстань (округлена до 5 м). note — підказка на тап по рядку. */
function connectionPills(label, conn) {
  const pills = [['name', label]];
  const exits = conn?.exits ?? [];
  if (exits.length > 1) {
    pills.push(['exits', `виходи&nbsp;${exits.slice(0, -1).join(', ')} і&nbsp;${exits.at(-1)}`]);
  }
  if (Number.isFinite(conn?.distance_m)) pills.push(['dist', fmtWalk(conn.distance_m)]);
  const note = conn?.note ? ` data-note="${conn.note.replace(/"/g, '&quot;')}"` : '';
  const html = pills.map(([col, t]) => `<span class="station-connection station-connection-${col}">${t}</span>`).join('');
  return `<div class="station-connection-row"${note}>${html}</div>`;
}

/** Плашки пересадок для шапки станції: кільцева електричка, фунікулер, вокзали, автостанції. */
export function renderStationConnections(s) {
  const c = s.connections;
  if (!c) return '';
  const items = [];
  if (c.city_train) items.push(connectionPills('🚆 Кільцева електричка', c.city_train));
  if (c.funicular)  items.push(connectionPills('🚡 Фунікулер', c.funicular));
  for (const hub of c.hubs ?? []) items.push(connectionPills(`${HUB_ICON[hub.kind] ?? ''} ${hub.name}`, hub));
  return items.length ? `<div class="station-connections">${items.join('')}</div>` : '';
}

// ══ ГОДИНИ РОБОТИ ТА ІНТЕРВАЛИ ══

/** 375 с → «6&nbsp;хв&nbsp;15&nbsp;сек», 360 с → «6&nbsp;хв». */
function fmtExact(sec) {
  const m = Math.floor(sec / 60), r = sec % 60;
  if (!m) return `${r}&nbsp;сек`;
  return r ? `${m}&nbsp;хв&nbsp;${r}&nbsp;сек` : `${m}&nbsp;хв`;
}

/** [270, 480] с → «4 хв 30 сек – 8 хв» (точні значення, без округлення). */
function fmtInterval([lo, hi]) {
  return lo === hi ? fmtExact(lo) : `${fmtExact(lo)} – ${fmtExact(hi)}`;
}

/** «05:33» → хвилини від початку доби; час до 03:00 вважаємо після опівночі. */
function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return (h < 3 ? h + 24 : h) * 60 + m;
}

/** Поточний інтервал (пара секунд [мін, макс]) у бік кінцевої або null.
 *  firstHour: до першої години таблиці (06:00) брати її значення — для ранку. */
function currentInterval(line, terminal, now, firstHour = false) {
  const periods = state.lineIntervals?.[line];
  if (!periods) return null;
  const hh = String(now.getHours()).padStart(2, '0');
  const p = periods.find(x => x.from.startsWith(hh))
    ?? (firstHour && periods[0] && hh < periods[0].from ? periods[0] : null);
  if (!p) return null;
  const day = now.getDay();
  return p[day === 0 || day === 6 ? 'holiday' : 'weekday']?.[terminal] || null;
}

/** Інтервал у кожен бік на час першого поїзда найближчого ранку (для ночі). */
function morningIntervals(s, now) {
  const morning = new Date(now);
  if (now.getHours() >= 12) morning.setDate(morning.getDate() + 1);
  return Object.entries(s.schedule.trains || {})
    .map(([terminal, t]) => {
      const [h, m] = t.first.split(':').map(Number);
      const at = new Date(morning);
      at.setHours(h, m, 0, 0);
      return [terminal, currentInterval(s.line, terminal, at, true)];
    })
    .filter(([, iv]) => iv);
}

/** Назви станцій у родовому відмінку: «у бік Арсенальної». */
const STATION_GEN = {
  'R.Akademmistechko': 'Академмістечка', 'R.Zhytomyrska': 'Житомирської', 'R.Sviatoshyn': 'Святошина',
  'R.Nyvky': 'Нивок', 'R.Beresteiska': 'Берестейської', 'R.Shuliavska': 'Шулявської',
  'R.Politekhnychnyi_instytut': 'Політехнічного інституту', 'R.Vokzalna': 'Вокзальної',
  'R.Universytet': 'Університету', 'R.Teatralna': 'Театральної', 'R.Khreshchatyk': 'Хрещатика',
  'R.Arsenalna': 'Арсенальної', 'R.Dnipro': 'Дніпра', 'R.Hidropark': 'Гідропарку',
  'R.Livoberezhna': 'Лівобережної', 'R.Darnytsia': 'Дарниці', 'R.Chernihivska': 'Чернігівської',
  'R.Lisova': 'Лісової',
  'B.Heroiv_Dnipra': 'Героїв Дніпра', 'B.Minska': 'Мінської', 'B.Obolon': 'Оболоні',
  'B.Pochaina': 'Почайни', 'B.Tarasa_Shevchenko': 'Тараса Шевченка',
  'B.Kontraktova_ploshcha': 'Контрактової площі', 'B.Poshtova_ploshcha': 'Поштової площі',
  'B.Maidan_Nezalezhnosti': 'Майдану Незалежності', 'B.Ploshcha_Ukrainskikh_heroiv': 'Площі Українських Героїв',
  'B.Olimpiiska': 'Олімпійської', 'B.Palats_Ukraina': 'Палацу „Україна“', 'B.Lybidska': 'Либідської',
  'B.Demiivska': 'Деміївської', 'B.Holosiivska': 'Голосіївської', 'B.Vasylkivska': 'Васильківської',
  'B.Vystavkovyi_tsentr': 'Виставкового центру', 'B.Ipodrom': 'Іподрому', 'B.Teremky': 'Теремків',
  'G.Syrets': 'Сирця', 'G.Dorohozhychi': 'Дорогожичів', 'G.Lukianivska': 'Лукʼянівської',
  'G.Zoloti_vorota': 'Золотих воріт', 'G.Palats_sportu': 'Палацу спорту', 'G.Klovska': 'Кловської',
  'G.Pecherska': 'Печерської', 'G.Zvirynetska': 'Звіринецької', 'G.Vydubychi': 'Видубичів',
  'G.Slavutych': 'Славутича', 'G.Osokorky': 'Осокорків', 'G.Pozniaky': 'Позняків',
  'G.Kharkivska': 'Харківської', 'G.Vyrlytsia': 'Вирлиці', 'G.Boryspilska': 'Бориспільської',
  'G.Chervonyi_khutir': 'Червоного Хутора',
};

const normName = n => String(n).replace(/&nbsp;/g, ' ').toLowerCase();

/** Наступна станція від s у бік кінцевої terminal (за порядком станцій лінії в даних). */
function nextStationToward(s, terminal) {
  const line = Object.values(state.stationsData || {}).filter(x => x.line === s.line);
  const i = line.findIndex(x => x.slug === s.slug);
  const t = line.findIndex(x => normName(x.name) === normName(terminal));
  if (i < 0 || t < 0 || i === t) return null;
  return line[i + Math.sign(t - i)] || null;
}

/** «у бік Арсенальної» — напрямок за наступною станцією. */
function directionLabel(s, terminal) {
  const next = nextStationToward(s, terminal);
  const name = next ? (STATION_GEN[next.slug] || next.name) : terminal;
  return `у бік ${name.replace(/ /g, '&nbsp;')}`;
}

/**
 * Вміст панелі годинника (кнопка біля серця) станом на час телефону:
 * «закрита, відкриється о …», якщо вхід зараз закритий; години роботи — залежно
 * від налаштування; інтервал у кожен бік на поточну годину.
 */
/** Чи є що показувати в панелі годинника зараз (за налаштуваннями й часом). */
export function hasStationClock(s) {
  return !!s?.schedule && renderStationClock(s) !== '';
}

export function renderStationClock(s, now = appNow()) {
  const sch = s.schedule;
  if (!sch) return '';
  const nowMin = toMin(`${now.getHours()}:${now.getMinutes()}`);
  const open   = toMin(sch.open);
  const close  = toMin(sch.close);
  const lines  = [];

  const hoursMode = getPref('stationHours');
  if (hoursMode !== 'never') {
    if (nowMin < open || nowMin >= close) {
      lines.push(`<span class="clock-pill">Станція закрита, відкриється о <span class="clock-interval">${sch.open}</span></span>`);
    } else if (hoursMode === 'always' || close - nowMin <= 120 || nowMin - open < 120) {
      // 'soon': перші дві години після відкриття та останні дві до закриття
      lines.push(`<span class="clock-pill">Вхід <span class="clock-interval">${sch.open}–${sch.close}</span></span>`);
    }
  }

  const trains = Object.entries(sch.trains || {});
  let ivs = !getPref('showIntervals') ? [] : trains
    .filter(([, t]) => nowMin >= toMin(t.first) && nowMin <= toMin(t.last))
    .map(([terminal]) => [terminal, currentInterval(s.line, terminal, now)])
    .filter(([, iv]) => iv);

  // Уночі (жоден поїзд уже або ще не ходить) — інтервал після відкриття
  let title = 'Інтервал руху';
  const isNight = trains.length && trains.every(([, t]) => nowMin < toMin(t.first) || nowMin > toMin(t.last));
  if (!ivs.length && isNight && getPref('showIntervals')) {
    ivs = morningIntervals(s, now);
    title = 'Інтервал руху після відкриття';
  }

  // Однакові інтервали в обидва боки — один рядок без назв напрямків
  const [x, y] = ivs;
  if (ivs.length === 2 && x[1][0] === y[1][0] && x[1][1] === y[1][1]) {
    lines.push(`<span class="clock-pill">${title}: <span class="clock-interval">${fmtInterval(x[1])}</span></span>`);
  } else if (ivs.length) {
    // Два напрямки — одна пілюля-блок з заголовком і рядком на кожен бік
    lines.push(`<span class="clock-pill clock-pill-multi"><span>${title}</span>` +
      ivs.map(([terminal, iv]) => `<span>${directionLabel(s, terminal)}: ` +
        `<span class="clock-interval">${fmtInterval(iv)}</span></span>`).join('') + '</span>');
  }

  if (!lines.length && getPref('showIntervals'))
    lines.push('<span class="clock-pill">Немає даних про інтервал на цю годину</span>');
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

function favTargetHtml(wStr, dStr, color, posId) {
  return `<div class="fav-tap-target"
               data-pos="${posId ?? ''}"
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

/** Спецпідйомники показуємо лише в режимі «ліфти та спецпідйомники». */
const showHoists = () => getPref('mapAccessibility') === 'hoists';

function renderIcons(p) {
  let iconsHtml = '';
  const accMode = getPref('mapAccessibility');

  // Підйомник вимкнено в налаштуваннях — ховаємо і його ескалатор
  const hoistHidden = p.isHoist && !showHoists();

  if (p.isEscalator && !hoistHidden) {
    iconsHtml += `<span class="pos-lift-mark pos-escalator-mark" role="img" aria-label="Ескалатор">${Icons.escalator}</span>`;
  }

  if (p.isHoist) {
    if (showHoists()) {
      iconsHtml += `<span class="pos-lift-mark pos-hoist-mark" role="img" aria-label="Спецпідйомник">${Icons.hoist}</span>`;
    }
  } else if (p.isLift && accMode !== 'none') {
    iconsHtml += `<span class="pos-lift-mark pos-elevator-mark" role="img" aria-label="Ліфт">${Icons.elevator}</span>`;
  }

  if (!iconsHtml) return '';
  return `<div class="pos-lift-marks-wrap">${iconsHtml}</div>`;
}

/**
 * Постійний ключ рядка позиції для даних режиму розробника (нотатки,
 * підтвердження, фото). Похідний від id першої позиції рядка
 * (positionId, data/positions.js), тож не зсувається й не губиться, коли в
 * даних з'являються інші виходи чи перейменовують напрямок. Хеш — щоб ключ був
 * коротким і безпечним для id елементів, назв файлів фото й полів Firestore.
 * Старі ключі (хеш від «напрямок|id виходу|номер») переводить devmode.js.
 */
export function devRowKey(positionKey) {
  if (!positionKey) return '';
  let h = 0x811c9dc5;
  for (let i = 0; i < positionKey.length; i++) {
    h ^= positionKey.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return 'k' + (h >>> 0).toString(36);
}

const rowKeyAttr = p => {
  const key = devRowKey(p?._key);
  return key ? ` data-row-key="${key}"` : '';
};

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

    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''} ${hasSpecial ? 'position-row-lift' : ''}"${rowKeyAttr(p)}>
      ${edited}${favTargetHtml(p.wagon, p.doors, color, positionId(p))}${icons}
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
      return `${i > 0 ? '<span class="pos-multi-sep">·</span>' : ''}${favTargetHtml(p.wagon, p.doors, color, positionId(p))}${icons}`;
    }).join('');

    return `<div class="position-row position-row-multi"${rowKeyAttr(grouped[0])}>${edited}${targets}${spacer}</div>`;
  }

  return grouped.map(p => {
    const isMulti    = String(p.wagon).includes(',');
    const icons      = renderIcons(p, exit);
    const hasSpecial = !!icons;

    return `<div class="position-row ${isMulti ? 'position-row-multi' : ''} ${hasSpecial ? 'position-row-lift' : ''}"${rowKeyAttr(p)}>
      ${favTargetHtml(p.wagon, p.doors, color, positionId(p))}${icons}
    </div>`;
  }).join('');
}






function renderExitLabel(exit) {
  if (!exit.label) return '';
  const edited = exit._labelEdited
    ? `<span class="pos-edited-mark label-pencil" data-slug="${exit._slug}">${Icons.pencil}</span>`
    : '';
  return `<div class="exit-label nav-label" data-name="${richText(exit.label)}"${navTargetAttr(exit.transfer_to || exit.link_to)}>
    <div style="position:relative;display:inline-flex;align-items:center;justify-content:center;">
      ${formatLabel(exit)}${edited}
    </div>
  </div>`;
}

// ══ РЕНДЕР НАПРЯМКІВ ══

export function renderDirections(s, color) {
  const isKhreshchatyk = s.slug === 'R.Khreshchatyk';

  // Перевірка налаштування та наявності хоча б одного ліфта на станції
  const hideNoLift = getPref('hideNoLift');
  const hasLift = s.directions?.some(dir =>
    dir.exits?.some(exit =>
      exit.positions?.some(p => p.isLift || (p.isHoist && showHoists()))
    )
  );
  const filterLiftOnly = hideNoLift && hasLift;

  if (isKhreshchatyk) {
    const mainDirs = s.directions.filter(d => d.from !== '__long_transfer__');
    const longDir  = s.directions.find(d => d.from === '__long_transfer__');

    const mainHtml = mainDirs.map(dir => {
      const exitsHtml = dir.exits.map(exit => {
        const visiblePos = exit.positions?.filter(p => !p.closed && (!filterLiftOnly || p.isLift || (p.isHoist && showHoists()))) || [];
        if (!visiblePos.length) return '';
        return `${renderExitLabel(exit)}${renderPositions(visiblePos, color, true, exit)}`;
      }).join('');

      if (!exitsHtml) return '';
      return `<div class="direction-block">
        <div class="direction-label nav-label" data-name="${richText(dir.from)}"${navTargetAttr(dir.from_slug)}>${formatDirLabel(dir.from)}</div>
        ${exitsHtml}
      </div>`;
    }).join('');

    let longHtml = '';
    if (longDir) {
      const rows = longDir.exits.map(exit => {
        const visiblePos = exit.positions?.filter(p => !p.closed && (!filterLiftOnly || p.isLift || (p.isHoist && showHoists()))) || [];
        if (!visiblePos.length) return '';
        const posRows = visiblePos.map(p =>
          `<div class="long-transfer-pos-row">${pill('вагон', p.wagon, color)}${pill('двері', p.doors, color)}</div>`
        ).join('');
        const edited = exit._labelEdited
          ? `<span class="pos-edited-mark" data-slug="${exit._slug}">${Icons.pencil}</span>`
          : '';
        return `<div class="long-transfer-exit">
          <div class="long-transfer-exit-label" style="position:relative;">${edited}${richText(exit.label)}</div>
          ${posRows}
        </div>`;
      }).filter(Boolean).join('');

      if (rows) {
        longHtml = `<div class="long-transfer-block">
          <div class="long-transfer-title">
            <span class="transfer-label">
              <span class="transfer-line" style="background:${lineTextColor(LINE_COLOR['blue'])}"></span>
              <span class="transfer-text">довгий&nbsp;перехід на&nbsp;Майдан&nbsp;Незалежності</span>
              <span class="transfer-line" style="background:${lineTextColor(LINE_COLOR['blue'])}"></span>
            </span>
          </div>
          ${rows}
        </div>`;
      }
    }

    return mainHtml + longHtml;
  }

  // Кінцева — окремий блок «кінцева» одразу під назвою станції, як «вихід праворуч»
  const isTerminal = s.directions.some(d => d.from.trim().toLowerCase() === 'кінцева');
  const terminalBlock = isTerminal
    ? `<div class="direction-block direction-exit-right" style="margin-bottom:10px;">
        <div class="direction-label" style="margin:0;">кінцева</div>
      </div>`
    : '';

  return terminalBlock + s.directions.map((dir, dirIdx) => {
    const fromLower = dir.from.trim().toLowerCase();

    const exitsHtml = dir.exits?.map(exit => {
      const visiblePos = exit.positions?.filter(p => !p.closed && (!filterLiftOnly || p.isLift || (p.isHoist && showHoists()))) || [];
      if (!visiblePos.length) return '';
      return `${renderExitLabel(exit)}${renderPositions(visiblePos, color, false, exit)}`;
    }).join('') || '';

    // Кінцева з from_slug — підписуємо попередню станцію, як на інших станціях
    const prevStation = fromLower === 'кінцева' && state.stationsData?.[dir.from_slug];
    if (prevStation && exitsHtml) {
      return `<div class="direction-block">
      <div class="direction-label nav-label" data-name="${richText(dir.from)}"${navTargetAttr(dir.from_slug)}>${formatDirLabel(`попередня ${prevStation.name}`)}</div>
      ${exitsHtml}
    </div>`;
    }

    // Кінцева без from_slug — заголовок уже вгорі, тут лише позиції
    if (fromLower === 'кінцева') {
      return exitsHtml ? `<div class="direction-block">${exitsHtml}</div>` : '';
    }

    if (fromLower === 'вихід праворуч') {
      // Відступ знизу, якщо під заголовком є позиції — свої чи наступного напрямку
      const hasBelow = dir.exits?.length || dirIdx < s.directions.length - 1;
      const headerBlock = `<div class="direction-block direction-exit-right" style="${hasBelow ? 'margin-bottom:10px;' : ''}">
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
      <div class="direction-label nav-label" data-name="${richText(dir.from)}"${navTargetAttr(dir.from_slug)}>${formatDirLabel(dir.from)}</div>
      ${exitsHtml}
    </div>`;
  }).join('');
}

export function applyFavPillStyles(container, lineColor, isFaved) {
  container.querySelectorAll('.pos-pill').forEach(p => {
    p.style.background = isFaved ? lineTextColor(lineColor) : '';
    const num = p.querySelector('.pos-pill-num');
    const lbl = p.querySelector('.pos-pill-label');
    if (num) num.style.color = isFaved ? 'var(--bg)' : lineTextColor(lineColor);
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
 * key — стабільний ключ рядка (devRowKey), під яким тепер зберігаються дані розробника;
 * posIdx лишається для переведення старих записів.
 *
 * @returns {Array<{posIdx:number, key:string, dirFrom:string, exitLabel:string, wagonDoors:string}>}
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
      key:    el.dataset.rowKey || String(descriptors.length),
      dirFrom: currentDir,
      exitLabel: currentExit,
      wagonDoors,
    });
  });

  return descriptors;
}