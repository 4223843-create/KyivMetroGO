// ══ УТИЛІТА ОБХОДУ ПОЗИЦІЙ ══
// Єдина точка для обходу station.directions → exits → positions.
// Замінює три ідентичні вкладені цикли у feedback.js і stations.js.
//
// callback(ctx) викликається для кожної позиції:
//   ctx.dir      — об’єкт напрямку   (live ref, можна мутувати)
//   ctx.exit     — об’єкт виходу     (live ref, можна мутувати)
//   ctx.position — об’єкт позиції    (live ref, можна мутувати)
//   ctx.dirIdx   — індекс напрямку
//   ctx.exitIdx  — індекс виходу
//   ctx.posIdx   — глобальний лічильник позицій по всій станції

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

// Зручна обгортка — повертає масив результатів (аналог flatMap)
export function mapPositions(station, mapper) {
const results = [];
traversePositions(station, ctx => {
const result = mapper(ctx);
if (result !== undefined) results.push(result);
});
return results;
}