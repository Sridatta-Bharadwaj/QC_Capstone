// Export the engine's results for a large set of circuits to JSON, so that
// verify/verify.py can rebuild the same circuits in Qiskit and compare.
//
// Run: npx tsx verify/export-engine.ts   (or: npm run verify:export)
// Output: verify/out/engine_results.json (gitignored)
//
// For every circuit we store:
//   - the circuit itself (same JSON shape as the app's model: numQubits + operations)
//   - the engine's statevector (BIG-endian: qubit 0 = most significant bit of the index)
//   - per qubit: reduced density matrix ρₖ (direct method), Bloch vector, purity
// Complex numbers are written as [re, im] pairs of plain numbers.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { analyze, type Complex } from '../src/engine'
import { defaultInitialStates, earliestFreeColumn } from '../src/model/circuit'
import { PRESETS } from '../src/model/presets'
import { MAX_QUBITS, type Circuit, type GateType, type Operation } from '../src/model/types'

interface TestCase {
  category: string
  name: string
  circuit: Circuit
}

/** One gate written as [gate, column, qubits, angle?]. */
type Step = [gate: GateType, column: number, qubits: number[], angle?: number]

function build(numQubits: number, steps: Step[]): Circuit {
  return {
    numQubits,
    initialStates: defaultInitialStates(numQubits),
    operations: steps.map(([gate, column, qubits, angle], i) => ({
      id: `v${i}`,
      gate,
      column,
      qubits,
      ...(angle === undefined ? {} : { angle }),
    })),
  }
}

