// Initial states ↔ preparation gates (PLAN.md → V2-2).
//
// Inside the app a wire simply *starts* in its chosen state: the engine builds the product
// state directly (no gates). Code, however, has no "start in |+⟩" statement: a real QASM or
// Qiskit program always starts in |0…0⟩. So the code tabs write each non-|0⟩ start state as a
// short sequence of gates that turns |0⟩ into that state, inside a marked block:
//
//   // initial states          (Qiskit: # initial states)
//   x q[0];
//   h q[0];
//   // end initial states      (Qiskit: # end initial states)
//
// The parsers read that block back into `initialStates`. Those gates are NOT circuit
// operations: they are just how code spells "this wire starts in |−⟩", so they never appear on
// the canvas and the circuit's columns start after them.
//
// Why each sequence works (gates act right-to-left on the ket, written left-to-right in code):
//   |1⟩  = X|0⟩                            X flips |0⟩ to |1⟩
//   |+⟩  = H|0⟩   = (|0⟩ + |1⟩)/√2         H maps the z basis to the x basis
//   |−⟩  = H X|0⟩ = H|1⟩ = (|0⟩ − |1⟩)/√2  so: x first, then h
//   |i⟩  = S H|0⟩ = S|+⟩ = (|0⟩ + i|1⟩)/√2 S = diag(1, i) multiplies the |1⟩ part by i
//   |−i⟩ = S†H|0⟩ = (|0⟩ − i|1⟩)/√2        S† = diag(1, −i) multiplies it by −i
// Each gives exactly the engine's start vector (no extra global phase), which `verify/` checks.
import type { GateType, InitialState } from '../model/types'

/** The comment text that opens / closes the block (after `//` or `#`). */
export const PREP_BLOCK_BEGIN = 'initial states'
export const PREP_BLOCK_END = 'end initial states'

/** Gates (in the order they are written) that turn |0⟩ into each state. |0⟩ needs none. */
export const PREP_SEQUENCES: Record<InitialState, readonly GateType[]> = {
  '0': [],
  '1': ['X'],
  '+': ['H'],
  '-': ['X', 'H'],
  i: ['H', 'S'],
  '-i': ['H', 'Sdg'],
}

/** The only gates that may appear inside the block. */
export const PREP_GATES: ReadonlySet<GateType> = new Set(['X', 'H', 'S', 'Sdg'])

/** The state a gate sequence prepares from |0⟩, or null if it is not one of the sequences above. */
export function stateForSequence(gates: readonly GateType[]): InitialState | null {
  for (const [state, sequence] of Object.entries(PREP_SEQUENCES) as [
    InitialState,
    readonly GateType[],
  ][]) {
    if (sequence.length > 0 && sequence.length === gates.length) {
      if (sequence.every((g, k) => g === gates[k])) return state
    }
  }
  return null
}

/**
 * The preparation gates for a whole register, in the order they are written: qubit by qubit
 * (ascending), each qubit's sequence together. Empty when every wire starts in |0⟩.
 */
export function prepGates(
  initialStates: readonly InitialState[],
): { gate: GateType; qubit: number }[] {
  return initialStates.flatMap((state, qubit) =>
    PREP_SEQUENCES[state].map((gate) => ({ gate, qubit })),
  )
}
