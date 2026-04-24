import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  root: '.',
  publicDir: 'public',
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
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        globDirectory: 'dist',
        globPatterns: [
          '**/*.{js,css,html,woff2}',
        ],
        rollupFormat: 'iife',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
