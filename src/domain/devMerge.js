// ══ ЗЛИТТЯ ДАНИХ РОЗРОБНИКА З ХМАРОЮ ══
// Чисті функції без Storage, DOM і Firebase: їх викликає синхронізація в
// features/devmode.js, і їх можна перевіряти тестами окремо.

/** Порожній стан підтверджень позиції. */
export function emptyConfirmationData() {
  return { finalConfirmed: false, confirmCount: 0, disputeCount: 0, corrections: {}, lastAction: null, updatedAt: 0 };
}

// ── Об'єднання даних синхронізації з підтримкою tombstone ──
// Кожна нотатка тепер зберігається як об'єкт { v: string, t: number, d?: true }
// замість голого рядка. Поле d:true означає «навмисно видалено».
// Переможець визначається виключно за таймстампом t — останній запис виграє,
// незалежно від того, це додавання чи видалення. Це гарантує, що явне
// видалення (tombstone) не скасовується старим значенням із хмари.
//
// Зворотна сумісність: якщо при читанні зустрічається голий рядок (старий
// формат) — він обгортається у { v: string, t: 0 } і тихо мігрує при
// наступному записі. Оскільки t:0 < будь-якого реального таймстампу — при
// конфлікті зі свіжим tombstone tombstone перемагає, що є правильною
// поведінкою (нового видаляє старе).
export function wrapLegacyEntry(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'object') return raw;            // вже новий формат
  return { v: String(raw), t: 0 };                   // старий голий рядок
}

export function mergeKeyedMap(local, cloud) {
  const merged = {};
  const outerKeys = new Set([
    ...Object.keys(local || {}),
    ...Object.keys(cloud || {}),
  ]);
  for (const outerKey of outerKeys) {
    const innerKeys = new Set([
      ...Object.keys(local?.[outerKey] || {}),
      ...Object.keys(cloud?.[outerKey] || {}),
    ]);
    const innerMerged = {};
    for (const innerKey of innerKeys) {
      const l = wrapLegacyEntry(local?.[outerKey]?.[innerKey]);
      const c = wrapLegacyEntry(cloud?.[outerKey]?.[innerKey]);
      if (!l && !c) continue;
      // Переможець — з більшим таймстампом; рівний — перевага локальному
      innerMerged[innerKey] = (!c || (l && (l.t ?? 0) >= (c.t ?? 0))) ? l : c;
    }
    // Не зберігаємо порожній slug — але tombstone-записи (d:true) зберігаємо,
    // щоб видалення дійшло до іншого пристрою при наступній синхронізації
    if (Object.keys(innerMerged).length) merged[outerKey] = innerMerged;
  }
  return merged;
}

// Скільки тримати позначки видалення. Пристрій, який не синхронізувався
// довше, поверне видалене, тож строк великий: записи крихітні. Раніше було
// 7 діб — і нотатки, видалені тиждень тому, оживали з телефону, який
// довго не відкривали.
export const TOMBSTONE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Видаляє tombstone-записи, старші за maxAgeMs (за замовчуванням рік).
 * @param {object} map  — структура {slug: {posIdx: entry}}
 * @param {number} [maxAgeMs]
 * @returns {object}
 */
export function purgeTombstones(map, maxAgeMs = TOMBSTONE_MAX_AGE_MS) {
  const now = Date.now();
  const result = {};
  for (const [outerKey, inner] of Object.entries(map || {})) {
    const cleaned = {};
    for (const [innerKey, entry] of Object.entries(inner || {})) {
      const e = wrapLegacyEntry(entry);
      if (e?.d && (now - (e.t ?? 0)) > maxAgeMs) continue; // прибираємо старий tombstone
      cleaned[innerKey] = e;
    }
    if (Object.keys(cleaned).length) result[outerKey] = cleaned;
  }
  return result;
}

/**
 * Підтвердження позиції — один запис, переможець за часом останньої дії
 * (updatedAt; resetAt — для скидань). Раніше лічильники брали максимум, а
 * «100%» — OR, тож зняте на одному пристрої підтвердження чи скасована
 * дія поверталися з іншого. Рівний час — перевага локальному.
 */
export function mergeConfirmations(local, cloud) {
  const time = r => Math.max(r?.updatedAt ?? 0, r?.resetAt ?? 0);
  const merged = {};
  const slugs = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  for (const slug of slugs) {
    const posIdxs = new Set([
      ...Object.keys(local?.[slug] || {}),
      ...Object.keys(cloud?.[slug] || {}),
    ]);
    const inner = {};
    for (const posIdx of posIdxs) {
      const l = local?.[slug]?.[posIdx];
      const c = cloud?.[slug]?.[posIdx];
      const winner = (!c || (l && time(l) >= time(c))) ? l : c;
      if (winner) inner[posIdx] = { ...winner };
    }
    if (Object.keys(inner).length) merged[slug] = inner;
  }
  return merged;
}

