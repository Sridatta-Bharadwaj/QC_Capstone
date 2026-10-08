// Global undo/redo shortcuts for the circuit: Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z (⌘ on macOS).
//
// They are ignored while focus is in Monaco (it keeps its own text undo) or in a form
// field (e.g. the angle input keeps the browser's native undo).
import { redoCircuit, undoCircuit } from './history'

/** Elements whose own undo must win over the circuit undo. */
const OWN_UNDO_SELECTOR =
  '.monaco-editor, input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/** Which history action a key event asks for, or null. Exported for tests. */
export function historyActionFor(e: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || e.isComposing) return null
  const key = e.key.toLowerCase()
  if (key === 'z') return e.shiftKey ? 'redo' : 'undo'
  if (key === 'y' && !e.shiftKey) return 'redo'
  return null
}

function isInOwnUndoArea(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(OWN_UNDO_SELECTOR) !== null
}

/** Window keydown handler. Returns true if it handled the event. */
export function handleHistoryKeydown(e: KeyboardEvent): boolean {
  const action = historyActionFor(e)
  if (action === null || e.defaultPrevented) return false
  if (isInOwnUndoArea(e.target) || isInOwnUndoArea(document.activeElement)) return false
  e.preventDefault()
  if (action === 'undo') undoCircuit()
  else redoCircuit()
  return true
}

/** Installs the shortcuts on `window`. Returns a function that removes them. */
export function installHistoryShortcuts(): () => void {
  const listener = (e: KeyboardEvent) => {
    handleHistoryKeydown(e)
  }
  window.addEventListener('keydown', listener)
  return () => window.removeEventListener('keydown', listener)
}
