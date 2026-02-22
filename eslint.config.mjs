import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tsEslint from '@typescript-eslint/eslint-plugin/use-at-your-own-risk/raw-plugin';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintPluginSimpleImportSort from 'eslint-plugin-simple-import-sort';

const eslintConfig = defineConfig([
  { ignores: ['node_modules/**', 'build/**', 'dist/**', 'NetscriptDefinitions.d.ts'] },
  js.configs.recommended,
  ...tsEslint.flatConfigs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    plugins: {
      import: eslintPluginImport,
      'simple-import-sort': eslintPluginSimpleImportSort,
      prettier: eslintPluginPrettier,
    },
    rules: {
      'simple-import-sort/imports': [
        'error',
        {
          groups: [['^\\u0000', '^node:', '^@?\\w', '^', '^\\.']],
        },
      ],
      'simple-import-sort/exports': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
      'prettier/prettier': 'error',
      'no-constant-condition': 'off',
      'no-prototype-builtins': 'off',
      'no-unused-vars': ['error', { args: 'none', destructuredArrayIgnorePattern: '[A-Z]', ignoreRestSiblings: true }],
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
    settings: {
      'import/parsers': {
        '@typescript-eslint/parser': ['.js', '.jsx', '.ts', '.tsx'],
      },
      'import/resolver': {
        typescript: {},
      },
    },
  },
  eslintConfigPrettier,
]);

export default eslintConfig;
