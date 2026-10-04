// Лінтер ловить помилки, а не стиль: невизначені змінні, невживаний код,
// недосяжні гілки. Запуск: npm run lint (також у CI).
import js      from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/', 'android/', 'ios/', 'node_modules/', 'Microsoft/'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType:  'module',
      globals:     { ...globals.browser },
    },
    rules: {
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-empty':       ['error', { allowEmptyCatch: true }],
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ['scripts/**', 'tests/**', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node } },
  },
];
