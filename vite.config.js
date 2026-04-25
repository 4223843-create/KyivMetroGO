import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const buildDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');

export default defineConfig({
  base: './',
  root: '.',
  publicDir: 'public',
  define: {
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
  build: {
    target: 'es2018',
    modulePreload: {
      polyfill: false,
    },
    outDir: 'dist',
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
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',
      manifest: false,
registerType: 'autoUpdate',

      injectManifest: {
        rollupFormat: 'iife',
        injectionPoint: 'self.__WB_MANIFEST',
        globDirectory: 'dist',
        globPatterns: [
          '**/*.{js,css,html}',
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
