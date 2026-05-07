/* eslint-env node */
import { existsSync } from 'fs';
import { resolve } from 'path';
import { defineConfig } from 'viteburner';

export default defineConfig({
  plugins: [
    {
      name: 'bitburner-src-import-resolver',
      enforce: 'pre',
      resolveId(source) {
        // Support tsconfig-style "baseUrl: src" imports in Vite:
        // - "helpers/do.js"
        // - "/helpers/do.js"
        // - "helpers/art"
        // and resolve .js specifiers to .ts source files when present.
        if (source.startsWith('.') || source.startsWith('@')) return null;
        if (source.startsWith('/@') || source.startsWith('/node_modules/')) return null;

        const normalized = source.startsWith('/') ? source.slice(1) : source;
        const candidates = [
          normalized,
          normalized.replace(/\.js$/, '.ts'),
          `${normalized}.ts`,
          `${normalized}.js`,
          `${normalized}/index.ts`,
          `${normalized}/index.js`,
        ];

        for (const candidate of candidates) {
          const absolutePath = resolve(__dirname, 'src', candidate);
          if (existsSync(absolutePath)) return absolutePath;
        }

        return null;
      },
    },
  ],
  /** basic vite configs */
  resolve: {
    alias: {
      /** path to your source code */
      '@': resolve(__dirname, 'src'),
      '/src': resolve(__dirname, 'src'),
    },
  },
  build: { minify: false },
  /** viteburner configs */
  viteburner: {
    watch: [
      {
        pattern: 'src/**/*.{js,ts}',
        transform: true,
      },
      { pattern: 'src/**/*.{script,txt}' },
    ],
  },
});
