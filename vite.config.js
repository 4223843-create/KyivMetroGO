import { defineConfig } from 'vite';
import { VitePWA }      from 'vite-plugin-pwa';
import path             from 'path';
import fs               from 'fs';

const buildDate = Date.now().toString();

// Схема метро вставляється прямо в index.html під час збірки (і в dev-сервері),
// а не імпортом ?raw у JS: головний скрипт легший на ~138 КБ, і браузер
// розбирає SVG як розмітку, а не як рядок JavaScript.
const MAP_PLACEHOLDER = '<div id="mapInner" class="map-inner"></div>';
function inlineMetroScheme() {
  const file = path.resolve(__dirname, 'KyivMetroScheme.svg');
  return {
    name: 'inline-metro-scheme',
    configureServer(server) { server.watcher.add(file); },
    transformIndexHtml(html) {
      if (!html.includes(MAP_PLACEHOLDER)) throw new Error('index.html: немає місця для схеми метро (#mapInner)');
      const svg = fs.readFileSync(file, 'utf8').replace(/<\?xml[^>]*>\s*/, '').trim();
      return html.replace(MAP_PLACEHOLDER, `<div id="mapInner" class="map-inner">${svg}</div>`);
    },
  };
}

export default defineConfig({
  base:      './',
  root:      '.',
  publicDir: 'public',

  resolve: {
    alias: {
      // Зручні аліаси для імпортів — без відносних шляхів ../../
      '@core':     path.resolve(__dirname, 'src/core'),
      '@ui':       path.resolve(__dirname, 'src/ui'),
      '@data':     path.resolve(__dirname, 'src/data'),
      '@map':      path.resolve(__dirname, 'src/map'),
      '@sheets':   path.resolve(__dirname, 'src/sheets'),
      '@features': path.resolve(__dirname, 'src/features'),
      '@infra':    path.resolve(__dirname, 'src/infra'),
    },
  },

  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
  },

  // Явна конфігурація dev-сервера. Без цього Vite сам вгадує порт для
  // WebSocket'а гарячого перезавантаження (HMR) з location.port у браузері —
  // і якщо сторінку відкрито не напряму (проксі, тунель, port-forwarding у
  // хмарному середовищі розробки), вгадування ламається і виникає
  // "Failed to construct 'WebSocket': ...localhost:undefined...".
  // strictPort:true — щоб порт завжди був саме 5173, а не "перший вільний".
  server: {
    host:       true,
    port:       5173,
    strictPort: true,
    hmr: {
      // Якщо все ще падає в вашому середовищі — це означає, що назовні
      // (у браузері) сервер видно на ІНШОМУ порту/хості, ніж 5173 напряму.
      // Тоді розкоментуйте й підставте порт/хост, під яким Vite реально
      // видно ззовні (наприклад, порт, який відкриває тунель чи проксі):
      // clientPort: 443,
      // host: 'your-public-preview-host',
    },
  },

  build: {
    // Явна нижня межа: на старому WebView/Safari новий синтаксис дав би білий екран.
    // Для Android ту саму межу задає android.minWebViewVersion у capacitor.config.json.
    target:        ['chrome90', 'safari15'],
    sourcemap:     false,          // явно вимкнено для production — менший bundle, без витоку коду
    modulePreload: { polyfill: false },
    outDir:        'dist',
    rollupOptions: {
      input: 'index.html',
      output: {
        entryFileNames: 'assets/[name].[hash].js',
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
      },
    },
  },

  // З production-збірки прибираємо debugger і «балакучі» console.log/debug/info.
  // console.error і console.warn лишаються — без них після релізу не видно причин збоїв.
  esbuild: {
    drop:        ['debugger'],
    pure:        ['console.log', 'console.debug', 'console.info'],
    legalComments: 'none',          // прибирає copyright-коментарі з vendor-коду
  },

  plugins: [
    inlineMetroScheme(),
    VitePWA({
      strategies:      'injectManifest',
      srcDir:          'public',
      filename:        'sw.js',
      manifest:        false,
      // SW реєструє infra/serviceWorker.js лише у веб-версії. Автоматичний
      // registerSW.js реєстрував би його і в застосунку Android/iOS.
      injectRegister:  false,
      injectManifest:  {
        rollupFormat:   'iife',
        injectionPoint: 'self.__WB_MANIFEST',
        globDirectory:  'dist',
        // Іконки теж: без них встановлений офлайн PWA лишився б без значка й заставки.
        globPatterns:   ['**/*.{js,css,html,png,woff2,json}'],
        // Firebase потрібен лише режиму розробника (services/devCloud.js) —
        // не змушуємо кожного користувача завантажувати його при встановленні SW.
        // addresses-geo.json — лише для кнопки «Поточне місцезнаходження» (типово вимкнена):
        // service worker збереже його при першому використанні.
        globIgnores:    ['**/firebaseSync.*.js', '**/addresses-geo.json'],
        // addresses.json (~1–2 МБ) — для офлайн-пошуку адрес; ліміт Workbox за замовчуванням 2 МБ
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
});