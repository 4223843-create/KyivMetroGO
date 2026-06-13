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
