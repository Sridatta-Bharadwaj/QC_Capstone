// Pure formatting helpers for the teaching views (Density Matrices, Partial Trace Steps,
// status bar). No React here, so everything is easy to unit-test.
import type { Complex, ComplexMatrix } from '../../engine/types'

/**
 * Largest n for which the full 2ⁿ×2ⁿ ρ = |ψ⟩⟨ψ| is drawn (16×16 at n = 4).
 * Past this the matrix is 32×32 or 64×64: correct, but unreadable on a slide.
 */
export const MAX_DISPLAY_QUBITS = 4

/**
 * Most kept qubits for which a subset-reduced ρ is drawn (8×8 at 3 qubits), V2-7.
 * Equals the engine's MAX_EXPLICIT_KEEP, so the textbook steps exist whenever ρ is drawn.
 */
export const MAX_DISPLAY_KEPT = 3

/** Below this magnitude a number is treated as zero (floating-point noise). */
export const ZERO_EPS = 1e-9

/** Typographic minus sign (U+2212): lines up with "+" in a mono font. */
export const MINUS = '−'

/** |z| ≤ ZERO_EPS on both parts. */
export function isZero(z: Complex, eps = ZERO_EPS): boolean {
  return Math.abs(z.re) <= eps && Math.abs(z.im) <= eps
}

/** |z| = √(re² + im²). */
export function magnitude(z: Complex): number {
  return Math.hypot(z.re, z.im)
}

/** Fixed decimals with a real minus sign; never prints "−0.000". */
export function formatReal(value: number, digits = 3): string {
  const text = Math.abs(value).toFixed(digits)
  const roundsToZero = Number(text) === 0
  return value < 0 && !roundsToZero ? `${MINUS}${text}` : text
}

/**
 * Complex number as text, 3 decimals by default:
 *   0.500   0.354 − 0.354i   −0.500i   0.000
 * A part that rounds to zero is left out (unless both do, then "0.000").
 */
export function formatComplex(z: Complex, digits = 3): string {
  const reText = Math.abs(z.re).toFixed(digits)
  const imText = Math.abs(z.im).toFixed(digits)
  const hasRe = Number(reText) !== 0
  const hasIm = Number(imText) !== 0

  if (!hasRe && !hasIm) return (0).toFixed(digits)
  if (!hasIm) return formatReal(z.re, digits)
  if (!hasRe) return `${z.im < 0 ? MINUS : ''}${imText}i`
  return `${formatReal(z.re, digits)} ${z.im < 0 ? MINUS : '+'} ${imText}i`
}

/** Small numbers like a max difference: "1.2e−16" (real minus), or "0" when exactly zero. */
export function formatScientific(value: number): string {
  if (value === 0) return '0'
  return value.toExponential(1).replace(/-/g, MINUS)
}

/**
 * Bits of a basis index, big-endian: index i ↔ |q0 q1 … q(n−1)⟩, so qubit 0 is the
 * most significant bit. Example: basisBits(1, 2) = [0, 1] = |01⟩.
 */
export function basisBits(index: number, numQubits: number): (0 | 1)[] {
  return Array.from({ length: numQubits }, (_, k) => ((index >> (numQubits - 1 - k)) & 1) as 0 | 1)
}

/** "|01⟩" for index 1 of 2 qubits. */
export function basisLabel(index: number, numQubits: number): string {
  return `|${basisBits(index, numQubits).join('')}⟩`
}

/** One character of a ket label, flagged when it is the bit of the highlighted qubit. */
export interface BasisPart {
  bit: 0 | 1
  qubit: number
  highlighted: boolean
}

/** One qubit, a list of qubits (the kept set), or none. */
export type QubitHighlight = number | readonly number[] | null

/** True when `qubit` is (one of) the highlighted qubit(s). */
export function isHighlighted(qubit: number, highlight: QubitHighlight): boolean {
  if (highlight === null) return false
  return typeof highlight === 'number' ? qubit === highlight : highlight.includes(qubit)
}

/** Ket bits with the highlighted qubit(s)' bits flagged, for drawing them emphasised. */
export function basisParts(
  index: number,
  numQubits: number,
  highlight: QubitHighlight,
): BasisPart[] {
  return basisBits(index, numQubits).map((bit, qubit) => ({
    bit,
    qubit,
    highlighted: isHighlighted(qubit, highlight),
  }))
}

const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉'

/** 12 → "₁₂" (for ρ₀₁, q₃ and so on). */
export function subscript(value: number | string): string {
  return String(value).replace(/[0-9]/g, (d) => SUBSCRIPT_DIGITS[Number(d)])
}

/** Largest |a[i][j] − b[i][j]| over all entries (the direct-vs-explicit check). */
export function maxAbsDifference(a: ComplexMatrix, b: ComplexMatrix): number {
  let max = 0
  a.forEach((row, i) =>
    row.forEach((z, j) => {
      const w = b[i]?.[j]
      const diff = w ? Math.hypot(z.re - w.re, z.im - w.im) : Infinity
      if (diff > max) max = diff
    }),
  )
  return max
}

/**
 * Bloch vector read straight off a 2×2 ρ:
 *   x = 2·Re ρ₀₁,  y = −2·Im ρ₀₁,  z = ρ₀₀ − ρ₁₁.
 * (Same numbers as Tr(ρX), Tr(ρY), Tr(ρZ); written this way so the matrix → vector
 * step is visible.)
 */
export function blochFromRho(rho: ComplexMatrix): { x: number; y: number; z: number } {
  return {
    x: 2 * rho[0][1].re,
    y: -2 * rho[0][1].im,
    z: rho[0][0].re - rho[1][1].re,
  }
}

/** "q0, q2" — or null when the list is empty. */
export function qubitList(qubits: number[]): string | null {
  return qubits.length === 0 ? null : qubits.map((q) => `q${q}`).join(', ')
}

/** Key for a matrix cell in a Set: "row,col". */
export function cellKey(row: number, col: number): string {
  return `${row},${col}`
}

/** The qubits not in `keep`, for n qubits. */
export function tracedOut(numQubits: number, keep: readonly number[]): number[] {
  return Array.from({ length: numQubits }, (_, q) => q).filter((q) => !keep.includes(q))
}

/** "|q0 q2⟩": how the basis states of the kept qubits are written. */
export function keptKetLabel(keep: readonly number[]): string {
  return `|${keep.map((q) => `q${q}`).join(' ')}⟩`
}
