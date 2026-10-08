// Keep-any-subset partial trace and von Neumann entropy (V2-7).
//
// CONTRACT STUBS (V2-0): signatures are final, implementations land in V2-7.
//
// Generalising the one-qubit partial trace: keep a set K of qubits and trace out the rest R.
//   ρ_K[a][b] = Σ_r ψ(a, r) · conj(ψ(b, r))
// where a, b run over the 2^|K| basis states of the kept qubits and r over those of the rest.
import type { ComplexMatrix, StateVector, SubsetTraceResult } from './types'

/**
 * Reduced density matrix of the kept qubits (direct method, from amplitudes).
 * n is inferred from state.length = 2ⁿ. `keep` must be distinct, in range and non-empty;
 * the result's basis is big-endian over `keep` sorted ascending. Size 2^k × 2^k.
 */
export function reducedDensityMatrixSubset(state: StateVector, keep: number[]): ComplexMatrix {
  void state
  void keep
  throw new Error('reducedDensityMatrixSubset: not implemented yet (V2-7)')
}

/**
 * Von Neumann entropy S(ρ) = −Tr(ρ log₂ ρ) = −Σ λᵢ log₂ λᵢ over the eigenvalues λᵢ of ρ,
 * in bits (0·log 0 = 0). 0 for a pure state, k for a maximally mixed k-qubit state.
 */
export function vonNeumannEntropy(rho: ComplexMatrix): number {
  void rho
  throw new Error('vonNeumannEntropy: not implemented yet (V2-7)')
}

/**
 * Full subset result for the teaching views: reduced ρ, purity, entropy and, when
 * `explicit` is true, the textbook steps (full ρ + per-entry sums).
 */
export function partialTraceSubset(
  state: StateVector,
  keep: number[],
  explicit: boolean,
): SubsetTraceResult {
  void state
  void keep
  void explicit
  throw new Error('partialTraceSubset: not implemented yet (V2-7)')
}
