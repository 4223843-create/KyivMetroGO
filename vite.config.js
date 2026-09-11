import { defineConfig } from 'vite';
import { VitePWA }      from 'vite-plugin-pwa';
import path             from 'path';

const buildDate = Date.now().toString();

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
    target:        'es2018',
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

  // Видаляємо console.* та debugger з production-збірки через esbuild.
  // esbuild вбудований у Vite і не потребує окремої залежності.
  esbuild: {
    drop:        ['console', 'debugger'],
    legalComments: 'none',          // прибирає copyright-коментарі з vendor-коду
  },

  plugins: [
    VitePWA({
      strategies:      'injectManifest',
      srcDir:          'public',
      filename:        'sw.js',
      manifest:        false,
      injectManifest:  {
        rollupFormat:   'iife',
        injectionPoint: 'self.__WB_MANIFEST',
        globDirectory:  'dist',
        globPatterns:   ['**/*.{js,css,html}'],
      },
      devOptions: { enabled: false },
    }),
  ],
});