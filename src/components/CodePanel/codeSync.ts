// Two-way sync between the code tabs (QASM and Qiskit) and the circuit model
// (PLAN.md → Sync rules and V2-1). Both tabs follow the same rules:
//
//  - Edit in a tab → its text is stored as typed → after 300 ms of no typing it is parsed.
//      valid   → circuit store updated with that tab as the source ('qasm' / 'qiskit'), so the
//                canvas, the math and the OTHER tab follow; this tab's text is NOT regenerated,
//                so the cursor and comments stay put.
//      invalid → circuit store untouched (last valid circuit stays), problems are shown.
//    Each committed parse calls setCircuit exactly once (and not at all when the circuit is
//    unchanged): undo/redo history relies on this, one entry per committed parse.
//  - Any other change (canvas, preset, the other tab, file, URL, undo…) → the tab's text is
//    regenerated from the model (normalised formatting, comments lost), any pending parse in
//    the tab is dropped and its problems are cleared. If the text being replaced had errors,
//    `replacedBy` records what replaced it so the UI can say so: the typed text is not lost,
//    Ctrl+Z in that editor brings it back. The next edit in the tab clears the notice.
//
// Lives outside React so the sync keeps working whichever tab is open or mounted.
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { toQasm, toQiskit } from '../../codegen'
import { circuitsEqual } from '../../model/circuit'
import { useCircuitStore, useProblemsStore } from '../../model/store'
import type { ChangeSource, Circuit, CodeTab, Problem } from '../../model/types'
import { parseQasm, type ParseOptions, type ParseResult } from '../../parser/qasm'
import { parseQiskit } from '../../parser/qiskit'

/** Wait this long after the last keystroke before parsing. */
export const PARSE_DEBOUNCE_MS = 300

export const CODE_TABS: readonly CodeTab[] = ['qasm', 'qiskit']

/** Display name of each tab (Problems tab, notices, status bar). */
export const CODE_TAB_LABELS: Record<CodeTab, string> = { qasm: 'QASM', qiskit: 'Qiskit' }

/** How each tab turns the model into text, and text back into a model. */
const GENERATE: Record<CodeTab, (circuit: Circuit) => string> = { qasm: toQasm, qiskit: toQiskit }
const PARSE: Record<CodeTab, (text: string, options?: ParseOptions) => ParseResult> = {
  qasm: parseQasm,
  qiskit: parseQiskit,
}

export interface CodeTextState {
  /** The tab's text: what the user typed, or what was generated from the model. */
  text: string
  /**
   * Set when a change from elsewhere overwrote this tab's text while it had errors (or was
   * still waiting to be parsed and would have failed): what made that change. Null otherwise.
   */
  replacedBy: ChangeSource | null
}

function createTextStore(tab: CodeTab): UseBoundStore<StoreApi<CodeTextState>> {
  return create<CodeTextState>(() => ({
    text: GENERATE[tab](useCircuitStore.getState().circuit),
    replacedBy: null,
  }))
}

/** One text store per tab. */
export const codeTextStores: Record<CodeTab, UseBoundStore<StoreApi<CodeTextState>>> = {
  qasm: createTextStore('qasm'),
  qiskit: createTextStore('qiskit'),
}

/** What replaced the code, as it reads in the notice. */
function cause(source: ChangeSource): string {
  switch (source) {
    case 'canvas':
      return 'a canvas edit'
    case 'qasm':
      return 'an edit in the QASM tab'
    case 'qiskit':
      return 'an edit in the Qiskit tab'
    case 'preset':
      return 'loading a preset'
    case 'file':
      return 'opening a file'
    case 'url':
      return 'opening a link'
    case 'history':
      return 'undo/redo'
    case 'restore':
      return 'restoring the saved circuit'
  }
}

/** The notice text, e.g. "QASM code with errors was replaced by a canvas edit. …" */
export function replacedMessage(tab: CodeTab, source: ChangeSource): string {
  const label = CODE_TAB_LABELS[tab]
  return (
    `${label} code with errors was replaced by ${cause(source)}. ` +
    `Press Ctrl+Z in the ${label} editor to get it back.`
  )
}

/** Hides a tab's "code was replaced" notice (e.g. its close button). */
export function dismissReplacedNotice(tab: CodeTab): void {
  codeTextStores[tab].setState({ replacedBy: null })
}

const pending: Record<CodeTab, ReturnType<typeof setTimeout> | undefined> = {
  qasm: undefined,
  qiskit: undefined,
}

function cancelPendingParse(tab: CodeTab) {
  clearTimeout(pending[tab])
  pending[tab] = undefined
}

/** True while an edit in `tab` (or in any tab, if omitted) is waiting for its debounced parse. */
export function hasPendingParse(tab?: CodeTab): boolean {
  return tab ? pending[tab] !== undefined : CODE_TABS.some((t) => pending[t] !== undefined)
}

/** Parses a tab's text now and applies it to the stores (see the rules at the top). */
export function applyCode(tab: CodeTab, text: string): void {
  const current = useCircuitStore.getState().circuit
  const { circuit, problems } = PARSE[tab](text, { previous: current })
  useProblemsStore.getState().setProblems(tab, problems)
  // Skip no-op updates (e.g. only whitespace or a comment changed): no recompute, no history.
  if (circuit && !circuitsEqual(circuit, current)) {
    useCircuitStore.getState().setCircuit(circuit, tab)
  }
}

/** Called by the editor on every user edit of a tab's text. */
export function editCode(tab: CodeTab, text: string): void {
  codeTextStores[tab].setState({ text, replacedBy: null })
  cancelPendingParse(tab)
  pending[tab] = setTimeout(() => {
    pending[tab] = undefined
    applyCode(tab, text)
  }, PARSE_DEBOUNCE_MS)
}

const hasError = (problems: Problem[]) => problems.some((p) => p.severity === 'error')

/** Model → text for one tab, after a change that did not come from that tab. */
function regenerate(tab: CodeTab, circuit: Circuit, source: ChangeSource) {
  const store = codeTextStores[tab]
  // Is text with errors about to be overwritten? Either its errors are already shown, or it
  // was typed less than PARSE_DEBOUNCE_MS ago and would fail to parse.
  const discarded =
    hasError(useProblemsStore.getState().byTab[tab]) ||
    (hasPendingParse(tab) && hasError(PARSE[tab](store.getState().text).problems))
  cancelPendingParse(tab)
  const text = GENERATE[tab](circuit)
  const changed = text !== store.getState().text
  store.setState({ text, replacedBy: discarded && changed ? source : null })
  if (useProblemsStore.getState().byTab[tab].length > 0)
    useProblemsStore.getState().setProblems(tab, [])
}

// Each tab regenerates for every change except its own edits.
useCircuitStore.subscribe((state, prev) => {
  if (state.revision === prev.revision) return
  for (const tab of CODE_TABS) {
    if (state.lastSource !== tab) regenerate(tab, state.circuit, state.lastSource)
  }
})
