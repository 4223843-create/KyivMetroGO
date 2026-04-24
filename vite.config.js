import { defineConfig } from 'vite';
import { VitePWA }    from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  root: '.',
  publicDir: 'public',
  build: {
    target: 'es2018',
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
      output: {
        manualChunks: {
          // feedback — окремий lazy chunk, завантажується лише при кліку
          feedback: ['./src/feedback.js'],
        },
        entryFileNames:  'assets/[name].[hash].js',
        chunkFileNames:  'assets/[name].[hash].js',
        assetFileNames:  'assets/[name].[hash][extname]',
      },
    },
  },

  plugins: [
    VitePWA({
      // Використовуємо наш власний sw.js з public/
      strategies: 'injectManifest',
      srcDir: 'public',
      filename: 'sw.js',

      // Manifest вже є у public/manifest.json — не генеруємо новий
      manifest: false,

      injectManifest: {
        // Vite автоматично вставить precache-маніфест з хешованими URL
        // у місце де sw.js викликає self.__WB_MANIFEST
        injectionPoint: 'self.__WB_MANIFEST',
        globDirectory: 'dist',
        globPatterns: [
          '**/*.{js,css,html,woff2}',
          // SVG і stations.json НЕ включаємо в precache глобом:
          // SVG — вже в JS-бандлі; stations.json — network-first
        ],
        rollupFormat: 'iife'
      },

      devOptions: {
        enabled: false, // в dev SW не потрібен
      },
    }),
  ],
});
