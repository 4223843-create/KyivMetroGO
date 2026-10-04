// ══ ОБХІД ПОЗИЦІЙ СТАНЦІЇ ══
// Утиліти для ітерації по вкладеній структурі:
//   station → directions[] → exits[] → positions[]
// Забезпечують єдиний монотонний posIdx для всіх споживачів
// (fbState, localEdits, applyExitLabels).

/**
 * Обходить усі positions станції у порядку directions → exits → positions.
 * Передає в callback об'єкт з усіма рівнями вкладеності та глобальним posIdx.
 *
 * @param {object} station — об'єкт станції зі stationsData
 * @param {(ctx: {
 *   dir:     object,
 *   exit:    object,
 *   position: object,
 *   dirIdx:  number,
 *   exitIdx: number,
 *   posIdx:  number,
 *   posInExit: number,
 * }) => void} callback
 */
export function traversePositions(station, callback) {
  if (!station?.directions) return;
  let posIdx = 0;

  for (let dirIdx = 0; dirIdx < station.directions.length; dirIdx++) {
    const dir = station.directions[dirIdx];
    for (let exitIdx = 0; exitIdx < dir.exits.length; exitIdx++) {
      const exit = dir.exits[exitIdx];
      const positions = exit.positions ?? [];
      for (let i = 0; i < positions.length; i++) {
        callback({ dir, exit, position: positions[i], dirIdx, exitIdx, posIdx, posInExit: i });
        posIdx++;
      }
    }
  }
}

/**
 * Проходить по всіх positions станції та повертає масив результатів mapper().
 * undefined з mapper пропускаються.
 *
 * @template T
 * @param {object}   station
 * @param {Function} mapper  — отримує той самий ctx, що й traversePositions
 * @returns {T[]}
 */
export function mapPositions(station, mapper) {
  const results = [];
  traversePositions(station, ctx => {
    const result = mapper(ctx);
    if (result !== undefined) results.push(result);
  });
  return results;
}

/**
 * Постійний id позиції: поле id у stations.json (scripts/assign-position-ids.py),
 * а для виходів, доданих користувачем, — їхній ключ «new|…» (data/localEdits.js).
 * До нього прив'язані вибране, чекіни, локальні правки й дані розробника.
 */
export function positionId(position) {
  return position?.id ?? position?._key ?? null;
}

/**
 * Знаходить позицію станції за id.
 * @returns {{ dir: object, exit: object, position: object, exitIdx: number, posInExit: number }|null}
 */
export function findPosition(station, id) {
  if (!station || id == null) return null;
  let found = null;
  traversePositions(station, ctx => {
    if (!found && positionId(ctx.position) === id) found = ctx;
  });
  return found;
}

/** Напрямок довгого переходу (Хрещатик) — не окрема колія. */
export const isLongTransferDir = dir => dir?.from === '__long_transfer__';

/**
 * Підпис напрямку так, як його показує картка станції (і як його раніше
 * зберігало Вибране): «кінцева» та «вихід праворуч» — без підпису,
 * довгий перехід — словами, &nbsp; — справжнім нерозривним пробілом.
 */
export function displayDirOf(dir) {
  const from = String(dir?.from ?? '');
  const lower = from.trim().toLowerCase();
  if (lower === 'кінцева' || lower === 'вихід праворуч') return '';
  if (from === '__long_transfer__') return 'довгий\u00a0перехід на\u00a0Майдан\u00a0Незалежності';
  return from.replace(/&nbsp;/g, '\u00a0').trim();
}

/**
 * Старий ключ позиції (до появи id у даних): напрямок + id виходу + номер
 * позиції у виході. Потрібен лише щоб перевести збережені записи на id.
 */
export function legacyPositionKey(dir, exit, exitIdx, posInExit) {
  return `${dir.from}|${exit.id ?? '#' + exitIdx}|${posInExit}`;
}

/** Map<старий ключ, id> для станції — для переведення збережених записів. */
export function legacyKeyMap(station) {
  const map = new Map();
  traversePositions(station, ({ dir, exit, position, exitIdx, posInExit }) => {
    if (position.id) map.set(legacyPositionKey(dir, exit, exitIdx, posInExit), position.id);
  });
  return map;
}
