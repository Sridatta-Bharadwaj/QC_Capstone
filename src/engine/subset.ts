// Keep-any-subset partial trace and von Neumann entropy (V2-7).
//
// WHAT DOES "KEEP A SET OF QUBITS" MEAN?
// v1 kept ONE qubit k and traced out all the others. Here we keep any set K of qubits
// (say q0 and q2) and trace out the rest R (say q1). The result ρ_K describes the kept
// qubits together, as one 2^k × 2^k matrix (k = |K|), ignoring the rest completely.
//
// Every basis index i of the full state splits into two parts:
//   a = the bits of the KEPT qubits   (a number in 0 … 2^k − 1)
//   r = the bits of the REST          (a number in 0 … 2^(n−k) − 1)
// and we write ψ(a, r) for the amplitude at that index. Tracing out R means: for each
// entry (a, b) of ρ_K, add up the full-ρ entries whose kept bits are a (row) and b
// (column) and whose rest bits are EQUAL in row and column:
//
//   ρ_K[a][b] = Σ_r ρ[(a, r)][(b, r)] = Σ_r ψ(a, r) · conj(ψ(b, r))
//
// The left form is the textbook one (needs the full ρ, O(4ⁿ)); the right form is the
// direct one (straight from amplitudes, O(2^(n+k))). They add exactly the same products.
// With K = {k} this is v1's formula; with K = all qubits nothing is summed and ρ_K = ρ.
//
// BASIS ORDER: the kept qubits are sorted ascending and read big-endian, like the full
// state. Keep {0, 2}: a = 0b10 means q0 = 1, q2 = 0, written |q0 q2⟩ = |10⟩.
//
// WHY ENTROPY?
// ρ_K has eigenvalues λ₁ … λ_d (d = 2^k): probabilities, ≥ 0 and summing to 1. The von
// Neumann entropy S = −Σ λ log₂ λ counts, in bits, how uncertain the kept qubits are on
// their own. The whole circuit is in a PURE state |ψ⟩, so all of that uncertainty comes
// from correlations with the traced-out qubits: S(ρ_K) = 0 exactly when K is not
// entangled with R, and S = k bits when the k kept qubits are maximally entangled with
// the rest (ρ_K = I / 2^k). For a pure global state S(ρ_K) = S(ρ_R): the entanglement is
// shared, both sides see the same amount.
import { purity } from './bloch'
import { add, complex, conj, mul } from './complex'
import { densityMatrix } from './partialTrace'
import type {
  Complex,
  ComplexMatrix,
  StateVector,
  SubsetTraceEntry,
  SubsetTraceResult,
  TraceTerm,
} from './types'

/**
 * Largest number of kept qubits for which the textbook steps (`entries`, `fullRho`) are
 * returned. 3 kept qubits = an 8×8 reduced ρ = 64 entries; more is unreadable on a slide,
 * and the teaching views only draw the reduced ρ up to 8×8.
 */
export const MAX_EXPLICIT_KEEP = 3

/** Number of qubits n for a statevector of length 2ⁿ; throws if it is not a power of two. */
function qubitCount(state: StateVector): number {
  const n = Math.log2(state.length)
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`State has ${state.length} amplitudes, expected 2^n with n ≥ 1`)
  }
  return n
}

/**
 * Check `keep` and return it sorted ascending. Throws a clear error for an empty set,
 * non-integers, out-of-range qubits or duplicates.
 */
export function normalizeKeep(keep: readonly number[], numQubits: number): number[] {
  if (!Array.isArray(keep) || keep.length === 0) {
    throw new Error('Keep at least one qubit')
  }
  for (const q of keep) {
    if (!Number.isInteger(q) || q < 0 || q >= numQubits) {
      throw new Error(`Qubit ${q} is out of range for ${numQubits} qubit(s)`)
    }
  }
  const sorted = [...keep].sort((x, y) => x - y)
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1]) throw new Error(`Qubit ${sorted[i]} is listed twice`)
  }
  return sorted
}

/**
 * The split of every full basis index i into (kept bits a, rest bits r):
 *   indexOf[a][r] = i.
 * Both a and r are read big-endian (lowest qubit number = most significant bit).
 */
interface IndexSplit {
  keptCount: number
  restCount: number
  indexOf: number[][]
}

