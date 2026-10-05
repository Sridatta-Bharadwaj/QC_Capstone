// Problem (parse error / warning) → Monaco marker (the red/yellow squiggle). Used by M7.
// Pure function, no Monaco runtime import.
import type { editor, MarkerSeverity } from 'monaco-editor/editor/editor.api'
import type { Problem } from '../../model/types'

// Numeric values of monaco.MarkerSeverity (an enum we can't import here without loading Monaco).
const SEVERITY: Record<Problem['severity'], MarkerSeverity> = {
  error: 8 as MarkerSeverity, // MarkerSeverity.Error
  warning: 4 as MarkerSeverity, // MarkerSeverity.Warning
}

/** What we need to know about the text to clamp positions. */
export interface TextShape {
  lineCount: number
  /** 1-based column just past the last character of `line`. */
  lineMaxColumn: (line: number) => number
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Converts problems to markers. Missing positions default to line 1; a problem without an
 * end position underlines the rest of its line. Positions are clamped to the text.
 */
export function problemsToMarkers(problems: Problem[], text: TextShape): editor.IMarkerData[] {
  return problems.map((p) => {
    const startLine = clamp(p.line ?? 1, 1, text.lineCount)
    const startColumn = clamp(p.column ?? 1, 1, text.lineMaxColumn(startLine))
    const endLine = clamp(p.endLine ?? startLine, startLine, text.lineCount)
    const endMax = text.lineMaxColumn(endLine)
    let endColumn = clamp(p.endColumn ?? endMax, 1, endMax)
    if (endLine === startLine && endColumn <= startColumn)
      endColumn = Math.min(startColumn + 1, endMax)
    return {
      severity: SEVERITY[p.severity],
      message: p.message,
      startLineNumber: startLine,
      startColumn,
      endLineNumber: endLine,
      endColumn,
    }
  })
}
