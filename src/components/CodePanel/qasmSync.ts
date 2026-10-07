// Two-way sync between the QASM editor text and the circuit model (PLAN.md → Sync rules).
//
//  - Editor edit → text is stored as typed → after 300 ms of no typing it is parsed.
//      valid   → circuit store updated with source 'editor' (canvas + math follow);
//                the editor text is NOT regenerated, so the cursor and comments stay put.
//      invalid → circuit store untouched (last valid circuit stays), problems are shown.
//  - Canvas / preset change → the text is regenerated from the model with toQasm
//    (normalised formatting, comments lost: accepted in v1), any pending parse is dropped
//    and old problems are cleared. If the text being replaced had errors, `replacedByCanvas`
//    is set so the UI can say what happened: the typed text is not lost, Ctrl+Z in the
//    editor brings it back. The next editor edit clears the flag.
//
// Lives outside React so the sync keeps working whichever tab is open or mounted.
import { create } from 'zustand'
import { toQasm } from '../../codegen'
import { useCircuitStore, useProblemsStore } from '../../model/store'
import type { Problem } from '../../model/types'
import { circuitsEqual, parseQasm } from '../../parser/qasm'

/** Wait this long after the last keystroke before parsing. */
export const PARSE_DEBOUNCE_MS = 300

interface QasmTextState {
  /** The QASM tab's text: what the user typed, or what was generated from the model. */
  text: string
  /** True when a canvas/preset change overwrote editor text that had errors or was unparsed. */
  replacedByCanvas: boolean
}

export const useQasmText = create<QasmTextState>(() => ({
  text: toQasm(useCircuitStore.getState().circuit),
  replacedByCanvas: false,
}))

/** Hides the "code was replaced" notice (e.g. its close button). */
export function dismissReplacedNotice(): void {
  useQasmText.setState({ replacedByCanvas: false })
}

let pending: ReturnType<typeof setTimeout> | undefined

function cancelPendingParse() {
  clearTimeout(pending)
  pending = undefined
}

/** Parses `text` now and applies it to the stores (see the rules at the top of this file). */
export function applyQasm(text: string): void {
  const current = useCircuitStore.getState().circuit
  const { circuit, problems } = parseQasm(text, { previous: current })
  useProblemsStore.getState().setProblems(problems)
  // Skip no-op updates (e.g. only whitespace or a comment changed) to avoid needless recomputes.
  if (circuit && !circuitsEqual(circuit, current)) {
    useCircuitStore.getState().setCircuit(circuit, 'editor')
  }
}

/** Called by the editor on every user edit of the QASM text. */
export function editQasm(text: string): void {
  useQasmText.setState({ text, replacedByCanvas: false })
  cancelPendingParse()
  pending = setTimeout(() => {
    pending = undefined
    applyQasm(text)
  }, PARSE_DEBOUNCE_MS)
}

/** True while an edit is waiting for its debounced parse. */
export function hasPendingParse(): boolean {
  return pending !== undefined
}

// Model → text, for every change that did not come from the editor itself.
useCircuitStore.subscribe((state, prev) => {
  if (state.revision === prev.revision || state.lastSource === 'editor') return
  // Is text with errors about to be overwritten? Either its errors are already shown, or it
  // was typed less than PARSE_DEBOUNCE_MS ago and would fail to parse.
  const hasError = (problems: Problem[]) => problems.some((p) => p.severity === 'error')
  const discarded =
    hasError(useProblemsStore.getState().problems) ||
    (hasPendingParse() && hasError(parseQasm(useQasmText.getState().text).problems))
  cancelPendingParse()
  const text = toQasm(state.circuit)
  const changed = text !== useQasmText.getState().text
  useQasmText.setState({ text, replacedByCanvas: discarded && changed })
  if (useProblemsStore.getState().problems.length > 0) useProblemsStore.getState().setProblems([])
})
