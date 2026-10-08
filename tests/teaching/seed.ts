// Seeds the stores with real engine output, as the worker bridge would.
import { analyze, partialTraceExplicit } from '../../src/engine'
import { findPreset } from '../../src/model/presets'
import { useKeepStore } from '../../src/components/Teaching/keepStore'
import { useCircuitStore, useResultsStore } from '../../src/model/store'
import type { Circuit } from '../../src/model/types'
import { defaultInitialStates } from '../../src/model/circuit'

export function presetCircuit(id: string): Circuit {
  const preset = findPreset(id)
  if (!preset) throw new Error(`No preset ${id}`)
  return preset.circuit
}

/** Put `circuit` in the circuit store and matching results (explicit for `selected`). */
export function seed(circuit: Circuit, selected: number | null): void {
  const analysis = analyze(circuit)
  const explicit =
    selected === null ? null : partialTraceExplicit(analysis.state, circuit.numQubits, selected)
  useCircuitStore.setState({ circuit, selectedQubit: selected })
  useKeepStore.setState({ custom: null }) // keep just the selected qubit (v1 view)
  useResultsStore.setState({ analysis, explicit, computing: false, error: null })
}

/** A circuit of n qubits with H on q0 and a CX chain (GHZ-like), for "too large" tests. */
export function ghz(n: number): Circuit {
  return {
    numQubits: n,
    initialStates: defaultInitialStates(n),
    operations: [
      { id: 'h', gate: 'H', column: 0, qubits: [0] },
      ...Array.from({ length: n - 1 }, (_, i) => ({
        id: `cx${i}`,
        gate: 'CX' as const,
        column: i + 1,
        qubits: [i, i + 1],
      })),
    ],
  }
}
