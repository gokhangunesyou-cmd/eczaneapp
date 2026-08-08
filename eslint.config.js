import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      '.wrangler/**',
      'test-results/**',
      'playwright-report/**',
      'design/support.js', // Claude Design runtime'ı — bizim kodumuz değil
      'src/shared/api-types.d.ts', // üretilen dosya
      'worker-configuration.d.ts', // wrangler types çıktısı
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Kullanılmayan değişken hata; `_` önekiyle kasıtlı olanlar muaf.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // Tip hatasını susturmak yasak — sözleşmeden sapma işaretidir.
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': true, 'ts-expect-error': 'allow-with-description' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // Yutulan promise = sessizce kaybolan hata. Worker'da özellikle tehlikeli.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ─── Arayüz ──────────────────────────────────────────────────────────────
  {
    files: ['src/app/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // ─── Worker ──────────────────────────────────────────────────────────────
  {
    files: ['src/worker/**/*.ts'],
    languageOptions: {
      globals: globals.worker,
    },
    rules: {
      // Worker'da `console.log` gözlemlenebilirlik akışına gider; yapılandırılmış
      // logger dışında kullanılmaz.
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // SQL string birleştirme yasağının ilk savunma hattı — asıl denetim
      // kod incelemesinde (.claude/agents/kod-inceleyici.md).
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name='prepare'] > TemplateLiteral[expressions.length>0]",
          message:
            "D1 sorgusuna değişken template literal ile gömülmez. prepare('... ?').bind(deger) kullan.",
        },
      ],
    },
  },

  // ─── Testler ─────────────────────────────────────────────────────────────
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      'no-console': 'off',
    },
  },

  // ─── Node ortamındaki araç dosyaları ────────────────────────────────────
  // Bunlar hiçbir tsconfig projesinde değil, tip bilgisi gerektiren kurallar
  // burada çalışamaz. `disableTypeChecked`in kuralları YAYILARAK alınmalı —
  // altına ayrı bir `rules` yazmak onu tamamen ezer ve typed kurallar geri gelir.
  {
    files: ['*.config.{ts,js}', 'eslint.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: globals.node,
      // Bu dosyalar hiçbir tsconfig projesinde değil; proje servisi kapatılmazsa
      // parser onları çözemeyip "not found by the project service" hatası verir.
      parserOptions: { projectService: false, project: false },
    },
    rules: {
      ...tseslint.configs.disableTypeChecked.rules,
      'no-console': 'off',
    },
  },
);
