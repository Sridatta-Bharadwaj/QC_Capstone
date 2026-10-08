/// <reference types="vitest/config" />
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { META_CSP, SECURITY_HEADERS, headersFile } from './build/securityHeaders.ts'

/**
 * Production security headers (see build/securityHeaders.ts). Build only: the dev server needs
 * inline scripts for hot reload, so the policy is not applied there.
 */
function securityHeaders(): Plugin {
  let outDir = 'dist'
  return {
    name: 'qc-security-headers',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    transformIndexHtml: {
      order: 'post',
      handler: () => [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: META_CSP },
          injectTo: 'head-prepend',
        },
      ],
    },
    closeBundle() {
      writeFileSync(resolve(outDir, '_headers'), headersFile())
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), securityHeaders()],
  // Relative asset paths so the production build also works when opened
  // from a sub-path or served locally with `npm run preview`.
  base: './',
  build: {
    // three.js (~950 kB) and Monaco (~3.2 MB) are intentionally split into lazy chunks that
    // load after the workspace is visible, so Vite's default 500 kB warning is just noise here.
    chunkSizeWarningLimit: 4000,
  },
  // `npm run preview` serves the build with the same headers as production.
  preview: {
    headers: SECURITY_HEADERS,
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
