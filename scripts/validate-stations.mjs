// Перевірка public/stations.json тією самою функцією, що й у застосунку.
// Запуск: npm run validate:data
import { readFileSync } from 'node:fs';
import { validateStationsData } from '../src/data/validateStations.js';

const path = new URL('../public/stations.json', import.meta.url);
let data;
try {
  data = JSON.parse(readFileSync(path, 'utf8'));
} catch (err) {
  console.error(`stations.json не читається як JSON: ${err.message}`);
  process.exit(1);
}

const errors = validateStationsData(data);
if (errors.length) {
  console.error('stations.json має помилки:');
  errors.forEach(e => console.error(`  - ${e}`));
  process.exit(1);
}
console.log(`stations.json гаразд: версія ${data.version}, схема ${data.schema ?? 1}, станцій ${data.stations.length}`);
