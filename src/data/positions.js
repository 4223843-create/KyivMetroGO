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

export function mapPositions(station, mapper) {
  const results = [];
  traversePositions(station, ctx => {
    const result = mapper(ctx);
    if (result !== undefined) results.push(result);
  });
  return results;
}
