// Engine data types. CONTRACT FILE: change only on `main`.

/** A qubit counts as entangled (mixed) when |r| < 1 − ENTANGLEMENT_EPSILON. */
export const ENTANGLEMENT_EPSILON = 1e-9

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

/**
 * The state after one step of the circuit (step-through debugger, V2-5).
 * step 0 = the start state (afterColumn = −1); step c + 1 = after every gate in columns 0..c.
 * Contains the statevector too, so the teaching views can run the explicit trace at that step.
 */
export interface StepResult extends CircuitAnalysis {
  step: number
  /** Last column applied; −1 for the start state. */
  afterColumn: number
}

/**
 * One entry ρ_keep[row][col] of a subset-reduced density matrix, as a sum of full-ρ entries
 * (generalises TraceEntry from one kept qubit to any set).
 * `row` / `col` are basis indices over the KEPT qubits, big-endian in ascending qubit order.
 */
export interface SubsetTraceEntry {
  row: number
  col: number
  terms: TraceTerm[]
  sum: Complex
}

/** Keep-any-subset partial trace (V2-7). */
export interface SubsetTraceResult {
  numQubits: number
  /** Kept qubits, sorted ascending, distinct. Their order defines the basis of `reduced`. */
  keep: number[]
  /** 2^k × 2^k reduced density matrix, k = keep.length. */
  reduced: ComplexMatrix
  /** Tr(ρ²): 1 = pure, 1/2^k = maximally mixed. */
  purity: number
  /** Von Neumann entropy S(ρ) = −Σ λ log₂ λ, in bits. 0 = pure. */
  entropy: number
  /**
   * Explicit textbook steps (one per reduced entry, row-major), only when requested and
   * small enough to show; null otherwise.
   */
  entries: SubsetTraceEntry[] | null
  /** Full 2ⁿ×2ⁿ ρ when `entries` is present (Density Matrices tab), else null. */
  fullRho: ComplexMatrix | null
}