/** Похідний {slug:{posIdx:true}} з finalConfirmed — для сумісного формату дроту у Firestore. */
export function deriveVerifiedFromConfirmations(confirmations) {
  const verified = {};
  for (const slug of Object.keys(confirmations || {})) {
    for (const posIdx of Object.keys(confirmations[slug] || {})) {
      if (confirmations[slug][posIdx]?.finalConfirmed) {
        if (!verified[slug]) verified[slug] = {};
        verified[slug][posIdx] = true;
      }
    }
  }
  return verified;
}

/** Застосовує застарілий verified-формат із хмари.
 *  Не виставляє finalConfirmed якщо для цієї позиції є свіжий resetAt —
 *  це означає, що розробник явно скинув підтвердження після того, як
 *  verified-запис потрапив у хмару.
 */
export function applyCloudVerifiedIntoConfirmations(confirmations, cloudVerified, cloudHasConfirmations = false) {
  // Поточні версії пишуть повні confirmations; verified лише дублює їх для
  // зовсім старих версій. Застосовувати його поверх — означало б повертати
  // «100%», зняте на іншому пристрої.
  if (!cloudVerified || cloudHasConfirmations) return confirmations;
  const result = { ...confirmations };
  for (const slug of Object.keys(cloudVerified)) {
    if (!result[slug]) result[slug] = {};
    for (const posIdx of Object.keys(cloudVerified[slug])) {
      const current = result[slug][posIdx] || emptyConfirmationData();
      // Якщо є resetAt і він новіший ніж updatedAt — скидання вже відбулось,
      // ігноруємо старий verified із хмари
      if (current.resetAt && current.resetAt >= (current.updatedAt ?? 0)) continue;
      result[slug][posIdx] = { ...current, finalConfirmed: true };
    }
  }
  return result;
}
/**
 * Беклог — один спільний текст на всі пристрої.
 * Раніше незалежні версії склеювались через «— з іншого пристрою —», а при
 * змінах з обох боків додавались лише нові рядки: видалене на одному пристрої
 * поверталось з іншого, і з'являлись дублікати. Тепер текст береться цілком:
 *  – змінився лише один бік відносно base (останнього синхронізованого тексту) — береться він;
 *  – змінились обидва — новіший за t (час останнього редагування) замінює інший.
 * @param {{v:string,t:number}} local
 * @param {{v:string,t:number}} cloud
 * @param {string} base
 * @returns {{v:string,t:number}}
 */
export function mergeBacklog(local, cloud, base) {
  const l = { v: (local?.v || '').trim(), t: local?.t || 0 };
  const c = { v: (cloud?.v || '').trim(), t: cloud?.t || 0 };
  const b = (base || '').trim();

  if (l.v === c.v) return { v: l.v, t: Math.max(l.t, c.t) };
  if (l.v === b)   return c;          // змінилась лише хмара
  if (c.v === b)   return l;          // змінився лише цей пристрій
  return l.t >= c.t ? l : c;          // обидва: новіша правка, рівні — локальна
}

/** Видалені фото {id: t}: об'єднання, при збігу — пізніший час. */
export function mergePhotoTombstones(local, cloud) {
  const merged = { ...(local || {}) };
  for (const [id, t] of Object.entries(cloud || {})) merged[id] = Math.max(merged[id] || 0, t || 0);
  return merged;
}

/** Прибирає записи видалених фото, старші за maxAgeMs. */
export function purgePhotoTombstones(map, maxAgeMs = TOMBSTONE_MAX_AGE_MS) {
  const now = Date.now();
  return Object.fromEntries(Object.entries(map || {}).filter(([, t]) => now - (t || 0) <= maxAgeMs));
}

/** Merge нотаток станцій: переможець — запис з більшим таймстампом.
 *  Tombstone { d:true, t } зберігається, щоб видалення дійшло до іншого пристрою. */
export function mergeStationNotes(local, cloud) {
  const merged = {};
  const slugs = new Set([
    ...Object.keys(local || {}),
    ...Object.keys(cloud || {}),
  ]);
  for (const slug of slugs) {
    const l = wrapLegacyEntry(local?.[slug]);
    const c = wrapLegacyEntry(cloud?.[slug]);
    if (!l && !c) continue;
    // Переможець — з більшим t; при рівності — локальний
    const winner = (!c || (l && (l.t ?? 0) >= (c.t ?? 0))) ? l : c;
    merged[slug] = winner;
  }
  return merged;
}
