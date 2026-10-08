// "Go to this line" requests for the code editor, e.g. clicking an item in the Problems tab.
// The Problems tab writes a request; the code panel opens that tab, the editor moves the cursor
// there, focuses itself and clears the request.
import { create } from 'zustand'
import { useUiStore } from '../../model/uiStore'
import type { CodeTab, Problem } from '../../model/types'

export interface RevealRequest {
  /** Which code tab the position is in. */
  tab: CodeTab
  /** 1-based position in that tab's text. */
  line: number
  column: number
  /** Increments per request, so clicking the same problem twice reveals it twice. */
  seq: number
}

interface RevealState {
  request: RevealRequest | null
  reveal: (tab: CodeTab, line: number, column: number) => void
  clear: () => void
}

export const useRevealStore = create<RevealState>((set) => ({
  request: null,
  reveal: (tab, line, column) =>
    set((s) => ({ request: { tab, line, column, seq: (s.request?.seq ?? 0) + 1 } })),
  clear: () => set({ request: null }),
}))

/** Opens the problem's code tab (QASM if unknown) and puts the cursor on the problem. */
export function revealProblem(problem: Problem): void {
  const tab = problem.tab ?? 'qasm'
  useUiStore.getState().setCodeTab(tab)
  useRevealStore.getState().reveal(tab, problem.line ?? 1, problem.column ?? 1)
}
