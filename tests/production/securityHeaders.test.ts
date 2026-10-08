// Deployment security: the Content-Security-Policy and headers in build/securityHeaders.ts.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CSP_DIRECTIVES,
  HEADER_CSP,
  META_CSP,
  SECURITY_HEADERS,
  headersFile,
} from '../../build/securityHeaders'

const root = resolve(__dirname, '../..')

describe('Content-Security-Policy', () => {
  it('allows scripts only from the site itself: no inline, no eval', () => {
    expect(CSP_DIRECTIVES['script-src']).toBe("'self'")
    expect(HEADER_CSP).not.toContain('unsafe-eval')
    expect(HEADER_CSP).not.toMatch(/script-src[^;]*unsafe-inline/)
  })

  it('makes no network connections beyond the site', () => {
    expect(CSP_DIRECTIVES['connect-src']).toBe("'self'")
    expect(CSP_DIRECTIVES['default-src']).toBe("'self'")
    expect(HEADER_CSP).not.toMatch(/https?:/)
  })

  it('blocks plugins, base-tag hijacking, forms and framing', () => {
    expect(CSP_DIRECTIVES['object-src']).toBe("'none'")
    expect(CSP_DIRECTIVES['base-uri']).toBe("'self'")
    expect(CSP_DIRECTIVES['form-action']).toBe("'none'")
    expect(HEADER_CSP).toContain("frame-ancestors 'none'")
    expect(SECURITY_HEADERS['X-Frame-Options']).toBe('DENY')
  })

  it('leaves header-only directives out of the <meta> policy (browsers ignore them there)', () => {
    expect(META_CSP).not.toContain('frame-ancestors')
  })
})

describe('index.html', () => {
  const html = readFileSync(resolve(root, 'index.html'), 'utf8')

  it('has no inline scripts (the CSP forbids them)', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    expect(scripts.length).toBeGreaterThan(0)
    for (const [, attrs, body] of scripts) {
      expect(attrs).toMatch(/\bsrc=/)
      expect(body.trim()).toBe('')
    }
  })

  it('loads the pre-paint theme script from public/', () => {
    expect(html).toContain('<script src="./theme-init.js"></script>')
    const script = readFileSync(resolve(root, 'public/theme-init.js'), 'utf8')
    expect(script).toContain("localStorage.getItem('qc-theme')")
  })
})

describe('_headers file (Netlify / Cloudflare Pages)', () => {
  const file = headersFile()

  it('applies every security header to all paths', () => {
    const all = file.split('\n\n')[0]
    expect(all.startsWith('/*\n')).toBe(true)
    for (const name of Object.keys(SECURITY_HEADERS)) expect(all).toContain(`  ${name}: `)
  })

  it('caches hashed assets forever and always revalidates the page', () => {
    expect(file).toContain('/assets/*\n  Cache-Control: public, max-age=31536000, immutable')
    expect(file).toContain('/index.html\n  Cache-Control: no-cache')
    expect(file).toContain('/theme-init.js\n  Cache-Control: no-cache')
  })
})
