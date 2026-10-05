// Thin React wrapper around a Monaco editor. Lazy-loaded by CodePanel (Monaco is ~MBs).
//
// One editor instance, one Monaco *model* per `path`. Switching tabs swaps models and
// restores each model's scroll/cursor ("view state"), so a future editable QASM tab (M7)
// keeps its cursor and undo history across tab switches.
//
// We drive Monaco directly instead of using @monaco-editor/react: that package's loader
// ships a jsDelivr CDN URL as its default, and the demo must run fully offline.
import { useEffect, useRef } from 'react'
import type { Problem } from '../../model/types'
import { useThemeStore } from '../../theme/themeStore'
import { readCssToken } from './editorTheme'
import { problemsToMarkers } from './markers'
import { applyEditorTheme, monaco, remeasureWhenFontLoads } from './monacoSetup'

export interface CodeEditorProps {
  /** Text to show. When it differs from the model, the model is updated (as one undo step). */
  value: string
  /** Monaco language id, e.g. 'qasm' or 'python'. */
  language: string
  /** Identifies the model (e.g. 'circuit.qasm'); each path keeps its own text, undo and view state. */
  path: string
  readOnly?: boolean
  /** Called with the full text after a user edit (not after `value` updates from props). */
  onChange?: (value: string) => void
  /** Problems shown as squiggles (owner 'qc'). */
  markers?: Problem[]
  ariaLabel: string
}

const MARKER_OWNER = 'qc'
const NO_MARKERS: Problem[] = []

function modelUri(path: string) {
  return monaco.Uri.parse(`inmemory://qc/${path}`)
}

export default function CodeEditor({
  value,
  language,
  path,
  readOnly = false,
  onChange,
  markers = NO_MARKERS,
  ariaLabel,
}: CodeEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const viewStates = useRef(new Map<string, monaco.editor.ICodeEditorViewState | null>())
  /** True while we write `value` into the model, so that write isn't reported as a user edit. */
  const applyingProp = useRef(false)
  const onChangeRef = useRef(onChange)
  const theme = useThemeStore((s) => s.theme)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  // Create the editor once.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const fontFamily = readCssToken('--font-mono') || 'monospace'
    const editor = monaco.editor.create(host, {
      model: null,
      theme: applyEditorTheme(useThemeStore.getState().theme),
      fontFamily,
      fontSize: 13,
      lineHeight: 20,
      fontLigatures: false,
      minimap: { enabled: false },
      glyphMargin: false,
      folding: false,
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 8,
      padding: { top: 8, bottom: 8 },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      overviewRulerLanes: 0,
      overviewRulerBorder: false,
      hideCursorInOverviewRuler: true,
      renderWhitespace: 'none',
      guides: { indentation: false },
      stickyScroll: { enabled: false },
      bracketPairColorization: { enabled: false },
      scrollbar: { useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      fixedOverflowWidgets: true,
      tabSize: 4,
    })
    editorRef.current = editor
    remeasureWhenFontLoads(fontFamily)

    const sub = editor.onDidChangeModelContent(() => {
      if (!applyingProp.current) onChangeRef.current?.(editor.getValue())
    })
    return () => {
      sub.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [])

  // Read-only state and accessible name.
  useEffect(() => {
    editorRef.current?.updateOptions({
      readOnly,
      domReadOnly: readOnly,
      renderLineHighlight: readOnly ? 'none' : 'line',
      ariaLabel,
    })
  }, [readOnly, ariaLabel])

  // Select (or create) the model for `path`, then bring its text in line with `value`.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const uri = modelUri(path)
    let model = monaco.editor.getModel(uri)
    if (!model) {
      model = monaco.editor.createModel(value, language, uri)
      // Rainbow brackets are a model option in standalone Monaco; keep brackets plain.
      model.updateOptions({
        bracketColorizationOptions: { enabled: false, independentColorPoolPerBracketType: false },
      })
    } else if (model.getLanguageId() !== language) monaco.editor.setModelLanguage(model, language)

    const current = editor.getModel()
    if (current !== model) {
      if (current) viewStates.current.set(current.uri.toString(), editor.saveViewState())
      editor.setModel(model)
      const saved = viewStates.current.get(uri.toString())
      if (saved) editor.restoreViewState(saved)
    }

    if (model.getValue() !== value) {
      applyingProp.current = true
      try {
        // An edit (not setValue) so it is one undoable step and undo history survives.
        model.pushEditOperations(
          [],
          [{ range: model.getFullModelRange(), text: value }],
          () => null,
        )
        model.pushStackElement()
      } finally {
        applyingProp.current = false
      }
    }
  }, [path, language, value])

  // Problems → squiggles on the current model.
  useEffect(() => {
    const model = monaco.editor.getModel(modelUri(path))
    if (!model) return
    const text = {
      lineCount: model.getLineCount(),
      lineMaxColumn: (line: number) => model.getLineMaxColumn(line),
    }
    monaco.editor.setModelMarkers(model, MARKER_OWNER, problemsToMarkers(markers, text))
  }, [markers, path, value])

  // Follow the app theme (tokens are re-read, so Monaco matches the new CSS variables).
  useEffect(() => {
    applyEditorTheme(theme)
  }, [theme])

  return <div ref={hostRef} className="code-editor" />
}
