// Preset circuits shown in the sidebar.
import type { Circuit, GateType } from './types'

export interface Preset {
  id: string
  name: string
  /** One or two plain, technical sentences: what the state is and what the spheres show. */
  description: string
  circuit: Circuit
}

type Step = [gate: GateType, column: number, qubits: number[], angle?: number]

function build(id: string, numQubits: number, steps: Step[]): Circuit {
  return {
    numQubits,
    operations: steps.map(([gate, column, qubits, angle], i) => ({
      id: `${id}-${i}`,
      gate,
      column,
      qubits,
      ...(angle === undefined ? {} : { angle }),
    })),
  }
}

/** Ry angle that maps |0⟩ to √(1/3)|0⟩ + √(2/3)|1⟩, i.e. cos(θ/2) = 1/√3. */
const W_THETA = 2 * Math.acos(1 / Math.sqrt(3))

export const PRESETS: Preset[] = [
  {
    id: 'plus',
    name: 'Superposition |+⟩',
    description: 'H on a single qubit. Pure state on the +x axis of the sphere.',
    circuit: build('plus', 1, [['H', 0, [0]]]),
  },
  {
    id: 'bell',
    name: 'Bell state Φ⁺',
    description:
      '(|00⟩ + |11⟩)/√2. Each qubit alone is maximally mixed: both Bloch vectors shrink to the centre.',
    circuit: build('bell', 2, [
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ]),
  },
  {
    id: 'ghz3',
    name: 'GHZ (3 qubits)',
    description: '(|000⟩ + |111⟩)/√2. All three reduced states are maximally mixed (r = 0).',
    circuit: build('ghz3', 3, [
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
      ['CX', 2, [1, 2]],
    ]),
  },
  {
    id: 'w3',
    name: 'W state (3 qubits)',
    description:
      '(|100⟩ + |010⟩ + |001⟩)/√3. Partially mixed: each vector points along +z with length 1/3.',
    // Ry(θ) puts weight 2/3 on q0 = 1. The Ry/CX/Ry/CX block is a controlled-Ry(π/2)
    // on q1 (splits that weight in half). The final CXs and X shuffle it into W form.
    circuit: build('w3', 3, [
      ['RY', 0, [0], W_THETA],
      ['RY', 0, [1], Math.PI / 4],
      ['CX', 1, [0, 1]],
      ['RY', 2, [1], -Math.PI / 4],
      ['CX', 3, [0, 1]],
      ['CX', 4, [1, 2]],
      ['CX', 5, [0, 1]],
      ['X', 6, [0]],
    ]),
  },
  {
    id: 'product',
    name: 'Product state |+⟩|1⟩|i⟩',
    description:
      'No entanglement: each qubit stays on the sphere surface, pointing to +x, −z and +y.',
    circuit: build('product', 3, [
      ['H', 0, [0]],
      ['X', 0, [1]],
      ['H', 0, [2]],
      ['S', 1, [2]],
    ]),
  },
]

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}
