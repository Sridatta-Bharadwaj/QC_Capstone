// Density matrices and the partial trace.
//
// WHAT IS ρ = |ψ⟩⟨ψ|?
// The density matrix of a pure state is the "outer product" of the
// statevector with its own conjugate: ρ[i][j] = ψᵢ · conj(ψⱼ).
//  - The diagonal ρ[i][i] = |ψᵢ|² holds the probabilities of each basis state.
//  - The off-diagonal entries ("coherences") hold the relative phases, i.e.
//    the superposition information.
// ρ can describe things a statevector cannot: a MIXED state, meaning a
// classical uncertainty over quantum states. That is exactly what a single
// qubit looks like when it is entangled with others.
//
// WHAT DOES "TRACING OUT" A QUBIT MEAN?
// To describe qubit k on its own, we ignore ("trace out") every other qubit.
// Mathematically: the reduced 2×2 matrix is
//   ρₖ[a][b] = Σ_rest ρ[(a, rest)][(b, rest)]
// where (a, rest) is the basis index with qubit k = a and all other qubits
// equal to `rest`. We add up the entries where the OTHER qubits match on both
// sides (row and column). Entries where the others differ are dropped: those
// coherences are invisible to someone who only looks at qubit k.
//
// TWO WAYS TO COMPUTE IT (same answer):
//  1. Explicit / textbook: build the full 2ⁿ×2ⁿ ρ (4ⁿ numbers), then sum.
//     Cost O(4ⁿ). Used by the teaching views to show every step.
//  2. Direct: substitute ρ[(a,rest)][(b,rest)] = ψ(a,rest)·conj(ψ(b,rest))
//     into the sum above, so we never need the full ρ:
//       ρₖ[a][b] = Σ_rest ψ(a,rest) · conj(ψ(b,rest))
//     There are 2ⁿ⁻¹ values of `rest` and 4 entries (a, b), so the cost is
//     O(2ⁿ). Used for the Bloch spheres. Both give the same numbers because
//     they add exactly the same products, just without storing the rest of ρ.
import { add, complex, conj, mul } from './complex'
import type { Complex, ComplexMatrix, PartialTraceResult, StateVector, TraceEntry } from './types'

/**
 * Build the full basis index from qubit k's value `bit` and the values of the
 * other n−1 qubits packed into `rest` (in the same big-endian order, with
 * qubit k removed). Example: n = 3, k = 1, bit = 1, rest = 0b10 (q0=1, q2=0)
 * → |q0 q1 q2⟩ = |1 1 0⟩ = 6.
 */
export function composeIndex(numQubits: number, qubit: number, bit: 0 | 1, rest: number): number {
  const pos = numQubits - 1 - qubit // bit position of qubit k (0 = least significant)
  const low = rest & ((1 << pos) - 1) // qubits to the right of k
  const high = (rest >> pos) << (pos + 1) // qubits to the left of k, shifted up one place
  return high | (bit << pos) | low
}

function checkArgs(state: StateVector, numQubits: number, qubit: number): void {
  if (state.length !== 1 << numQubits) {
    throw new Error(`State has ${state.length} amplitudes, expected 2^${numQubits}`)
  }
  if (!Number.isInteger(qubit) || qubit < 0 || qubit >= numQubits) {
    throw new Error(`Qubit ${qubit} is out of range for ${numQubits} qubit(s)`)
  }
}

function zeroMatrix(size: number): ComplexMatrix {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => complex(0)))
}

/** ρ = |ψ⟩⟨ψ|, i.e. ρ[i][j] = ψᵢ·conj(ψⱼ). Size 2ⁿ×2ⁿ, cost O(4ⁿ). */
export function densityMatrix(state: StateVector): ComplexMatrix {
  return state.map((psiI) => state.map((psiJ) => mul(psiI, conj(psiJ))))
}

/**
 * DIRECT method, O(2ⁿ): ρₖ[a][b] = Σ_rest ψ(a,rest)·conj(ψ(b,rest)).
 * Never builds the full ρ.
 */
export function reducedDensityMatrix(
  state: StateVector,
  numQubits: number,
  qubit: number,
): ComplexMatrix {
  checkArgs(state, numQubits, qubit)
  const rho = zeroMatrix(2)
  const restCount = 1 << (numQubits - 1) // number of basis states of the other qubits
  for (let rest = 0; rest < restCount; rest++) {
    // The two amplitudes that share this `rest`: qubit k = 0 and qubit k = 1.
    const psi: [Complex, Complex] = [
      state[composeIndex(numQubits, qubit, 0, rest)],
      state[composeIndex(numQubits, qubit, 1, rest)],
    ]
    for (const a of [0, 1] as const) {
      for (const b of [0, 1] as const) {
        rho[a][b] = add(rho[a][b], mul(psi[a], conj(psi[b])))
      }
    }
  }
  return rho
}

/**
 * EXPLICIT (textbook) method, O(4ⁿ): build ρ = |ψ⟩⟨ψ|, then for each reduced
 * entry (a, b) in order 00, 01, 10, 11 list the full-ρ entries
 * ρ[(a,rest)][(b,rest)] that get summed. The list is what the
 * Partial Trace Steps tab shows.
 */
export function partialTraceExplicit(
  state: StateVector,
  numQubits: number,
  qubit: number,
): PartialTraceResult {
  checkArgs(state, numQubits, qubit)
  const fullRho = densityMatrix(state)
  const restCount = 1 << (numQubits - 1)
  const entries: TraceEntry[] = []
  const reduced = zeroMatrix(2)

  for (const a of [0, 1] as const) {
    for (const b of [0, 1] as const) {
      const terms = []
      let sum = complex(0)
      for (let rest = 0; rest < restCount; rest++) {
        // Row has qubit k = a, column has qubit k = b; the other qubits match.
        const row = composeIndex(numQubits, qubit, a, rest)
        const col = composeIndex(numQubits, qubit, b, rest)
        const value = fullRho[row][col]
        terms.push({ row, col, value })
        sum = add(sum, value)
      }
      entries.push({ a, b, terms, sum })
      reduced[a][b] = sum
    }
  }

  return { qubit, numQubits, fullRho, entries, reduced }
}
