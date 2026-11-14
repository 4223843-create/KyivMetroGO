// ══ ПЕРЕВІРКА stations.json ══
// Чиста функція без DOM і Capacitor: її використовує застосунок перед тим, як
// прийняти чи закешувати дані, і скрипт scripts/validate-stations.mjs у CI.
//
// schema — версія формату файлу. Застосунок приймає лише схеми, які вміє
// читати; новішу (несумісну) ігнорує і лишається на своїй копії. Якщо формат
// змінюється несумісно, збільшуйте schema в stations.json і SUPPORTED_SCHEMA тут.
//
// Android бере дані з stations.v<SUPPORTED_SCHEMA>.json (збірка кладе туди копію
// stations.json, vite.config.js → stationsBySchema). Перехід на schema 2:
//   1. далі публікувати і stations.v1.json — дані в старому форматі для старих APK;
//   2. додати в нього "newest_schema": 2 — старі застосунки покажуть «Оновіть застосунок».

export const SUPPORTED_SCHEMA = 1;

const LINES = new Set(['red', 'blue', 'green']);

/** Нижня межа кількості станцій: менше — файл, найімовірніше, обрізаний або зіпсований. */
export const MIN_STATIONS = 40;

/** «05:46», «24:00» — час доби у форматі ГГ:ХХ. */
const HHMM_RE = /^([01]\d|2[0-4]):[0-5]\d$/;
/** Вагон і двері в даних: «2», «2-3», «1–3», «4, 5». */
const WAGON_DOORS_RE = /^\d+(\s*[,\-–]\s*\d+)*$/;

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const isTime = v => typeof v === 'string' && HHMM_RE.test(v);
/** Пара секунд інтервалу [мін, макс]. */
const isIntervalPair = v => Array.isArray(v) && v.length === 2 && v.every(n => Number.isFinite(n) && n > 0) && v[0] <= v[1];

/**
 * Перевіряє структуру, від якої залежить запуск (hydrateStations, обхід позицій).
 * @param {unknown} input — розібраний stations.json
 * @returns {string[]} список помилок; порожній — дані придатні
 */
