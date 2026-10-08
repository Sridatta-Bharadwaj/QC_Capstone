// UI-only state (which tabs are open). Kept apart from the circuit model on purpose.
import { create } from 'zustand'
import type { CodeTab } from './types'

export type { CodeTab }

export type BottomTab = 'bloch' | 'density' | 'trace' | 'problems'

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
