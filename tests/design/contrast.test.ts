// WCAG contrast check of the design tokens, in both themes (PLAN.md → Theming: "Both themes
// must pass contrast checks (WCAG AA for text)").
//   - Text: >= 4.5:1 (AA for normal-size text; most of the UI is 11–13 px).
//   - Non-text UI that identifies a control or carries meaning (focus ring, input borders,
//     gate outlines, wires, Bloch axes and vector): >= 3:1 (WCAG 1.4.11).
// Decorative lines (panel separators, table rules, sphere wireframe) are exempt.
import { describe, expect, it } from 'vitest'
import { contrast, readAllTokens, type Theme } from './tokens'

const tokens = readAllTokens()
const THEMES: Theme[] = ['light', 'dark']

/** Surfaces that hold UI text. */
const SURFACES = [
  '--color-bg',
  '--color-bg-sidebar',
  '--color-bg-panel',
  '--color-bg-titlebar',
  '--color-bg-statusbar',
  '--color-bg-input',
  '--color-bg-hover',
]

/** [foreground, backgrounds, minimum ratio] */
type Rule = [fg: string, bgs: string[], min: number]

const RULES: Rule[] = [
  // UI text on every surface (hover included: list rows keep their text colours on hover).
  ...[
    '--color-text',
    '--color-text-muted',
    '--color-text-subtle',
    '--color-accent', // links such as "Reduced ρ", the accent used as text
    '--color-error',
    '--color-warning',
    '--color-ok',
  ].map((fg): Rule => [fg, SURFACES, 4.5]),

  // Selected rows (wire label of the selected qubit, selected list items).
  ['--color-text', ['--color-bg-selected'], 4.5],
  ['--color-text-muted', ['--color-bg-selected'], 4.5],

  // Pressed segment of the qubit selector.
  ['--color-text-on-accent', ['--color-accent'], 4.5],

  // Gate labels inside gate boxes.
  ['--color-gate-text', ['--color-gate-bg'], 4.5],

  // Bloch axis colours are also used as text (sphere labels on cards, r = (x, y, z) in the
  // Density Matrices tab).
  ...['--axis-x', '--axis-y', '--axis-z'].map((fg): Rule => [
    fg,
    ['--color-bg', '--color-bg-panel'],
    4.5,
  ]),

  // Code editor syntax colours on the editor background.
  ...[
    '--syntax-comment',
    '--syntax-keyword',
    '--syntax-gate',
    '--syntax-constant',
    '--syntax-number',
    '--syntax-string',
  ].map((fg): Rule => [fg, ['--color-bg-panel'], 4.5]),

  // Non-text UI (3:1).
  ['--color-focus', SURFACES, 3],
  ['--color-border-input', ['--color-bg-panel', '--color-bg', '--color-bg-input'], 3],
  ['--color-gate-border', ['--color-bg', '--color-gate-bg'], 3],
  ['--color-gate-control', ['--color-bg'], 3],
  ['--color-wire', ['--color-bg'], 3],
  ['--color-bloch-vector', ['--color-bg'], 3],
]

describe.each(THEMES)('%s theme contrast', (theme) => {
  const t = tokens[theme]

  it('defines every token the rules refer to', () => {
    const names = new Set(RULES.flatMap(([fg, bgs]) => [fg, ...bgs]))
    const missing = [...names].filter((name) => !t[name])
    expect(missing).toEqual([])
  })

  const cases = RULES.flatMap(([fg, bgs, min]) => bgs.map((bg) => ({ fg, bg, min })))
  it.each(cases)('$fg on $bg ≥ $min:1', ({ fg, bg, min }) => {
    const ratio = contrast(t[fg], t[bg])
    expect(
      ratio,
      `${fg} ${t[fg]} on ${bg} ${t[bg]} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(min)
  })
})

describe('contrast helper', () => {
  it('matches known WCAG values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
    expect(contrast('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })
})
