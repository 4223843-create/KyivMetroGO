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
        callback({ dir, exit, position: positions[i], dirIdx, exitIdx, posIdx });
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
