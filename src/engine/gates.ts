// 2×2 matrices of the single-qubit gates.
//
// A single-qubit gate is a 2×2 unitary matrix U. It acts on a qubit state
// α|0⟩ + β|1⟩ (the column vector [α, β]) by matrix multiplication:
//   [α']   [u00 u01] [α]
//   [β'] = [u10 u11] [β]
// Multi-qubit gates (CX, CZ, CCX, SWAP) are not stored as matrices: the
// simulator applies them directly (see simulator.ts).
//
// Rotation conventions match Qiskit, so the M2 verification compares like with like.
import type { FixedSingleQubitGate, RotationGate } from '../model/types'
import { complex, expi } from './complex'
import type { ComplexMatrix } from './types'

const SQRT1_2 = Math.SQRT1_2 // 1/√2

const c = complex

/** Fixed (parameter-free) single-qubit gates. */
export const FIXED_GATES: Record<FixedSingleQubitGate, ComplexMatrix> = {
  // Identity: does nothing.
  I: [
    [c(1), c(0)],
    [c(0), c(1)],
  ],
  // Hadamard: |0⟩ → |+⟩ = (|0⟩+|1⟩)/√2, |1⟩ → |−⟩ = (|0⟩−|1⟩)/√2.
  H: [
    [c(SQRT1_2), c(SQRT1_2)],
    [c(SQRT1_2), c(-SQRT1_2)],
  ],
  // Pauli-X (NOT): swaps |0⟩ and |1⟩.
  X: [
    [c(0), c(1)],
    [c(1), c(0)],
  ],
  // Pauli-Y: |0⟩ → i|1⟩, |1⟩ → −i|0⟩.
  Y: [
    [c(0), c(0, -1)],
    [c(0, 1), c(0)],
  ],
  // Pauli-Z: leaves |0⟩ alone, flips the sign of |1⟩.
  Z: [
    [c(1), c(0)],
    [c(0), c(-1)],
  ],
  // Phase gates multiply the |1⟩ amplitude by e^{iφ}: S: φ = π/2 (i), T: φ = π/4.
  // The dagger (†) versions undo them with the opposite phase.
  S: [
    [c(1), c(0)],
    [c(0), c(0, 1)],
  ],
  Sdg: [
    [c(1), c(0)],
    [c(0), c(0, -1)],
  ],
  T: [
    [c(1), c(0)],
    [c(0), expi(Math.PI / 4)],
  ],
  Tdg: [
    [c(1), c(0)],
    [c(0), expi(-Math.PI / 4)],
  ],
}

/**
 * Rotation by angle θ (radians) about the x, y or z axis of the Bloch sphere.
 * Note the θ/2: a 2π rotation of the sphere is only −1 on the state vector.
 */
export function rotationGate(gate: RotationGate, theta: number): ComplexMatrix {
  const cos = Math.cos(theta / 2)
  const sin = Math.sin(theta / 2)
  switch (gate) {
    // Rx(θ) = [[cos θ/2, −i sin θ/2], [−i sin θ/2, cos θ/2]]
    case 'RX':
      return [
        [c(cos), c(0, -sin)],
        [c(0, -sin), c(cos)],
      ]
    // Ry(θ) = [[cos θ/2, −sin θ/2], [sin θ/2, cos θ/2]]  (all real)
    case 'RY':
      return [
        [c(cos), c(-sin)],
        [c(sin), c(cos)],
      ]
    // Rz(θ) = [[e^{−iθ/2}, 0], [0, e^{iθ/2}]]
    case 'RZ':
      return [
        [expi(-theta / 2), c(0)],
        [c(0), expi(theta / 2)],
      ]
  }
}
