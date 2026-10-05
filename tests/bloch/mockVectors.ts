// Reusable per-qubit analysis fixtures for the Bloch UI tests (hand-made, not engine output).
import type { BlochVector, QubitAnalysis } from '../../src/engine/types'

/** Build a QubitAnalysis from a Bloch vector: |r| and purity = (1 + |r|²) / 2 follow from r. */
export function mockQubit(qubit: number, bloch: BlochVector): QubitAnalysis {
  const length = Math.hypot(bloch.x, bloch.y, bloch.z)
  // ρ = (I + r·σ) / 2 written out entry by entry.
  const rho = [
    [
      { re: (1 + bloch.z) / 2, im: 0 },
      { re: bloch.x / 2, im: -bloch.y / 2 },
    ],
    [
      { re: bloch.x / 2, im: bloch.y / 2 },
      { re: (1 - bloch.z) / 2, im: 0 },
    ],
  ]
  return {
    qubit,
    rho,
    bloch,
    length,
    purity: (1 + length * length) / 2,
    entangled: length < 1 - 1e-9,
  }
}

export const VECTORS = {
  /** |0⟩: north pole. */
  zero: { x: 0, y: 0, z: 1 },
  /** |+⟩ = (|0⟩ + |1⟩)/√2: +x. */
  plus: { x: 1, y: 0, z: 0 },
  /** |i⟩ = (|0⟩ + i|1⟩)/√2: +y. */
  plusI: { x: 0, y: 1, z: 0 },
  /** One half of a Bell pair: maximally mixed, r = 0. */
  maximallyMixed: { x: 0, y: 0, z: 0 },
  /** One qubit of the 3-qubit W state: partially mixed, r = (0, 0, 1/3). */
  wLike: { x: 0, y: 0, z: 1 / 3 },
} satisfies Record<string, BlochVector>
