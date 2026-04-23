import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
      output: {
        manualChunks: {
          // feedback стає окремим chunk — завантажується лише при кліку
          feedback: ['./feedback.js'],
        },
        entryFileNames:  'assets/[name].[hash].js',
        chunkFileNames:  'assets/[name].[hash].js',
        assetFileNames:  'assets/[name].[hash][extname]',
      },
    },
  },
});
