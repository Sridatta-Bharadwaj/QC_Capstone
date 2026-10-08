// Bloch vector, purity and per-qubit analysis.
//
// HOW THE BLOCH VECTOR IS READ OFF ρ:
// Any 2×2 density matrix can be written with the Pauli matrices as
//   ρ = (I + x·X + y·Y + z·Z) / 2
// Writing that out entry by entry:
//   ρ = ½ [ 1 + z     x − iy ]
//         [ x + iy    1 − z  ]
// so we can read the three numbers straight off the matrix:
//   z = ρ₀₀ − ρ₁₁       (probability of 0 minus probability of 1)
//   x = 2·Re(ρ₀₁)
//   y = −2·Im(ρ₀₁)
// These equal the expectation values ⟨X⟩ = Tr(ρX), ⟨Y⟩ = Tr(ρY), ⟨Z⟩ = Tr(ρZ).
// r = (x, y, z) is the Bloch vector: the arrow drawn in the sphere.
//
// PURE VS MIXED, AND WHY |r| < 1 MEANS ENTANGLEMENT:
// Purity Tr(ρ²) = (1 + |r|²)/2. It is 1 for a pure state (|r| = 1, arrow on
// the surface) and 0.5 for a maximally mixed one (|r| = 0, arrow at the centre).
// Our whole n-qubit state is always pure (no measurement, no noise). For a
// pure global state, a single qubit can only look mixed if it is entangled
// with the other qubits: some of its information lives in correlations with
// them, which a view of qubit k alone cannot see. So |r| < 1 ⇔ entangled.
import type { Circuit } from '../model/types'
import { ENTANGLEMENT_EPSILON } from './types'
import { abs2 } from './complex'
import { reducedDensityMatrix } from './partialTrace'
import { simulate, simulateColumns } from './simulator'
import type {
  BlochVector,
  CircuitAnalysis,
  ComplexMatrix,
  QubitAnalysis,
  StateVector,
  StepResult,
} from './types'

/** r = (Tr(ρX), Tr(ρY), Tr(ρZ)) for a 2×2 density matrix. */
export function blochVector(rho: ComplexMatrix): BlochVector {
  return {
    x: 2 * rho[0][1].re,
    y: -2 * rho[0][1].im,
    z: rho[0][0].re - rho[1][1].re,
  }
}

/**
 * Tr(ρ²) = Σᵢⱼ ρᵢⱼ·ρⱼᵢ = Σᵢⱼ |ρᵢⱼ|² (because ρ is Hermitian: ρⱼᵢ = conj(ρᵢⱼ)).
 * 1 = pure, 1/d = maximally mixed (0.5 for one qubit). Works for any size.
 */
export function purity(rho: ComplexMatrix): number {
  let sum = 0
  for (const row of rho) for (const entry of row) sum += abs2(entry)
  return sum
}

/** Length of the Bloch vector, |r| = √(x² + y² + z²). */
export function blochLength(r: BlochVector): number {
  return Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z)
}

/** Run the circuit and describe every qubit on its own (direct method, O(n·2ⁿ)). */
export function analyze(circuit: Circuit): CircuitAnalysis {
  return analyzeState(simulate(circuit), circuit.numQubits)
}

/**
 * Per-qubit analysis after every column (step-through debugger, V2-5).
 * steps[0] = start state, steps[c + 1] = after column c; the last step equals analyze(circuit).
 * Cheap at n ≤ 6: (columns + 1) × O(n·2ⁿ).
 */
export function simulateSteps(circuit: Circuit): StepResult[] {
  return simulateColumns(circuit).map((state, step) => ({
    step,
    afterColumn: step - 1,
    ...analyzeState(state, circuit.numQubits),
  }))
}

/** Describe every qubit of an n-qubit statevector on its own (direct method). */
export function analyzeState(state: StateVector, n: number): CircuitAnalysis {
  const qubits: QubitAnalysis[] = []
  for (let k = 0; k < n; k++) {
    const rho = reducedDensityMatrix(state, n, k)
    const bloch = blochVector(rho)
    const length = blochLength(bloch)
    qubits.push({
      qubit: k,
      rho,
      bloch,
      length,
      purity: purity(rho),
      entangled: length < 1 - ENTANGLEMENT_EPSILON,
    })
  }
  return { numQubits: n, state, qubits }
}
