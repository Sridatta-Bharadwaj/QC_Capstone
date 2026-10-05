// UI-only state (which tabs are open). Kept apart from the circuit model on purpose.
import { create } from 'zustand'

export type BottomTab = 'bloch' | 'density' | 'trace' | 'problems'
export type CodeTab = 'qasm' | 'qiskit'

interface UiState {
  bottomTab: BottomTab
  codeTab: CodeTab
  setBottomTab: (tab: BottomTab) => void
  setCodeTab: (tab: CodeTab) => void
}

export const useUiStore = create<UiState>((set) => ({
  bottomTab: 'bloch',
  codeTab: 'qasm',
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setCodeTab: (codeTab) => set({ codeTab }),
}))
