// One-time Monaco setup. Imported only by the lazy-loaded CodeEditor, so all of Monaco
// lands in its own chunk.
//
// Offline: Monaco comes from the local `monaco-editor` package and its web worker is bundled
// by Vite (`?worker`). Nothing is fetched from a CDN at runtime. We use the lean
// `editor.api` entry plus only the editor features and languages we need, instead of the
// full `monaco-editor` entry (every language + LSP client, several MB larger).
import * as monaco from 'monaco-editor/editor/editor.api'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

// Editor features (each registers itself on import).
import 'monaco-editor/features/bracketMatching/register'
import 'monaco-editor/features/clipboard/register'
import 'monaco-editor/features/comment/register'
import 'monaco-editor/features/contextmenu/register'
import 'monaco-editor/features/cursorUndo/register'
import 'monaco-editor/features/find/register'
import 'monaco-editor/features/gotoError/register'
import 'monaco-editor/features/hover/register'
import 'monaco-editor/features/linesOperations/register'
import 'monaco-editor/features/multicursor/register'
import 'monaco-editor/features/wordHighlighter/register'
import 'monaco-editor/features/wordOperations/register'

// Python (for the Qiskit tab) is a built-in Monarch grammar.
import 'monaco-editor/languages/definitions/python/register'

import type { Theme } from '../../theme/themeStore'
import { buildEditorTheme, EDITOR_THEME_NAMES, readCssToken } from './editorTheme'
import { QASM_LANGUAGE_ID, qasmLanguageConfig, qasmMonarch } from './qasmLanguage'

// Monaco runs tokenization helpers in a web worker; hand it the locally bundled one.
self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

monaco.languages.register({ id: QASM_LANGUAGE_ID, extensions: ['.qasm'], aliases: ['OpenQASM'] })
monaco.languages.setMonarchTokensProvider(QASM_LANGUAGE_ID, qasmMonarch)
monaco.languages.setLanguageConfiguration(QASM_LANGUAGE_ID, qasmLanguageConfig)

/**
 * (Re)defines the qc-light / qc-dark themes from the current CSS tokens and activates one.
 * Call after <html data-theme> has changed so getComputedStyle returns the new values.
 */
export function applyEditorTheme(theme: Theme): string {
  const name = EDITOR_THEME_NAMES[theme]
  monaco.editor.defineTheme(name, buildEditorTheme(theme, readCssToken))
  monaco.editor.setTheme(name)
  return name
}

/** Monaco measures glyph widths once; re-measure after the bundled mono font has loaded. */
export function remeasureWhenFontLoads(fontFamily: string): void {
  if (typeof document === 'undefined' || !document.fonts) return
  document.fonts
    .load(`13px ${fontFamily}`)
    .then(() => monaco.editor.remeasureFonts())
    .catch(() => {
      // Font failed to load; Monaco keeps the fallback font metrics. Nothing else to do.
    })
}

export { monaco }
