// Static checks of PLAN.md → Design guidelines over the source:
//   - no gradients (the skeleton shimmer is the one allowed exception), no blur/glass, no drop
//     shadows (only 1px inset lines used as selection indicators), no radius above 4px
//   - no hard-coded colours outside the token files
//   - no purple/violet tokens, no emoji in the UI source
//   - the initial-load skeleton in index.html uses the same colours as the tokens
//   - the codicons the app uses have the same code points in Monaco's bundled codicon font
//     (both register the font family "codicon"; whichever loads last serves every icon)
import { readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { REPO_ROOT, parseHex, readAllTokens, readRepoFile } from './tokens'

/** Repo-relative paths (forward slashes) of files under `dir` ending in one of `exts`. */
function listFiles(dir: string, exts: string[]): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (exts.some((e) => p.endsWith(e)))
        out.push(relative(REPO_ROOT, p).split(sep).join('/'))
    }
  }
  walk(join(REPO_ROOT, dir))
  return out.sort()
}

const cssFiles = listFiles('src', ['.css'])
const uiFiles = listFiles('src', ['.tsx', '.ts', '.css'])
const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Files allowed to define literal colours. */
const COLOUR_FILES = ['src/styles/tokens.css', 'src/components/CodePanel/CodePanel.css']

describe('design rules (CSS)', () => {
  it('found the stylesheets', () => {
    expect(cssFiles.length).toBeGreaterThan(5)
  })

  it.each(cssFiles)('%s: no gradients, blur, drop shadows or large radii', (path) => {
    const css = stripComments(readRepoFile(path))
    // The skeleton shimmer is the one allowed gradient (a loading indicator, not a surface).
    if (path !== 'src/components/common/Skeleton.css') expect(css).not.toMatch(/gradient\(/)
    expect(css).not.toMatch(/blur\(|backdrop-filter/)
    // box-shadow only as a thin inset line (selection / active-tab indicator).
    for (const m of css.matchAll(/box-shadow:\s*([^;]+);/g)) {
      expect(m[1]).toMatch(/^inset\b/)
      expect(m[1]).not.toMatch(/\b([3-9]|\d{2,})px\b/)
    }
    for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) {
      const value = m[1].trim()
      const ok =
        /^var\(--radius(-sm)?\)$/.test(value) ||
        value === '0' ||
        value === '50%' || // circles (the sphere skeleton)
        value === '0 0 var(--radius) var(--radius)' ||
        (/^\d+px$/.test(value) && parseInt(value) <= 4)
      expect(ok, `border-radius: ${value}`).toBe(true)
    }
  })

  it('has no hard-coded colours outside the token files', () => {
    const offenders = cssFiles
      .filter((p) => !COLOUR_FILES.includes(p))
      .flatMap((p) =>
        [...stripComments(readRepoFile(p)).matchAll(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/gi)].map(
          (m) => `${p}: ${m[0]}`,
        ),
      )
    expect(offenders).toEqual([])
  })

  it('radius tokens stay at or below 4px', () => {
    const t = readAllTokens().light
    expect(parseInt(t['--radius-sm'])).toBeLessThanOrEqual(4)
    expect(parseInt(t['--radius'])).toBeLessThanOrEqual(4)
  })
})

describe('design rules (colours and copy)', () => {
  it('no token is purple or violet', () => {
    const purple: string[] = []
    for (const [theme, map] of Object.entries(readAllTokens())) {
      for (const [name, value] of Object.entries(map)) {
        if (!value.startsWith('#')) continue
        const [r, g, b] = parseHex(value).map((v) => v / 255)
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        if (max - min < 0.15) continue // grey
        let hue: number
        if (max === r) hue = 60 * (((g - b) / (max - min)) % 6)
        else if (max === g) hue = 60 * ((b - r) / (max - min) + 2)
        else hue = 60 * ((r - g) / (max - min) + 4)
        if (hue < 0) hue += 360
        if (hue >= 255 && hue <= 320) purple.push(`${theme} ${name} ${value}`)
      }
    }
    expect(purple).toEqual([])
  })

  it('no emoji in the UI source', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u
    const offenders = uiFiles.filter((p) => emoji.test(readRepoFile(p)))
    expect(offenders).toEqual([])
  })
})

describe('initial-load skeleton (index.html)', () => {
  const html = readRepoFile('index.html')
  const tokens = readAllTokens()

  /** Boot-skeleton variable → the app token it mirrors. */
  const MIRROR: Record<string, string> = {
    '--b-bg': '--color-bg',
    '--b-sidebar': '--color-bg-sidebar',
    '--b-panel': '--color-bg-panel',
    '--b-titlebar': '--color-bg-titlebar',
    '--b-statusbar': '--color-bg-statusbar',
    '--b-border': '--color-border',
    '--b-skel': '--color-bg-skeleton',
    '--b-shine': '--color-bg-skeleton-shine',
  }

  function bootBlock(selector: RegExp): Record<string, string> {
    const m = new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`).exec(html)
    expect(m, `block ${selector}`).not.toBeNull()
    const out: Record<string, string> = {}
    for (const d of m![1].matchAll(/(--b-[\w-]+)\s*:\s*([^;]+);/g)) out[d[1]] = d[2].trim()
    return out
  }

  it.each([
    ['light', /\n\s*\.boot/],
    ['dark', /html\[data-theme='dark'\] \.boot/],
  ] as const)('%s colours mirror the tokens', (theme, selector) => {
    const block = bootBlock(selector)
    for (const [bootVar, token] of Object.entries(MIRROR)) {
      expect(block[bootVar]?.toLowerCase(), `${theme} ${bootVar}`).toBe(
        tokens[theme][token].toLowerCase(),
      )
    }
  })

  it('lives inside #root (React replaces it on mount) and respects reduced motion', () => {
    expect(html).toMatch(/<div id="root">\s*<div class="boot"/)
    expect(html).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none/)
  })
})

describe('codicons', () => {
  const appCss = readRepoFile('node_modules/@vscode/codicons/dist/codicon.css')
  const monacoLib = readRepoFile('node_modules/monaco-editor/esm/vs/base/common/codiconsLibrary.js')
  const used = new Set<string>()
  for (const p of uiFiles) {
    for (const m of readRepoFile(p).matchAll(/codicon-([a-z0-9-]+)/g)) used.add(m[1])
  }
  // Built from template strings in ProblemsPanel / CodePanel / TraceStepsPanel.
  for (const name of ['error', 'warning', 'copy', 'check', 'pass']) used.add(name)

  it.each([...used].sort())('codicon-%s has the same code point in Monaco', (name) => {
    const app = new RegExp(`\\.codicon-${name}:before \\{ content: "\\\\([0-9a-f]+)"`).exec(appCss)
    const monaco = new RegExp(`'${name}', 0x([0-9a-f]+)`).exec(monacoLib)
    expect(app, `app codicon ${name}`).not.toBeNull()
    expect(monaco, `monaco codicon ${name}`).not.toBeNull()
    expect(monaco![1]).toBe(app![1])
  })
})