export function validateStationsData(input) {
  /** @type {any} — форму якраз і перевіряємо */
  const data = input;
  const errors = [];
  const fail = msg => { if (errors.length < 20) errors.push(msg); };

  if (!data || typeof data !== 'object') return ['файл не є JSON-об\'єктом'];

  const schema = data.schema ?? 1;
  if (!Number.isInteger(schema) || schema < 1) fail(`schema має бути цілим числом ≥ 1, а не ${JSON.stringify(data.schema)}`);
  else if (schema > SUPPORTED_SCHEMA) fail(`schema ${schema} новіша за підтримувану (${SUPPORTED_SCHEMA})`);

  if (!/^\d{8}$/.test(String(data.version ?? ''))) fail(`version має бути числом РРРРММДД (8 цифр), а не ${JSON.stringify(data.version)}`);

  validateLineIntervals(data.line_intervals, fail);

  if (!Array.isArray(data.stations) || data.stations.length === 0) {
    fail('немає непорожнього масиву stations');
    return errors;
  }
  if (data.stations.length < MIN_STATIONS) fail(`станцій лише ${data.stations.length}, очікується щонайменше ${MIN_STATIONS}`);

  const slugs = new Set();
  data.stations.forEach((s, i) => {
    const positionIds = new Set();
    const where = `stations[${i}]${s?.slug ? ` (${s.slug})` : ''}`;
    if (!s || typeof s !== 'object') { fail(`${where}: не об'єкт`); return; }
    if (typeof s.slug !== 'string' || !s.slug) fail(`${where}: немає slug`);
    else if (slugs.has(s.slug)) fail(`${where}: slug повторюється`);
    else slugs.add(s.slug);
    if (typeof s.name !== 'string' || !s.name) fail(`${where}: немає name`);
    if (!LINES.has(s.line)) fail(`${where}: невідома лінія ${JSON.stringify(s.line)}`);
    if (s.exits_catalog != null && !isObj(s.exits_catalog)) {
      fail(`${where}: exits_catalog має бути об'єктом`);
    }
    const catalog = isObj(s.exits_catalog) ? s.exits_catalog : {};
    for (const [id, ex] of Object.entries(catalog)) {
      const cWhere = `${where}.exits_catalog.${id}`;
      if (!isObj(ex)) { fail(`${cWhere}: не об'єкт`); continue; }
      if (ex.label != null && typeof ex.label !== 'string') fail(`${cWhere}: label має бути рядком`);
      if (ex.exit_numbers != null) {
        if (!Array.isArray(ex.exit_numbers)) fail(`${cWhere}: exit_numbers має бути масивом`);
        else ex.exit_numbers.forEach((n, k) => {
          if (!isObj(n)) fail(`${cWhere}.exit_numbers[${k}]: не об'єкт`);
          else if (n.text != null && typeof n.text !== 'string') fail(`${cWhere}.exit_numbers[${k}]: text має бути рядком`);
        });
      }
    }
    validateSchedule(s.schedule, where, fail);
    validateConnections(s.connections, where, fail);
    if (s.directions == null) return;
    if (!Array.isArray(s.directions)) { fail(`${where}: directions має бути масивом`); return; }
    s.directions.forEach((d, j) => {
      const dWhere = `${where}.directions[${j}]`;
      if (!d || typeof d !== 'object') { fail(`${dWhere}: не об'єкт`); return; }
      if (typeof d.from !== 'string') fail(`${dWhere}: немає from`);
      if (!Array.isArray(d.exits)) { fail(`${dWhere}: exits має бути масивом`); return; }
      d.exits.forEach((ex, k) => {
        const eWhere = `${dWhere}.exits[${k}]`;
        if (!ex || typeof ex !== 'object') { fail(`${eWhere}: не об'єкт`); return; }
        if (s.exits_catalog != null && !Object.prototype.hasOwnProperty.call(catalog, String(ex.id))) {
          fail(`${eWhere}: вихід ${JSON.stringify(ex.id)} відсутній в exits_catalog`);
        }
        if (ex.positions != null && !Array.isArray(ex.positions)) fail(`${eWhere}: positions має бути масивом`);
        (ex.positions || []).forEach((p, m) => {
          const pWhere = `${eWhere}.positions[${m}]`;
          if (!p || typeof p !== 'object') { fail(`${pWhere}: не об'єкт`); return; }
          // До id прив'язані вибране, чекіни й правки (scripts/assign-position-ids.py)
          if (typeof p.id !== 'string' || !p.id) fail(`${pWhere}: немає id (запустіть scripts/assign-position-ids.py)`);
          else if (positionIds.has(p.id)) fail(`${pWhere}: id ${p.id} повторюється на станції`);
          else positionIds.add(p.id);
          for (const field of ['wagon', 'doors']) {
            if (typeof p[field] !== 'string' || !WAGON_DOORS_RE.test(p[field].trim())) {
              fail(`${pWhere}: ${field} має бути рядком із цифр («2», «2-3», «4, 5»), а не ${JSON.stringify(p[field])}`);
            }
          }
        });
      });
    });
  });

  // Посилання на інші станції (пересадки, попередня станція напрямку)
  data.stations.forEach(s => {
    if (!s || typeof s !== 'object') return;
    const check = (value, where) => {
      if (value != null && !slugs.has(value)) fail(`${s.slug}: ${where} посилається на невідому станцію ${JSON.stringify(value)}`);
    };
    for (const [id, ex] of Object.entries(s.exits_catalog || {})) {
      check(ex?.transfer_to, `exits_catalog.${id}.transfer_to`);
      check(ex?.link_to,     `exits_catalog.${id}.link_to`);
    }
    (Array.isArray(s.directions) ? s.directions : []).forEach((d, j) => check(d?.from_slug, `directions[${j}].from_slug`));
  });

  return errors;
}

