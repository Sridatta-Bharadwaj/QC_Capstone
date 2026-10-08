// Preset circuits shown in the sidebar.
import { defaultInitialStates } from './circuit'
import type { Circuit, GateType, InitialState } from './types'

export interface Preset {
  id: string
  name: string
  /** One or two plain, technical sentences: what the state is and what the spheres show. */
  description: string
  circuit: Circuit
}

type Step = [gate: GateType, column: number, qubits: number[], angle?: number]

function build(
  id: string,
  numQubits: number,
  steps: Step[],
  initialStates: InitialState[] = defaultInitialStates(numQubits),
): Circuit {
  return {
    numQubits,
    initialStates,
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
    id: 'minus-h',
    name: '|−⟩ through H',
    description:
      'The wire starts in |−⟩ (−x). H swaps the x and z axes, so H|−⟩ = |1⟩: the vector ends on −z.',
    // Start state |−⟩ = (|0⟩ − |1⟩)/√2 (set by the picker, no gate). H|−⟩ = |1⟩ because
    // H maps |+⟩ ↔ |0⟩ and |−⟩ ↔ |1⟩.
    circuit: build('minus-h', 1, [['H', 0, [0]]], ['-']),
  },
  {
    id: 'kickback',
    name: 'Phase kickback',
    description:
      'Start in |+⟩|−⟩, apply CX. The target is unchanged, but the control flips from +x to −x: no entanglement, the phase "kicks back".',
    // CX|x⟩|−⟩ = (−1)^x |x⟩|−⟩ because X|−⟩ = −|−⟩. On |+⟩ = (|0⟩ + |1⟩)/√2 the sign lands on
    // the |1⟩ part of the control: (|0⟩ − |1⟩)/√2 = |−⟩. Result |−⟩|−⟩, a product state.
    circuit: build('kickback', 2, [['CX', 0, [0, 1]]], ['+', '-']),
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
  {
    id: 'partial',
    name: 'Partially entangled pair',
    description:
      'Ry(π/3) then CX: cos(π/6)|00⟩ + sin(π/6)|11⟩. Each qubit is partly mixed: r points along +z with length 0.5, purity 0.625.',
    // Ry(θ)|0⟩ = cos(θ/2)|0⟩ + sin(θ/2)|1⟩; the CX copies that bit onto q1. Each reduced
    // ρ is diag(cos²(θ/2), sin²(θ/2)), so z = cos θ = 0.5: between a product state (|r| = 1)
    // and a Bell state (|r| = 0).
    circuit: build('partial', 2, [
      ['RY', 0, [0], Math.PI / 3],
      ['CX', 1, [0, 1]],
    ]),
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
]

export function findPreset(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id)
}
