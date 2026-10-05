// Canvas-only UI state: which gate is selected and the current hint message.
// Kept out of the circuit model on purpose; the model store stays the single source of truth
// for the circuit itself.
import { create } from 'zustand'

export interface CanvasHint {
  /** Increments per hint, so the same text shown twice still restarts its timer. */
  id: number
  text: string
}

interface CanvasUiState {
  selectedOpId: string | null
  hint: CanvasHint | null
  selectOp: (id: string | null) => void
  showHint: (text: string) => void
  /** Clears the hint (only if it is still hint `id`, when given). */
  clearHint: (id?: number) => void
}

let hintCounter = 0

export const useCanvasStore = create<CanvasUiState>((set) => ({
  selectedOpId: null,
  hint: null,
  selectOp: (selectedOpId) => set({ selectedOpId }),
  showHint: (text) => {
    hintCounter += 1
    set({ hint: { id: hintCounter, text } })
  },
  clearHint: (id) => set((s) => (id === undefined || s.hint?.id === id ? { hint: null } : {})),
}))
