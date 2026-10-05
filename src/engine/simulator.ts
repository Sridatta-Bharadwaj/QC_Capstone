// Statevector simulator.
//
// WHAT IS A STATEVECTOR?
// An n-qubit state is a list of 2ⁿ complex numbers called amplitudes, one per
// basis state |00…0⟩, |00…1⟩, …, |11…1⟩:
//   |ψ⟩ = Σᵢ ψᵢ |i⟩,   with Σᵢ |ψᵢ|² = 1 (the probabilities add up to 1).
// Index i written in binary IS the basis state. Ordering is big-endian:
// qubit 0 is the leftmost (most significant) bit, so for n = 2
//   index 0 = |00⟩, 1 = |01⟩, 2 = |10⟩, 3 = |11⟩.
// The bit of qubit k inside index i is (i >> (n − 1 − k)) & 1.
//
// We never build the full 2ⁿ×2ⁿ gate matrices. A gate only touches a few
// qubits, so we update the amplitudes in place, which is O(2ⁿ) per gate.
import { sortedOperations, validateOperation } from '../model/circuit'
import type { Circuit, Operation } from '../model/types'
import { add, complex, mul } from './complex'
import { FIXED_GATES, rotationGate } from './gates'
import type { Complex, ComplexMatrix, StateVector } from './types'

/** Position mask of qubit k inside a basis index (big-endian: qubit 0 = MSB). */
export function qubitMask(numQubits: number, qubit: number): number {
  return 1 << (numQubits - 1 - qubit)
}

/** Value (0 or 1) of qubit k in basis index i. */
export function bitOf(index: number, numQubits: number, qubit: number): 0 | 1 {
  return (index & qubitMask(numQubits, qubit)) === 0 ? 0 : 1
}

/** |0…0⟩: amplitude 1 on index 0, 0 everywhere else. */
export function zeroState(numQubits: number): StateVector {
  const state: StateVector = new Array(1 << numQubits)
  for (let i = 0; i < state.length; i++) state[i] = complex(0)
  state[0] = complex(1)
  return state
}

/**
 * Apply a 2×2 gate U to one target qubit, optionally only where all `controls` are 1.
 *
 * HOW A SINGLE-QUBIT GATE ACTS ON n QUBITS:
 * Group the 2ⁿ basis states into pairs that differ ONLY in the target bit:
 * (…0…, …1…). Everything else (the other qubits) is identical inside a pair,
 * so the gate just mixes the two amplitudes of each pair like a 1-qubit state:
 *   new ψ(…0…) = u00·ψ(…0…) + u01·ψ(…1…)
 *   new ψ(…1…) = u10·ψ(…0…) + u11·ψ(…1…)
 * There are 2ⁿ⁻¹ pairs, so one gate costs O(2ⁿ).
 *
 * WHY CONTROLS WORK BY CHECKING BITS:
 * A controlled gate means "apply U to the target only in the branches of the
 * superposition where every control qubit is |1⟩". Each pair is one such
 * branch (the control bits are the same for both members), so we simply
 * skip the pairs whose control bits are not all 1.
 */
function applySingleQubit(
  state: StateVector,
  numQubits: number,
  target: number,
  u: ComplexMatrix,
  controls: readonly number[] = [],
): void {
  const targetMask = qubitMask(numQubits, target)
  const controlMask = controls.reduce((m, q) => m | qubitMask(numQubits, q), 0)
  for (let i0 = 0; i0 < state.length; i0++) {
    // Visit each pair once, from its member whose target bit is 0.
    if ((i0 & targetMask) !== 0) continue
    // Controlled gate: only act where all control bits are 1.
    if ((i0 & controlMask) !== controlMask) continue
    const i1 = i0 | targetMask // same index with the target bit set to 1
    const a0: Complex = state[i0]
    const a1: Complex = state[i1]
    state[i0] = add(mul(u[0][0], a0), mul(u[0][1], a1))
    state[i1] = add(mul(u[1][0], a0), mul(u[1][1], a1))
  }
}

/**
 * SWAP exchanges the states of qubits a and b: the amplitude of |…0…1…⟩
 * trades places with |…1…0…⟩. States where a and b agree are unchanged.
 */
function applySwap(state: StateVector, numQubits: number, a: number, b: number): void {
  const maskA = qubitMask(numQubits, a)
  const maskB = qubitMask(numQubits, b)
  for (let i = 0; i < state.length; i++) {
    // Pick the member with a = 1, b = 0; its partner has a = 0, b = 1.
    if ((i & maskA) !== 0 && (i & maskB) === 0) {
      const j = (i & ~maskA) | maskB
      const tmp = state[i]
      state[i] = state[j]
      state[j] = tmp
    }
  }
}

/** The 2×2 matrix for a single-qubit operation. */
function singleQubitMatrix(op: Operation): ComplexMatrix {
  if (op.gate === 'RX' || op.gate === 'RY' || op.gate === 'RZ') {
    return rotationGate(op.gate, op.angle ?? 0)
  }
  if (op.gate in FIXED_GATES) return FIXED_GATES[op.gate as keyof typeof FIXED_GATES]
  throw new Error(`Not a single-qubit gate: ${op.gate}`)
}

/** Apply one operation to the state, in place. */
function applyOperation(state: StateVector, numQubits: number, op: Operation): void {
  switch (op.gate) {
    case 'CX': {
      // Controlled-NOT: X on the target where the control is 1.
      const [control, target] = op.qubits
      applySingleQubit(state, numQubits, target, FIXED_GATES.X, [control])
      return
    }
    case 'CZ': {
      // Controlled-Z: flips the sign of |…1…1…⟩ (symmetric in the two qubits).
      const [control, target] = op.qubits
      applySingleQubit(state, numQubits, target, FIXED_GATES.Z, [control])
      return
    }
    case 'CCX': {
      // Toffoli: X on the target only where BOTH controls are 1.
      const [c1, c2, target] = op.qubits
      applySingleQubit(state, numQubits, target, FIXED_GATES.X, [c1, c2])
      return
    }
    case 'SWAP': {
      const [a, b] = op.qubits
      applySwap(state, numQubits, a, b)
      return
    }
    default:
      applySingleQubit(state, numQubits, op.qubits[0], singleQubitMatrix(op))
  }
}

/**
 * simulate(circuit): start in |0…0⟩ and apply every gate in time (column) order.
 * Throws if an operation is invalid (unknown gate, qubit out of range, missing angle).
 */
export function simulate(circuit: Circuit): StateVector {
  const n = circuit.numQubits
  if (!Number.isInteger(n) || n < 1) throw new Error(`Invalid qubit count ${n}`)
  const state = zeroState(n)
  for (const op of sortedOperations(circuit)) {
    const problem = validateOperation(op, n)
    if (problem) throw new Error(problem)
    applyOperation(state, n, op)
  }
  return state
}
