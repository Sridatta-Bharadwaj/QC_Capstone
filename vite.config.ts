/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the production build also works when opened
  // from a sub-path or served locally with `npm run preview`.
  base: './',
  build: {
    // three.js (~950 kB) and Monaco (~3.2 MB) are intentionally split into lazy chunks that
    // load after the workspace is visible, so Vite's default 500 kB warning is just noise here.
    chunkSizeWarningLimit: 4000,
  },
  worker: {
    format: 'es',
  },
  test: {
    // Engine/codegen/parser tests run in plain Node. Component tests opt in
    // to a DOM with a `// @vitest-environment jsdom` comment at the top.
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/setup.ts'],
  },
})
