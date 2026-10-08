// Which qubits the teaching tabs keep (V2-7, "Keep qubits" selector).
//
// Default: keep only the selected qubit (the v1 behaviour). The user can toggle more
// qubits on; that set is stored here as `custom`. Selecting a qubit anywhere (clicking a
// Bloch sphere, "Reduced ρ" button, …) goes back to keeping just that qubit.
import { useMemo } from 'react'
import { create } from 'zustand'
import { useCircuitStore } from '../../model/store'

interface KeepState {
  /** Two or more kept qubits chosen by the user, sorted; null = keep the selected qubit. */
  custom: number[] | null
  setCustom: (custom: number[] | null) => void
}

export const useKeepStore = create<KeepState>((set) => ({
  custom: null,
  setCustom: (custom) => set({ custom }),
}))

// Follow the selection: whenever the selected qubit changes, keep just that qubit again.
useCircuitStore.subscribe((state, prev) => {
  if (state.selectedQubit !== prev.selectedQubit && useKeepStore.getState().custom !== null) {
    useKeepStore.setState({ custom: null })
  }
})

/**
 * The kept qubits actually shown: the custom set (dropping qubits that no longer exist),
 * or just the selected qubit. Empty only while nothing is selected.
 */
export function effectiveKeep(
  custom: number[] | null,
  selected: number | null,
  numQubits: number,
): number[] {
  const valid = custom?.filter((q) => q < numQubits) ?? []
  if (valid.length >= 2) return valid
  return selected === null || selected >= numQubits ? [] : [selected]
}

/**
 * Toggle qubit `q` in the kept set. The last kept qubit cannot be removed. When the set
 * shrinks to one qubit, that qubit becomes the selected one (and we are back to v1).
 */
export function toggleKept(q: number, keep: number[]): void {
  const next = keep.includes(q) ? keep.filter((x) => x !== q) : [...keep, q].sort((a, b) => a - b)
  if (next.length === 0) return
  if (next.length === 1) {
    useKeepStore.getState().setCustom(null)
    useCircuitStore.getState().selectQubit(next[0])
    return
  }
  useKeepStore.getState().setCustom(next)
}

/** Current kept qubits, reading both stores. The array is stable while the set is unchanged. */
export function useKeep(): number[] {
  const custom = useKeepStore((s) => s.custom)
  const selected = useCircuitStore((s) => s.selectedQubit)
  const numQubits = useCircuitStore((s) => s.circuit.numQubits)
  const key = effectiveKeep(custom, selected, numQubits).join(',')
  return useMemo(() => (key === '' ? [] : key.split(',').map(Number)), [key])
}