/** Розклад станції: години входу й перший/останній поїзд у кожен бік. */
function validateSchedule(sch, where, fail) {
  if (sch == null) return;
  const w = `${where}.schedule`;
  if (!isObj(sch)) { fail(`${w}: має бути об'єктом`); return; }
  for (const f of ['open', 'close']) {
    if (!isTime(sch[f])) fail(`${w}.${f}: має бути час ГГ:ХХ, а не ${JSON.stringify(sch[f])}`);
  }
  if (sch.trains == null) return;
  if (!isObj(sch.trains)) { fail(`${w}.trains: має бути об'єктом`); return; }
  for (const [terminal, t] of Object.entries(sch.trains)) {
    if (!isObj(t)) { fail(`${w}.trains.${terminal}: не об'єкт`); continue; }
    for (const f of ['first', 'last']) {
      if (!isTime(t[f])) fail(`${w}.trains.${terminal}.${f}: має бути час ГГ:ХХ, а не ${JSON.stringify(t[f])}`);
    }
  }
}

/** Інтервали руху: { лінія: [{ from, to, weekday: { кінцева: [мін, макс] }, holiday }] }. */
function validateLineIntervals(li, fail) {
  if (li == null) return;
  if (!isObj(li)) { fail('line_intervals має бути об\'єктом'); return; }
  for (const [line, periods] of Object.entries(li)) {
    const w = `line_intervals.${line}`;
    if (!LINES.has(line)) fail(`${w}: невідома лінія`);
    if (!Array.isArray(periods)) { fail(`${w}: має бути масивом`); continue; }
    periods.forEach((p, i) => {
      const pw = `${w}[${i}]`;
      if (!isObj(p)) { fail(`${pw}: не об'єкт`); return; }
      if (!isTime(p.from) || !isTime(p.to)) fail(`${pw}: from/to мають бути часом ГГ:ХХ`);
      for (const day of ['weekday', 'holiday']) {
        if (p[day] == null) continue;
        if (!isObj(p[day])) { fail(`${pw}.${day}: має бути об'єктом`); continue; }
        for (const [terminal, pair] of Object.entries(p[day])) {
          if (!isIntervalPair(pair)) fail(`${pw}.${day}.${terminal}: має бути пара секунд [мін, макс]`);
        }
      }
    });
  }
}

/** Пересадки й наземний транспорт: форми, від яких залежить рендер картки. */
function validateConnections(c, where, fail) {
  if (c == null) return;
  const w = `${where}.connections`;
  if (!isObj(c)) { fail(`${w}: має бути об'єктом`); return; }
  for (const f of ['stops', 'hubs']) {
    if (c[f] == null) continue;
    if (!Array.isArray(c[f])) { fail(`${w}.${f}: має бути масивом`); continue; }
    c[f].forEach((x, i) => {
      if (!isObj(x) || typeof x.name !== 'string') fail(`${w}.${f}[${i}]: має бути об'єктом із name`);
    });
  }
  for (const f of ['ground', 'city_train', 'funicular']) {
    if (c[f] != null && !isObj(c[f])) fail(`${w}.${f}: має бути об'єктом`);
  }
}

/** true, якщо дані придатні для цієї версії застосунку. */
export function isValidStationsData(data) {
  return validateStationsData(data).length === 0;
}

/**
 * Чи є вже новіший формат даних, ніж уміє цей застосунок (тоді варто оновитися).
 * @param {unknown} data — розібраний stations.json
 */
export function newerSchemaAvailable(data) {
  const d = /** @type {any} */ (data);
  return Math.max(Number(d?.schema) || 0, Number(d?.newest_schema) || 0) > SUPPORTED_SCHEMA;
}

/** Номер версії даних як число (для порівняння); невідома — 0. */
export function stationsVersion(data) {
  const v = Number(data?.version);
  return Number.isFinite(v) ? v : 0;
}