function splitIndices(numQubits: number, keep: number[]): IndexSplit {
  const kept = new Set(keep)
  const keptCount = 1 << keep.length
  const restCount = 1 << (numQubits - keep.length)
  const indexOf: number[][] = Array.from({ length: keptCount }, () => new Array(restCount))

  for (let i = 0; i < 1 << numQubits; i++) {
    let a = 0
    let r = 0
    // Walk the qubits q0 … q(n−1) from the most significant bit down, appending each bit
    // to whichever part (kept or rest) the qubit belongs to.
    for (let q = 0; q < numQubits; q++) {
      const bit = (i >> (numQubits - 1 - q)) & 1
      if (kept.has(q)) a = (a << 1) | bit
      else r = (r << 1) | bit
    }
    indexOf[a][r] = i
  }
  return { keptCount, restCount, indexOf }
}

function zeroMatrix(size: number): ComplexMatrix {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => complex(0)))
}

/**
 * Reduced density matrix of the kept qubits (direct method, from amplitudes).
 * n is inferred from state.length = 2ⁿ. `keep` must be distinct, in range and non-empty;
 * the result's basis is big-endian over `keep` sorted ascending. Size 2^k × 2^k.
 */
export function reducedDensityMatrixSubset(state: StateVector, keep: number[]): ComplexMatrix {
  const n = qubitCount(state)
  const sorted = normalizeKeep(keep, n)
  const { keptCount, restCount, indexOf } = splitIndices(n, sorted)
  const rho = zeroMatrix(keptCount)
  // ρ_K[a][b] = Σ_r ψ(a, r) · conj(ψ(b, r)): for each value r of the traced-out qubits,
  // add the outer product of the "slice" of amplitudes with that r.
  for (let r = 0; r < restCount; r++) {
    for (let a = 0; a < keptCount; a++) {
      const psiA = state[indexOf[a][r]]
      if (psiA.re === 0 && psiA.im === 0) continue // adds nothing to row a
      for (let b = 0; b < keptCount; b++) {
        rho[a][b] = add(rho[a][b], mul(psiA, conj(state[indexOf[b][r]])))
      }
    }
  }
  return rho
}

/**
 * Eigenvalues of a real symmetric matrix by the cyclic Jacobi method.
 *
 * Idea: repeatedly pick an off-diagonal entry m[p][q] and rotate rows/columns p and q by
 * the angle that makes it zero. Each rotation keeps the eigenvalues and moves "weight"
 * from the off-diagonal onto the diagonal; after a few sweeps over all pairs the matrix
 * is diagonal and the diagonal holds the eigenvalues. Slow-ish (O(m³) per sweep) but
 * simple and very accurate, and m ≤ 128 here.
 */
function symmetricEigenvalues(input: number[][]): number[] {
  const m = input.length
  const a = input.map((row) => [...row])
  const MAX_SWEEPS = 100
  let scale = 0
  for (const row of a) for (const v of row) scale += v * v
  const tolerance = 1e-30 * Math.max(scale, 1e-300)

  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let off = 0
    for (let p = 0; p < m; p++) for (let q = p + 1; q < m; q++) off += a[p][q] * a[p][q]
    if (off <= tolerance) break

    for (let p = 0; p < m - 1; p++) {
      for (let q = p + 1; q < m; q++) {
        const apq = a[p][q]
        if (apq === 0) continue
        // Rotation angle that zeroes a[p][q] (numerically stable form, Numerical Recipes).
        const theta = (a[q][q] - a[p][p]) / (2 * apq)
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < m; k++) {
          // Rotate columns p and q …
          const akp = a[k][p]
          const akq = a[k][q]
          a[k][p] = c * akp - s * akq
          a[k][q] = s * akp + c * akq
        }
        for (let k = 0; k < m; k++) {
          // … then rows p and q.
          const apk = a[p][k]
          const aqk = a[q][k]
          a[p][k] = c * apk - s * aqk
          a[q][k] = s * apk + c * aqk
        }
      }
    }
  }
  return a.map((row, i) => row[i])
}

