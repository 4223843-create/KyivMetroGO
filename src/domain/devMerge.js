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

/**
 * Видаляє tombstone-записи, старші за maxAgeMs (за замовчуванням 7 діб).
 * Викликається один раз на старті у _performFullSync — лише якщо є авторизація.
 * @param {object} map  — структура {slug: {posIdx: entry}}
 * @param {number} [maxAgeMs]
 * @returns {object}
 */
export function purgeTombstones(map, maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
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

export function mergeConfirmations(local, cloud) {
  const merged = {};
  const slugs = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  for (const slug of slugs) {
    merged[slug] = {};
    const posIdxs = new Set([
      ...Object.keys(local?.[slug] || {}),
      ...Object.keys(cloud?.[slug] || {}),
    ]);
    for (const posIdx of posIdxs) {
      const l = local?.[slug]?.[posIdx] || emptyConfirmationData();
      const c = cloud?.[slug]?.[posIdx] || emptyConfirmationData();

      // resetAt — таймстамп явного скидання цієї позиції (resetConfirmationData).
      // Якщо скидання відбулось ПІСЛЯ останнього оновлення іншого боку —
      // скидання перемагає, і ми не відновлюємо старі лічильники з хмари.
      const lResetAt   = l.resetAt ?? 0;
      const cResetAt   = c.resetAt ?? 0;
      const lUpdatedAt = l.updatedAt ?? 0;
      const cUpdatedAt = c.updatedAt ?? 0;

      // Локальне скидання новіше за хмарні дані → беремо локальний (порожній) стан
      if (lResetAt > cUpdatedAt && lResetAt >= cResetAt) {
        merged[slug][posIdx] = { ...l };
        continue;
      }
      // Хмарне скидання новіше за локальні дані → беремо хмарний (порожній) стан
      if (cResetAt > lUpdatedAt && cResetAt > lResetAt) {
        merged[slug][posIdx] = { ...c };
        continue;
      }

      // Звичайний merge — монотонні лічильники, OR для finalConfirmed
      const corrections = {};
      const corrKeys = new Set([
        ...Object.keys(l.corrections || {}),
        ...Object.keys(c.corrections || {}),
      ]);
      for (const k of corrKeys) {
        corrections[k] = Math.max(l.corrections?.[k] || 0, c.corrections?.[k] || 0);
      }

      merged[slug][posIdx] = {
        finalConfirmed: !!(l.finalConfirmed || c.finalConfirmed),
        confirmCount:   Math.max(l.confirmCount  || 0, c.confirmCount  || 0),
        disputeCount:   Math.max(l.disputeCount  || 0, c.disputeCount  || 0),
        corrections,
        lastAction:     l.lastAction || null,
        updatedAt:      Math.max(lUpdatedAt, cUpdatedAt),
        resetAt:        Math.max(lResetAt,   cResetAt) || null,
      };
    }
    if (!Object.keys(merged[slug]).length) delete merged[slug];
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
export function applyCloudVerifiedIntoConfirmations(confirmations, cloudVerified) {
  if (!cloudVerified) return confirmations;
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
export function mergeBacklog(local, cloud, base) {
  const l = (local || '').trim();
  const c = (cloud || '').trim();
  const b = (base || '').trim();

  // Нічого немає
  if (!l && !c) return '';

  // Перший запуск / немає попередньої синхронізованої версії
  if (!b) {
    if (!l) return c;
    if (!c) return l;
    if (l === c) return l;

    // Якщо cloud є частиною local — локальна версія вже містить cloud
    if (l.startsWith(c + '\n') || l === c) return l;

    // Якщо local є частиною cloud — хмарна версія вже містить local
    if (c.startsWith(l + '\n')) return c;

    // Справді незалежні тексти
    return `${l}\n\n— з іншого пристрою —\n${c}`;
  }

  // Нічого не змінилося локально
  if (l === b) return c;

  // Нічого не змінилося в хмарі
  if (c === b) return l;

  // Зміни відбулися тільки локально
  if (l !== b && c === b) return l;

  // Зміни відбулися тільки в cloud
  if (l === b && c !== b) return c;

  // Обидві сторони змінилися.
  // Визначаємо додані частини відносно останньої
  // синхронізованої версії.
  const baseLines = b.split('\n');
  const localLines = l.split('\n');
  const cloudLines = c.split('\n');

  function getAddedLines(currentLines) {
    let i = 0;

    while (
      i < baseLines.length &&
      i < currentLines.length &&
      baseLines[i] === currentLines[i]
    ) {
      i++;
    }

    return currentLines.slice(i);
  }

  const localAdded = getAddedLines(localLines);
  const cloudAdded = getAddedLines(cloudLines);

  // Починаємо з базової версії.
  const result = [...baseLines];

  // Додаємо зміни cloud
  for (const line of cloudAdded) {
    if (!result.includes(line)) {
      result.push(line);
    }
  }

  // Додаємо локальні зміни
  for (const line of localAdded) {
    if (!result.includes(line)) {
      result.push(line);
    }
  }

  return result.join('\n').trim();
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
