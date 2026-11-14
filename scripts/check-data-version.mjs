// Перевірка, що зміна public/stations.json підняла version.
// Android завантажує нові дані, лише коли version більша за наявну
// (_refreshStationsInBackground у src/data/stations.js), тож правка без підняття
// версії ніколи не дійде до застосунків.
// Запуск: node scripts/check-data-version.mjs <базовий коміт>   (у CI — крок Check)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { stationsVersion } from '../src/data/validateStations.js';

const FILE = 'public/stations.json';
const base = process.argv[2];
if (!base || /^0+$/.test(base)) {
  console.log('Немає базового коміту — перевірку версії пропущено');
  process.exit(0);
}

let oldText;
try {
  oldText = execFileSync('git', ['show', `${base}:${FILE}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
} catch {
  console.log(`${FILE} немає в ${base} — перевірку версії пропущено`);
  process.exit(0);
}

const parse = (text, label) => {
  try { return JSON.parse(text); } catch (err) {
    console.error(`${label}: ${FILE} не читається як JSON: ${err.message}`);
    process.exit(label === 'база' ? 0 : 1);
  }
};
const oldData = parse(oldText, 'база');
const newData = parse(readFileSync(FILE, 'utf8'), 'зміна');

const strip = d => { const { version: _v, ...rest } = d || {}; return rest; };
if (isDeepStrictEqual(strip(oldData), strip(newData))) {
  console.log('Вміст stations.json не змінився — підняття версії не потрібне');
  process.exit(0);
}

const before = stationsVersion(oldData);
const after = stationsVersion(newData);
if (after <= before) {
  console.error(`stations.json змінено, але version не зросла (${oldData.version} → ${newData.version}).`);
  console.error('Підніміть version (РРРРММДД, більше за попередню), інакше Android не завантажить нові дані.');
  process.exit(1);
}
console.log(`stations.json змінено, версія ${oldData.version} → ${newData.version}`);
