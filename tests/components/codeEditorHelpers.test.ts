import { describe, expect, it } from 'vitest'
import { buildEditorTheme, toHex6 } from '../../src/components/CodePanel/editorTheme'
import { problemsToMarkers } from '../../src/components/CodePanel/markers'
import { QASM_GATES, QASM_KEYWORDS } from '../../src/components/CodePanel/qasmLanguage'
import { QASM_GATE_NAMES } from '../../src/codegen'

describe('qasm language', () => {
  it('highlights every gate the generator writes', () => {
    for (const name of Object.values(QASM_GATE_NAMES)) expect(QASM_GATES).toContain(name)
  })

  it('has no name that is both a keyword and a gate', () => {
    expect(QASM_GATES.filter((g) => QASM_KEYWORDS.includes(g))).toEqual([])
  })
})

describe('buildEditorTheme', () => {
  const tokens: Record<string, string> = {
    '--color-bg-panel': '#181818',
    '--color-text': '#cccccc',
    '--syntax-keyword': '#569cd6',
  }
  const read = (name: string) => tokens[name] ?? '#123456'

  it('takes editor colours and syntax colours from CSS tokens', () => {
    const theme = buildEditorTheme('dark', read)
    expect(theme.base).toBe('vs-dark')
    expect(theme.colors['editor.background']).toBe('#181818')
    expect(theme.colors['editor.foreground']).toBe('#cccccc')
    expect(theme.rules).toContainEqual({ token: 'keyword', foreground: '569cd6' })
  })

  it('uses the light base for the light theme', () => {
    expect(buildEditorTheme('light', read).base).toBe('vs')
  })

  it('expands minified 3-digit colours (Monaco rejects them)', () => {
    const theme = buildEditorTheme('dark', (name) => (name === '--color-text' ? '#ccc' : '#123'))
    expect(theme.colors['editor.foreground']).toBe('#cccccc')
    expect(theme.rules).toContainEqual({ token: '', foreground: 'cccccc' })
  })
})

describe('toHex6', () => {
  it.each([
    ['#ccc', '#cccccc'],
    ['#0F766E', '#0f766e'],
    [' #abcdef ', '#abcdef'],
    ['rgb(15, 118, 110)', '#0f766e'],
    ['rgba(0 0 255 / 0.5)', '#0000ff'],
  ])('%s → %s', (input, expected) => {
    expect(toHex6(input)).toBe(expected)
  })
})

describe('problemsToMarkers', () => {
  // Three lines: "abc", "", "hello" → max columns 4, 1, 6.
  const text = { lineCount: 3, lineMaxColumn: (line: number) => [4, 1, 6][line - 1] }

  it('maps an exact range and severity', () => {
    const [m] = problemsToMarkers(
      [{ message: 'bad', severity: 'error', line: 3, column: 2, endLine: 3, endColumn: 4 }],
      text,
    )
    expect(m).toEqual({
      severity: 8,
      message: 'bad',
      startLineNumber: 3,
      startColumn: 2,
      endLineNumber: 3,
      endColumn: 4,
    })
  })

  it('underlines the rest of the line when no end is given', () => {
    const [m] = problemsToMarkers([{ message: 'w', severity: 'warning', line: 1, column: 2 }], text)
    expect(m).toMatchObject({ severity: 4, startLineNumber: 1, startColumn: 2, endColumn: 4 })
  })

  it('defaults to line 1 and clamps out-of-range positions', () => {
    const [a, b] = problemsToMarkers(
      [
        { message: 'no position', severity: 'error' },
        { message: 'too far', severity: 'error', line: 99, column: 50 },
      ],
      text,
    )
    expect(a).toMatchObject({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 4 })
    expect(b).toMatchObject({ startLineNumber: 3, startColumn: 6, endLineNumber: 3, endColumn: 6 })
  })
})
