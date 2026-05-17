import { defineConfig } from 'vite';
import { VitePWA }      from 'vite-plugin-pwa';
import path             from 'path';

const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

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
