// Monaco themes built from the app's CSS design tokens, so the editor matches the panel
// in both themes. Pure function of a token reader (no Monaco runtime import) → unit-testable.
import type { editor } from 'monaco-editor/editor/editor.api'
import type { Theme } from '../../theme/themeStore'

export const EDITOR_THEME_NAMES: Record<Theme, string> = {
  light: 'qc-light',
  dark: 'qc-dark',
}

/** Reads a CSS custom property, e.g. `--color-bg`. */
export type TokenReader = (name: string) => string

/** Reads tokens from <html> (where data-theme is set). */
export const readCssToken: TokenReader = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim()

/**
 * Normalizes a CSS colour to #rrggbb, which Monaco requires. Needed because the production
 * CSS minifier shortens tokens (#cccccc → #ccc), and Monaco rejects 3-digit colours.
 * Accepts #rgb, #rrggbb and rgb()/rgba() (alpha dropped); anything else is returned unchanged.
 */
export function toHex6(value: string): string {
  const v = value.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v)
  if (short) return '#' + short[1] + short[1] + short[2] + short[2] + short[3] + short[3]
  if (/^#[0-9a-f]{6}$/.test(v)) return v
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(v)
  if (rgb)
    return (
      '#' +
      rgb
        .slice(1, 4)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')
    )
  return v
}

export function buildEditorTheme(
  theme: Theme,
  readToken: TokenReader,
): editor.IStandaloneThemeData {
  const css = (name: string) => toHex6(readToken(name))
  const bg = css('--color-bg-panel')
  const text = css('--color-text')
  const syntax = (token: string, variable: string) => ({
    token,
    // Token rules want "rrggbb" without the leading #.
    foreground: css(variable).slice(1),
  })
  return {
    base: theme === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      syntax('', '--color-text'),
      syntax('comment', '--syntax-comment'),
      syntax('keyword', '--syntax-keyword'),
      syntax('gate', '--syntax-gate'),
      syntax('constant', '--syntax-constant'),
      syntax('number', '--syntax-number'),
      syntax('string', '--syntax-string'),
      syntax('delimiter', '--color-text-muted'),
      syntax('operator', '--color-text-muted'),
    ],
    colors: {
      'editor.background': bg,
      'editor.foreground': text,
      'editorGutter.background': bg,
      'editorLineNumber.foreground': css('--color-text-subtle'),
      'editorLineNumber.activeForeground': text,
      'editorCursor.foreground': css('--color-accent'),
      'editor.selectionBackground': css('--color-bg-selected'),
      'editor.inactiveSelectionBackground': css('--color-bg-hover'),
      'editor.selectionHighlightBackground': css('--color-bg-hover'),
      'editor.wordHighlightBackground': css('--color-bg-hover'),
      'editor.lineHighlightBackground': bg,
      'editor.lineHighlightBorder': css('--color-border'),
      'editorWidget.background': css('--color-bg-input'),
      'editorWidget.border': css('--color-border-strong'),
      'editorHoverWidget.background': css('--color-bg-input'),
      'editorHoverWidget.border': css('--color-border-strong'),
      'editorError.foreground': css('--color-error'),
      'editorWarning.foreground': css('--color-warning'),
      'input.background': css('--color-bg'),
      'input.border': css('--color-border-strong'),
      focusBorder: css('--color-focus'),
      'scrollbar.shadow': bg,
      'scrollbarSlider.background': css('--color-bg-skeleton'),
      'scrollbarSlider.hoverBackground': css('--color-border-strong'),
      'scrollbarSlider.activeBackground': css('--color-border-strong'),
    },
  }
}
