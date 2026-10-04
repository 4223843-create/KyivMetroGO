// ══ ПЕРЕВІРКА stations.json ══
// Чиста функція без DOM і Capacitor: її використовує застосунок перед тим, як
// прийняти чи закешувати дані, і скрипт scripts/validate-stations.mjs у CI.
//
// schema — версія формату файлу. Застосунок приймає лише схеми, які вміє
// читати; новішу (несумісну) ігнорує і лишається на своїй копії. Якщо формат
// змінюється несумісно, збільшуйте schema в stations.json і SUPPORTED_SCHEMA тут.

export const SUPPORTED_SCHEMA = 1;

const LINES = new Set(['red', 'blue', 'green']);

/**
 * Перевіряє структуру, від якої залежить запуск (hydrateStations, обхід позицій).
 * @param {unknown} data — розібраний stations.json
 * @returns {string[]} список помилок; порожній — дані придатні
 */
export function validateStationsData(data) {
  const errors = [];
  const fail = msg => { if (errors.length < 20) errors.push(msg); };

  if (!data || typeof data !== 'object') return ['файл не є JSON-об\'єктом'];

  const schema = data.schema ?? 1;
  if (!Number.isInteger(schema) || schema < 1) fail(`schema має бути цілим числом ≥ 1, а не ${JSON.stringify(data.schema)}`);
  else if (schema > SUPPORTED_SCHEMA) fail(`schema ${schema} новіша за підтримувану (${SUPPORTED_SCHEMA})`);

  if (!/^\d+$/.test(String(data.version ?? ''))) fail(`version має бути числом РРРРММДД, а не ${JSON.stringify(data.version)}`);

  if (!Array.isArray(data.stations) || data.stations.length === 0) {
    fail('немає непорожнього масиву stations');
    return errors;
  }

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
    if (s.exits_catalog != null && (typeof s.exits_catalog !== 'object' || Array.isArray(s.exits_catalog))) {
      fail(`${where}: exits_catalog має бути об'єктом`);
    }
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
        if (ex.positions != null && !Array.isArray(ex.positions)) fail(`${eWhere}: positions має бути масивом`);
        (ex.positions || []).forEach((p, m) => {
          const pWhere = `${eWhere}.positions[${m}]`;
          if (!p || typeof p !== 'object') { fail(`${pWhere}: не об'єкт`); return; }
          // До id прив'язані вибране, чекіни й правки (scripts/assign-position-ids.py)
          if (typeof p.id !== 'string' || !p.id) fail(`${pWhere}: немає id (запустіть scripts/assign-position-ids.py)`);
          else if (positionIds.has(p.id)) fail(`${pWhere}: id ${p.id} повторюється на станції`);
          else positionIds.add(p.id);
        });
      });
    });
  });

  return errors;
}

/** true, якщо дані придатні для цієї версії застосунку. */
export function isValidStationsData(data) {
  return validateStationsData(data).length === 0;
}

/** Номер версії даних як число (для порівняння); невідома — 0. */
export function stationsVersion(data) {
  const v = Number(data?.version);
  return Number.isFinite(v) ? v : 0;
}
