// Public API of the math engine. Pure TypeScript, no React, no DOM.
// CONTRACT FILE: signatures here are what the worker, UI and tests code against.
// Implementations live in the sibling files; change this file only on `main`.

export type {
  BlochVector,
  CircuitAnalysis,
  Complex,
  ComplexMatrix,
  PartialTraceResult,
  QubitAnalysis,
  StateVector,
  TraceEntry,
  TraceTerm,
} from './types'

/** A qubit counts as entangled (mixed) when |r| < 1 − ENTANGLEMENT_EPSILON. */
export const ENTANGLEMENT_EPSILON = 1e-9

/**
 * simulate(circuit) → statevector.
 * Starts in |0…0⟩ and applies each gate in increasing column order.
 * Ordering convention: see `StateVector` in ./types (qubit 0 = most significant bit).
 */
export { simulate } from './simulator'

/**
 * densityMatrix(state) → ρ = |ψ⟩⟨ψ| (2ⁿ×2ⁿ). O(4ⁿ); teaching views only.
 *
 * reducedDensityMatrix(state, n, k) → 2×2 ρₖ, DIRECT method from amplitudes, O(2ⁿ).
 *   Used for the Bloch spheres.
 *
 * partialTraceExplicit(state, n, k) → full ρ, then trace out every other qubit, O(4ⁿ).
 *   Returns the intermediate steps for the Partial Trace Steps tab; `.reduced`
 *   must equal reducedDensityMatrix(...) to 1e-10.
 */
export { densityMatrix, reducedDensityMatrix, partialTraceExplicit } from './partialTrace'

/**
 * blochVector(ρ) → (Tr(ρX), Tr(ρY), Tr(ρZ)).
 * purity(ρ)      → Tr(ρ²).
 * analyze(circuit) → statevector + per-qubit ρ, Bloch vector, |r|, purity, entangled flag.
 */
export { analyze, blochVector, purity } from './bloch'

export { complex } from './complex'
