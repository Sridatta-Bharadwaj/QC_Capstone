// Engine data types. CONTRACT FILE: change only on `main`.

/** A complex number a + bi. Plain object so it survives postMessage to/from the worker. */
export interface Complex {
  re: number
  im: number
}

/** Row-major square matrix of complex numbers: m[row][col]. */
export type ComplexMatrix = Complex[][]

/**
 * State vector of n qubits: 2ⁿ complex amplitudes.
 *
 * QUBIT ORDERING (big-endian, textbook convention):
 * the basis index i is the bit string |q0 q1 … q(n-1)⟩, so qubit 0 is the
 * MOST significant bit. Bit of qubit k in index i: (i >> (n - 1 - k)) & 1.
 * Example, n = 2: index 1 = |01⟩ means q0 = 0, q1 = 1.
 * (Qiskit is little-endian: q0 is the LEAST significant bit. See verify/.)
 */
export type StateVector = Complex[]

/** Bloch vector r = (⟨X⟩, ⟨Y⟩, ⟨Z⟩). |r| = 1 for a pure state, |r| < 1 for a mixed one. */
export interface BlochVector {
  x: number
  y: number
  z: number
}

/** Everything the UI needs about one qubit. */
export interface QubitAnalysis {
  qubit: number
  /** 2×2 reduced density matrix ρₖ (direct method). */
  rho: ComplexMatrix
  bloch: BlochVector
  /** |r|, the Bloch vector length. */
  length: number
  /** Tr(ρₖ²): 1 = pure, 0.5 = maximally mixed. */
  purity: number
  /** True when |r| < 1 − ENTANGLEMENT_EPSILON, i.e. this qubit is entangled with the rest. */
  entangled: boolean
}

export interface CircuitAnalysis {
  numQubits: number
  state: StateVector
  qubits: QubitAnalysis[]
}

/** One full-ρ entry ρ[row][col] that contributes to a reduced-ρ entry. */
export interface TraceTerm {
  row: number
  col: number
  value: Complex
}

/** How reduced ρₖ[a][b] is built: the sum of full-ρ entries where all other qubits match. */
export interface TraceEntry {
  a: 0 | 1
  b: 0 | 1
  terms: TraceTerm[]
  sum: Complex
}

/** Result of the explicit (textbook) partial trace, used by the teaching views. */
export interface PartialTraceResult {
  qubit: number
  numQubits: number
  /** Full 2ⁿ×2ⁿ density matrix ρ = |ψ⟩⟨ψ|. */
  fullRho: ComplexMatrix
  /** One entry per (a, b) ∈ {0,1}², in order 00, 01, 10, 11. */
  entries: TraceEntry[]
  /** The 2×2 reduced density matrix (equals the direct method's result). */
  reduced: ComplexMatrix
}
