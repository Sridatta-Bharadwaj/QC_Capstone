// "Go to this line" requests for the code editor, e.g. clicking an item in the Problems tab.
// The Problems tab writes a request; the QASM editor moves the cursor there, focuses itself
// and clears the request.
import { create } from 'zustand'
import { useUiStore } from '../../model/uiStore'
import type { Problem } from '../../model/types'

export interface RevealRequest {
  /** 1-based position in the QASM text. */
  line: number
  column: number
  /** Increments per request, so clicking the same problem twice reveals it twice. */
  seq: number
}

interface RevealState {
  request: RevealRequest | null
  reveal: (line: number, column: number) => void
  clear: () => void
}

export const useRevealStore = create<RevealState>((set) => ({
  request: null,
  reveal: (line, column) =>
    set((s) => ({ request: { line, column, seq: (s.request?.seq ?? 0) + 1 } })),
  clear: () => set({ request: null }),
}))

/** Opens the QASM tab and puts the cursor on the problem. */
export function revealProblem(problem: Problem): void {
  useUiStore.getState().setCodeTab('qasm')
  useRevealStore.getState().reveal(problem.line ?? 1, problem.column ?? 1)
}