/** Deterministic PRNG (mulberry32), same as tests/engine/helpers.ts, so runs are reproducible. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const PI = Math.PI
const FIXED_SINGLE: GateType[] = ['I', 'H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg']
const ROTATIONS: GateType[] = ['RX', 'RY', 'RZ']
const ANGLES = [0, PI / 6, PI / 4, PI / 3, PI / 2, PI, (3 * PI) / 2, 2 * PI, -PI / 3, -2.5, 1.234]

// ---------------------------------------------------------------------------
// Fixed, hand-picked circuits with well-known answers.
// ---------------------------------------------------------------------------
function fixedCases(): TestCase[] {
  const cases: TestCase[] = []
  const add = (category: string, name: string, circuit: Circuit) =>
    cases.push({ category, name, circuit })

  // Presets shown in the app sidebar.
  for (const p of PRESETS) add('presets', p.id, p.circuit)

  // The six cardinal single-qubit states.
  add('single-qubit states', '|0>', build(1, []))
  add('single-qubit states', '|1>', build(1, [['X', 0, [0]]]))
  add('single-qubit states', '|+>', build(1, [['H', 0, [0]]]))
  add(
    'single-qubit states',
    '|->',
    build(1, [
      ['X', 0, [0]],
      ['H', 1, [0]],
    ]),
  )
  add(
    'single-qubit states',
    '|i>',
    build(1, [
      ['H', 0, [0]],
      ['S', 1, [0]],
    ]),
  )
  add(
    'single-qubit states',
    '|-i>',
    build(1, [
      ['H', 0, [0]],
      ['Sdg', 1, [0]],
    ]),
  )

  // The four Bell states.
  add(
    'bell states',
    'Phi+',
    build(2, [
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ]),
  )
  add(
    'bell states',
    'Phi-',
    build(2, [
      ['H', 0, [0]],
      ['Z', 1, [0]],
      ['CX', 2, [0, 1]],
    ]),
  )
  add(
    'bell states',
    'Psi+',
    build(2, [
      ['H', 0, [0]],
      ['X', 0, [1]],
      ['CX', 1, [0, 1]],
    ]),
  )
  add(
    'bell states',
    'Psi-',
    build(2, [
      ['H', 0, [0]],
      ['X', 0, [1]],
      ['Z', 1, [0]],
      ['CX', 2, [0, 1]],
    ]),
  )

  // GHZ on 3..6 qubits: H then a CX chain.
  for (let n = 3; n <= MAX_QUBITS; n++) {
    const steps: Step[] = [['H', 0, [0]]]
    for (let k = 1; k < n; k++) steps.push(['CX', k, [k - 1, k]])
    add('ghz', `GHZ-${n}`, build(n, steps))
  }

  // Every fixed single-qubit gate on its own: on |0>, on a generic state, and on
  // qubit 1 of a 3-qubit register (this catches qubit-ordering mistakes).
  for (const g of FIXED_SINGLE) {
    add('single gates', `${g} on |0>`, build(1, [[g, 0, [0]]]))
    add(
      'single gates',
      `${g} on generic state`,
      build(1, [
        ['RY', 0, [0], 1.1],
        ['RZ', 1, [0], 0.7],
        [g, 2, [0]],
      ]),
    )
    add(
      'single gates',
      `${g} on q1 of 3`,
      build(3, [
        ['RY', 0, [0], 0.4],
        ['RY', 0, [1], 1.1],
        ['RX', 1, [1], 0.3],
        [g, 2, [1]],
      ]),
    )
  }

  // Rotations at several angles, from |0> and from |+> (so RZ is not trivial).
  for (const g of ROTATIONS) {
    for (const a of ANGLES) {
      add('rotations', `${g}(${a.toFixed(4)}) on |0>`, build(1, [[g, 0, [0], a]]))
      add(
        'rotations',
        `${g}(${a.toFixed(4)}) on |+>`,
        build(1, [
          ['H', 0, [0]],
          [g, 1, [0], a],
        ]),
      )
    }
  }

  // CX in several control/target layouts, control in superposition.
  for (const [c, t, n] of [
    [0, 1, 2],
    [1, 0, 2],
    [0, 2, 3],
    [2, 0, 3],
    [1, 4, 5],
    [5, 0, 6],
  ]) {
    add(
      'cx',
      `CX[${c},${t}] n=${n}`,
      build(n, [
        ['H', 0, [c]],
        ['CX', 1, [c, t]],
      ]),
    )
  }

  // CZ: both qubits in |+>, so CZ entangles them. CZ is symmetric, test both orders.
  for (const [a, b, n] of [
    [0, 1, 2],
    [1, 0, 2],
    [0, 2, 3],
    [3, 1, 4],
  ]) {
    add(
      'cz',
      `CZ[${a},${b}] n=${n}`,
      build(n, [
        ['H', 0, [a]],
        ['H', 0, [b]],
        ['CZ', 1, [a, b]],
        ['H', 2, [b]],
      ]),
    )
  }

  // SWAP: put distinct, asymmetric states on the two qubits, then swap them.
  for (const [a, b, n] of [
    [0, 1, 2],
    [1, 0, 2],
    [0, 2, 3],
    [4, 1, 5],
  ]) {
    add(
      'swap',
      `SWAP[${a},${b}] n=${n}`,
      build(n, [
        ['X', 0, [a]],
        ['RY', 0, [b], 0.9],
        ['RZ', 1, [b], 0.5],
        ['SWAP', 2, [a, b]],
      ]),
    )
  }
  // SWAP of one half of a Bell pair: moves the entanglement to another qubit.
  add(
    'swap',
    'SWAP moves entanglement',
    build(3, [
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
      ['SWAP', 2, [1, 2]],
    ]),
  )

  // Toffoli: every control/target permutation on 3 qubits, controls in |+>.
  const perms3 = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ]
  for (const [c1, c2, t] of perms3) {
    add(
      'toffoli',
      `CCX[${c1},${c2},${t}] n=3`,
      build(3, [
        ['H', 0, [c1]],
        ['H', 0, [c2]],
        ['CCX', 1, [c1, c2, t]],
      ]),
    )
  }
  for (const [c1, c2, t, n] of [
    [0, 3, 1, 4],
    [4, 2, 0, 5],
    [1, 5, 3, 6],
  ]) {
    add(
      'toffoli',
      `CCX[${c1},${c2},${t}] n=${n}`,
      build(n, [
        ['H', 0, [c1]],
        ['RY', 0, [c2], 1.3],
        ['RX', 0, [t], 0.6],
        ['CCX', 1, [c1, c2, t]],
      ]),
    )
  }
  // Toffoli with both controls set: acts as X on the target.
  add(
    'toffoli',
    'CCX controls |11>',
    build(3, [
      ['X', 0, [0]],
      ['X', 0, [1]],
      ['CCX', 1, [0, 1, 2]],
    ]),
  )

  return cases
}

// ---------------------------------------------------------------------------
// Seeded random circuits.
// ---------------------------------------------------------------------------
const RANDOM_SEED = 20261006
const RANDOM_PER_SIZE = 40 // × 6 sizes = 240 circuits
const MAX_RANDOM_GATES = 24

function randomCases(): TestCase[] {
  const rand = mulberry32(RANDOM_SEED)
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
  const cases: TestCase[] = []

  for (let n = 1; n <= MAX_QUBITS; n++) {
    const allowed: GateType[] = [
      ...FIXED_SINGLE,
      ...ROTATIONS,
      ...(n >= 2 ? (['CX', 'CZ', 'SWAP'] as GateType[]) : []),
      ...(n >= 3 ? (['CCX'] as GateType[]) : []),
    ]
    for (let c = 0; c < RANDOM_PER_SIZE; c++) {
      const circuit: Circuit = {
        numQubits: n,
        initialStates: defaultInitialStates(n),
        operations: [],
      }
      const numGates = 1 + Math.floor(rand() * MAX_RANDOM_GATES)
      for (let g = 0; g < numGates; g++) {
        const gate = pick(allowed)
        const arity = gate === 'CCX' ? 3 : gate === 'CX' || gate === 'CZ' || gate === 'SWAP' ? 2 : 1
        // `arity` distinct random qubits, in random order (so controls can be above or below).
        const pool = Array.from({ length: n }, (_, i) => i)
        const qubits: number[] = []
        while (qubits.length < arity)
          qubits.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
        const op: Operation = {
          id: `r${n}-${c}-${g}`,
          gate,
          // Same auto-placement the app uses for code: gates on different wires
          // share columns, so the "sort by column, then lowest qubit" order matters.
          column: earliestFreeColumn(circuit, qubits),
          qubits,
        }
        if (ROTATIONS.includes(gate)) op.angle = (rand() * 2 - 1) * 2 * PI // [−2π, 2π)
        circuit.operations.push(op)
      }
      // The array order of operations is not meaningful (column defines time).
      // Shuffle it so both the engine and the Python side must sort by column.
      for (let i = circuit.operations.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        const tmp = circuit.operations[i]
        circuit.operations[i] = circuit.operations[j]
        circuit.operations[j] = tmp
      }
      cases.push({ category: `random n=${n}`, name: `random-${n}-${c}`, circuit })
    }
  }
  return cases
}

// ---------------------------------------------------------------------------
// Run the engine and write the JSON.
// ---------------------------------------------------------------------------
const pair = (z: Complex): [number, number] => [z.re, z.im]

const cases = [...fixedCases(), ...randomCases()]
const results = cases.map(({ category, name, circuit }) => {
  const analysis = analyze(circuit)
  return {
    category,
    name,
    circuit,
    state: analysis.state.map(pair),
    qubits: analysis.qubits.map((q) => ({
      qubit: q.qubit,
      rho: q.rho.map((row) => row.map(pair)),
      bloch: q.bloch,
      purity: q.purity,
    })),
  }
})

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'out')
mkdirSync(outDir, { recursive: true })
const outFile = join(outDir, 'engine_results.json')
writeFileSync(
  outFile,
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    ordering: 'big-endian (qubit 0 = most significant bit of the basis index)',
    randomSeed: RANDOM_SEED,
    circuits: results,
  }),
)
console.log(`Wrote ${results.length} circuits to ${outFile}`)