/**
 * Eigenvalues of a Hermitian matrix ρ = A + iB (A = real parts, B = imaginary parts).
 *
 * Trick: the REAL symmetric 2d × 2d matrix
 *     M = [[A, −B],
 *          [B,  A]]
 * has exactly the eigenvalues of ρ, each one TWICE. (If ρ(u + iv) = λ(u + iv) with real
 * u, v, then M·[u; v] = λ[u; v] and M·[−v; u] = λ[−v; u]: two independent eigenvectors per
 * eigenvalue.) M is symmetric because A is symmetric and B is antisymmetric for a
 * Hermitian ρ, so a plain real-symmetric solver works. Returned list has 2d values.
 */
function hermitianEigenvaluesDoubled(rho: ComplexMatrix): number[] {
  const d = rho.length
  const m: number[][] = Array.from({ length: 2 * d }, () => new Array(2 * d).fill(0))
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) {
      // Symmetrise to wash out rounding noise (ρ is Hermitian in exact arithmetic).
      const re = (rho[i][j].re + rho[j][i].re) / 2
      const im = (rho[i][j].im - rho[j][i].im) / 2
      m[i][j] = re
      m[i + d][j + d] = re
      m[i][j + d] = -im
      m[i + d][j] = im
    }
  }
  return symmetricEigenvalues(m)
}

/** Eigenvalues below this are rounding noise around 0 (a valid ρ has none < 0). */
const EIGENVALUE_EPS = 1e-12

/**
 * Von Neumann entropy S(ρ) = −Tr(ρ log₂ ρ) = −Σ λᵢ log₂ λᵢ over the eigenvalues λᵢ of ρ,
 * in bits (0·log 0 = 0). 0 for a pure state, k for a maximally mixed k-qubit state.
 */
export function vonNeumannEntropy(rho: ComplexMatrix): number {
  if (rho.length === 0 || rho.some((row) => row.length !== rho.length)) {
    throw new Error('vonNeumannEntropy: ρ must be a non-empty square matrix')
  }
  const doubled = hermitianEigenvaluesDoubled(rho)
  let sum = 0
  for (const raw of doubled) {
    // Tiny negative (or tiny positive) eigenvalues are floating-point noise: treat as 0,
    // and 0 · log 0 = 0 (the limit of x log x as x → 0).
    const lambda = raw < EIGENVALUE_EPS ? 0 : raw
    if (lambda > 0) sum -= lambda * Math.log2(lambda)
  }
  // Every eigenvalue appeared twice in the doubled list.
  const entropy = sum / 2
  return entropy < EIGENVALUE_EPS ? 0 : entropy
}

/**
 * Full subset result for the teaching views: reduced ρ, purity, entropy and, when
 * `explicit` is true, the textbook steps (full ρ + per-entry sums).
 *
 * The steps (`entries` and `fullRho`) are only built when explicit is true AND at most
 * MAX_EXPLICIT_KEEP qubits are kept; otherwise both are null.
 */
export function partialTraceSubset(
  state: StateVector,
  keep: number[],
  explicit: boolean,
): SubsetTraceResult {
  const n = qubitCount(state)
  const sorted = normalizeKeep(keep, n)
  const reduced = reducedDensityMatrixSubset(state, sorted)
  const result: SubsetTraceResult = {
    numQubits: n,
    keep: sorted,
    reduced,
    purity: purity(reduced),
    entropy: vonNeumannEntropy(reduced),
    entries: null,
    fullRho: null,
  }
  if (!explicit || sorted.length > MAX_EXPLICIT_KEEP) return result

  // EXPLICIT (textbook) method: build ρ = |ψ⟩⟨ψ|, then for every reduced entry (row a,
  // column b) list the full-ρ entries ρ[(a, r)][(b, r)] that get summed, for every value r
  // of the traced-out qubits.
  const fullRho = densityMatrix(state)
  const { keptCount, restCount, indexOf } = splitIndices(n, sorted)
  const entries: SubsetTraceEntry[] = []
  for (let a = 0; a < keptCount; a++) {
    for (let b = 0; b < keptCount; b++) {
      const terms: TraceTerm[] = []
      let sum: Complex = complex(0)
      for (let r = 0; r < restCount; r++) {
        const row = indexOf[a][r]
        const col = indexOf[b][r]
        const value = fullRho[row][col]
        terms.push({ row, col, value })
        sum = add(sum, value)
      }
      entries.push({ row: a, col: b, terms, sum })
    }
  }
  return { ...result, entries, fullRho }
}
