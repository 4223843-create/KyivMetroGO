// Запускається після `vite build` і вшиває сьогоднішню дату в dist/sw.js.
// Завдяки цьому SW-кеш автоматично скидається при кожному деплої.
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const swPath = join(__dirname, 'dist', 'sw.js');

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');

let content;
try {
  content = readFileSync(swPath, 'utf8');
} catch {
  console.warn('[update-sw-date] dist/sw.js не знайдено — пропускаємо.');
  process.exit(0);
}

const updated = content.replace(
  /const BUILD_DATE = '[^']*';/,
  `const BUILD_DATE = '${date}';`
);

if (updated === content) {
  console.warn('[update-sw-date] Рядок BUILD_DATE не знайдено в dist/sw.js.');
  process.exit(0);
}

writeFileSync(swPath, updated, 'utf8');
console.log(`✅  SW BUILD_DATE оновлено → ${date}`);
