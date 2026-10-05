// Helpers for the design tests: read the colour tokens of both themes from the CSS files and
// compute WCAG 2.x contrast ratios. Node-only (reads files from disk).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Theme = 'light' | 'dark'
export type TokenMap = Record<string, string>

/** Absolute path of the repository root. */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

export function readRepoFile(path: string): string {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8')
}

/** Custom properties declared inside the first block whose selector matches `selector`. */
function declarations(css: string, selector: RegExp): TokenMap {
  const out: TokenMap = {}
  const block = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, 'm').exec(css)
  if (!block) return out
  for (const m of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

/**
 * Tokens per theme from a CSS file that declares light values on `:root` and dark
 * overrides on `:root[data-theme='dark']` (dark inherits everything it does not override).
 */
export function readThemeTokens(path: string): Record<Theme, TokenMap> {
  const css = readRepoFile(path).replace(/\/\*[\s\S]*?\*\//g, '')
  const light = declarations(css, /:root(?!\[)/)
  const dark = { ...light, ...declarations(css, /:root\[data-theme='dark'\]/) }
  return { light, dark }
}

/** App tokens merged with the syntax colours of the code panel. */
export function readAllTokens(): Record<Theme, TokenMap> {
  const app = readThemeTokens('src/styles/tokens.css')
  const syntax = readThemeTokens('src/components/CodePanel/CodePanel.css')
  return {
    light: { ...app.light, ...syntax.light },
    dark: { ...app.dark, ...syntax.dark },
  }
}

/** #rgb or #rrggbb → [r, g, b] in 0…255. */
export function parseHex(hex: string): [number, number, number] {
  const h = hex.trim().replace('#', '')
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`Not a hex colour: ${hex}`)
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number]
}

/** WCAG relative luminance of an sRGB colour. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio (1…21) between two colours. */
export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}
