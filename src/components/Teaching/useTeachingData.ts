// Shared data hook for the teaching tabs: which qubit is selected, and whether the
// worker's results for it are ready to show.
import { useEffect } from 'react'
import type { CircuitAnalysis, PartialTraceResult, QubitAnalysis } from '../../engine/types'
import { useCircuitStore, useResultsStore } from '../../model/store'

export interface TeachingData {
  numQubits: number
  selected: number | null
  analysis: CircuitAnalysis | null
  /** Direct-method result for the selected qubit (null while unavailable). */
  qubit: QubitAnalysis | null
  /** Explicit partial trace, only when it belongs to the selected qubit and current analysis. */
  explicit: PartialTraceResult | null
  computing: boolean
}

/**
 * Reads the stores for the teaching tabs.
 * If no qubit is selected when a tab is shown, q0 is selected automatically, which makes
 * the worker compute the explicit partial trace for it.
 */
export function useTeachingData(): TeachingData {
  const numQubits = useCircuitStore((s) => s.circuit.numQubits)
  const selected = useCircuitStore((s) => s.selectedQubit)
  const selectQubit = useCircuitStore((s) => s.selectQubit)
  const analysis = useResultsStore((s) => s.analysis)
  const rawExplicit = useResultsStore((s) => s.explicit)
  const computing = useResultsStore((s) => s.computing)

  useEffect(() => {
    if (selected === null) selectQubit(0)
  }, [selected, selectQubit])

  // Results can lag one worker reply behind the stores: only use them when they match.
  const analysisFits = analysis !== null && analysis.numQubits === numQubits
  const qubit = analysisFits && selected !== null ? (analysis.qubits[selected] ?? null) : null
  const explicit =
    qubit !== null &&
    rawExplicit !== null &&
    rawExplicit.qubit === selected &&
    rawExplicit.numQubits === numQubits
      ? rawExplicit
      : null

  return {
    numQubits,
    selected,
    analysis: analysisFits ? analysis : null,
    qubit,
    explicit,
    computing,
  }
}
