// Initial states in code (PLAN.md → V2-2): the marked block of preparation gates.
//  - codegen writes the block (and nothing when every wire is |0⟩);
//  - both parsers read it back into `initialStates` and never turn it into operations;
//  - every malformed block is a positioned error;
//  - round trips and cross-format equivalence with random initial states;
//  - physics: the prep gates, read as ordinary gates (markers removed), give exactly the state
//    the engine builds directly from `initialStates`.
import { describe, expect, it } from 'vitest'
import { toQasm, toQiskit } from '../../src/codegen'
import { PREP_SEQUENCES, stateForSequence } from '../../src/codegen/prep'
import { simulate } from '../../src/engine'
import { circuitsEqual, defaultInitialStates, earliestFreeColumn } from '../../src/model/circuit'
import { PRESETS } from '../../src/model/presets'
import {
  GATE_TYPES,
  GATES,
  INITIAL_STATES,
  type Circuit,
  type GateType,
  type InitialState,
  type Problem,
} from '../../src/model/types'
import { parseQasm } from '../../src/parser/qasm'
import { parseQiskit } from '../../src/parser/qiskit'
import { markerKind } from '../../src/parser/prepBlock'
import { mulberry32 } from '../engine/helpers'

function circuitWith(states: InitialState[], ops: Circuit['operations'] = []): Circuit {
  return { numQubits: states.length, initialStates: states, operations: ops }
}

function ok(result: { circuit: Circuit | null; problems: Problem[] }): Circuit {
  expect(result.problems).toEqual([])
  expect(result.circuit).not.toBeNull()
  return result.circuit as Circuit
}

function errorsOf(result: { circuit: Circuit | null; problems: Problem[] }): Problem[] {
  expect(result.circuit).toBeNull()
  const errors = result.problems.filter((p) => p.severity === 'error')
  expect(errors.length).toBeGreaterThan(0)
  return errors
}

const QASM_HEAD = 'OPENQASM 2.0;\ninclude "qelib1.inc";\n'
const qasm = (n: number, body: string) => `${QASM_HEAD}qreg q[${n}];\n${body}`
const qiskit = (n: number, body: string) =>
  `from qiskit import QuantumCircuit\nqc = QuantumCircuit(${n})\n${body}`

/** The two languages, so every parser case runs for both. */
const LANGS = [
  {
    name: 'QASM',
    program: qasm,
    parse: (text: string) => parseQasm(text),
    gate: (name: string, q: number) => `${name} q[${q}];`,
    two: (name: string, a: number, b: number) => `${name} q[${a}],q[${b}];`,
    begin: '// initial states',
    end: '// end initial states',
    other: 'barrier q[0];',
    /** Line of the first body line (after header, include, qreg). */
    firstBodyLine: 4,
  },
  {
    name: 'Qiskit',
    program: qiskit,
    parse: (text: string) => parseQiskit(text),
    gate: (name: string, q: number) => `qc.${name}(${q})`,
    two: (name: string, a: number, b: number) => `qc.${name}(${a}, ${b})`,
    begin: '# initial states',
    end: '# end initial states',
    other: 'print(qc)',
    firstBodyLine: 3,
  },
] as const

const NAMES: Record<string, string> = { X: 'x', H: 'h', S: 's', Sdg: 'sdg' }

// ---------------------------------------------------------------------------

describe('prep sequences', () => {
  it('match the spec: |1⟩ = x, |+⟩ = h, |−⟩ = x h, |i⟩ = h s, |−i⟩ = h sdg', () => {
    expect(PREP_SEQUENCES).toEqual({
      '0': [],
      '1': ['X'],
      '+': ['H'],
      '-': ['X', 'H'],
      i: ['H', 'S'],
      '-i': ['H', 'Sdg'],
    })
    for (const state of INITIAL_STATES) {
      if (state !== '0') expect(stateForSequence(PREP_SEQUENCES[state])).toBe(state)
    }
    expect(stateForSequence(['S', 'H'])).toBeNull()
    expect(stateForSequence([])).toBeNull()
  })

  it('recognises markers regardless of case and spacing, and nothing else', () => {
    expect(markerKind('// initial states')).toBe('begin')
    expect(markerKind('#   Initial   States  ')).toBe('begin')
    expect(markerKind('// END initial states')).toBe('end')
    expect(markerKind('# initial state')).toBeNull()
    expect(markerKind('// initial states: q0')).toBeNull()
  })
})

describe('codegen: the initial states block', () => {
  it('writes no block when every wire starts in |0⟩ (v1 output unchanged)', () => {
    const c = circuitWith(['0', '0'], [{ id: 'a', gate: 'H', column: 0, qubits: [0] }])
    expect(toQasm(c)).toBe(`${QASM_HEAD}\nqreg q[2];\n\nh q[0];\n`)
    expect(toQasm(c)).not.toMatch(/initial states/)
    expect(toQiskit(c)).not.toMatch(/initial states/)
  })

  const expected: [InitialState, string[]][] = [
    ['1', ['x']],
    ['+', ['h']],
    ['-', ['x', 'h']],
    ['i', ['h', 's']],
    ['-i', ['h', 'sdg']],
  ]

  it.each(expected)('|%s⟩ → %j in both languages', (state, gates) => {
    const c = circuitWith(['0', state])
    expect(toQasm(c)).toBe(
      `${QASM_HEAD}\nqreg q[2];\n\n// initial states\n` +
        gates.map((g) => `${g} q[1];\n`).join('') +
        '// end initial states\n',
    )
    expect(toQiskit(c)).toContain(
      'qc = QuantumCircuit(2)\n# initial states\n' +
        gates.map((g) => `qc.${g}(1)\n`).join('') +
        '# end initial states\n',
    )
  })

  it('writes qubits in order, each qubit together, then the circuit after a blank line', () => {
    const c = circuitWith(['-', '0', 'i'], [{ id: 'a', gate: 'CX', column: 0, qubits: [0, 1] }])
    expect(toQasm(c)).toBe(
      `${QASM_HEAD}\nqreg q[3];\n\n// initial states\nx q[0];\nh q[0];\nh q[2];\ns q[2];\n` +
        '// end initial states\n\ncx q[0],q[1];\n',
    )
    expect(toQiskit(c)).toContain(
      '# initial states\nqc.x(0)\nqc.h(0)\nqc.h(2)\nqc.s(2)\n# end initial states\nqc.cx(0, 1)\n',
    )
  })
})

describe.each(LANGS)('$name parser: valid blocks', (lang) => {
  const block = (lines: string[]) => [lang.begin, ...lines, lang.end].join('\n') + '\n'

  it.each(INITIAL_STATES.filter((s) => s !== '0'))('reads |%s⟩ and adds no operation', (state) => {
    const gates = PREP_SEQUENCES[state].map((g) => lang.gate(NAMES[g], 1))
    const c = ok(lang.parse(lang.program(2, block(gates))))
    expect(c.initialStates).toEqual(['0', state])
    expect(c.operations).toEqual([])
  })

  it('places the circuit gates from column 0, after the block', () => {
    const c = ok(lang.parse(lang.program(2, block([lang.gate('h', 0)]) + lang.gate('x', 0) + '\n')))
    expect(c.initialStates).toEqual(['+', '0'])
    expect(c.operations).toHaveLength(1)
    expect(c.operations[0]).toMatchObject({ gate: 'X', column: 0, qubits: [0] })
  })

  it('accepts interleaved qubits (gates on different qubits commute) and other comments', () => {
    const lines = [
      lang.gate('h', 0),
      lang.gate('x', 1),
      lang.name === 'QASM' ? '// q0 becomes |i>' : '# q0 becomes |i>',
      '',
      lang.gate('s', 0),
      lang.gate('h', 1),
    ]
    const c = ok(lang.parse(lang.program(3, block(lines))))
    expect(c.initialStates).toEqual(['i', '-', '0'])
  })

  it('an empty block is fine (all |0⟩)', () => {
    const c = ok(lang.parse(lang.program(2, block([]))))
    expect(c.initialStates).toEqual(['0', '0'])
  })

  it('without the markers the same gates are ordinary operations', () => {
    const c = ok(lang.parse(lang.program(1, `${lang.gate('x', 0)}\n${lang.gate('h', 0)}\n`)))
    expect(c.initialStates).toEqual(['0'])
    expect(c.operations.map((o) => o.gate)).toEqual(['X', 'H'])
  })
})

describe('Qiskit parser: list form inside the block', () => {
  it('qc.h([0, 1]) prepares |+⟩ on both qubits', () => {
    const c = ok(parseQiskit(qiskit(2, '# initial states\nqc.h([0, 1])\n# end initial states\n')))
    expect(c.initialStates).toEqual(['+', '+'])
  })
})

describe.each(LANGS)('$name parser: invalid blocks are positioned errors', (lang) => {
  const L = lang.firstBodyLine
  const program = (n: number, lines: string[]) => lang.program(n, lines.join('\n') + '\n')

  it('a gate that is not a preparation gate', () => {
    const [e] = errorsOf(lang.parse(program(1, [lang.begin, lang.gate('y', 0), lang.end])))
    expect(e.message).toMatch(/not a preparation gate/)
    expect(e).toMatchObject({ line: L + 1, column: 1 })
  })

  it('a rotation inside the block', () => {
    const rz = lang.name === 'QASM' ? 'rz(pi/2) q[0];' : 'qc.rz(pi/2, 0)'
    const [e] = errorsOf(lang.parse(program(1, [lang.begin, rz, lang.end])))
    expect(e.message).toMatch(/not a preparation gate/)
    expect(e.line).toBe(L + 1)
  })

  it('the wrong order (s then h)', () => {
    const [e] = errorsOf(
      lang.parse(program(1, [lang.begin, lang.gate('s', 0), lang.gate('h', 0), lang.end])),
    )
    expect(e.message).toMatch(/is not a preparation sequence/)
    // Underlines from the first to the last gate of that qubit.
    expect(e).toMatchObject({ line: L + 1, column: 1, endLine: L + 2 })
  })

  it.each([
    ['x', 'x'],
    ['h', 'h'],
    ['x', 'h', 'x'],
  ])('a qubit prepared twice (%s, %s …)', (...gates) => {
    const lines = gates.map((g) => lang.gate(g, 0))
    const [e] = errorsOf(lang.parse(program(1, [lang.begin, ...lines, lang.end])))
    expect(e.message).toMatch(/prepared more than once/)
  })

  it('a multi-qubit gate', () => {
    const [e] = errorsOf(lang.parse(program(2, [lang.begin, lang.two('cx', 0, 1), lang.end])))
    expect(e.message).toMatch(/acts on 2 qubits/)
    expect(e.line).toBe(L + 1)
  })

  it('an unterminated block', () => {
    const [e] = errorsOf(lang.parse(program(1, [lang.begin, lang.gate('x', 0)])))
    expect(e.message).toMatch(/Unterminated initial states block/)
    expect(e).toMatchObject({ line: L, column: 1, endColumn: lang.begin.length + 1 })
  })

  it('an end marker without a begin', () => {
    const [e] = errorsOf(lang.parse(program(1, [lang.gate('x', 0), lang.end])))
    expect(e.message).toMatch(/no matching/)
    expect(e.line).toBe(L + 1)
  })

  it('a second begin before the end', () => {
    const errors = errorsOf(
      lang.parse(program(1, [lang.begin, lang.begin, lang.gate('x', 0), lang.end])),
    )
    expect(errors.some((e) => /again before/.test(e.message) && e.line === L + 1)).toBe(true)
  })

  it('two blocks', () => {
    const errors = errorsOf(
      lang.parse(
        program(2, [
          lang.begin,
          lang.gate('x', 0),
          lang.end,
          lang.begin,
          lang.gate('x', 1),
          lang.end,
        ]),
      ),
    )
    expect(errors.some((e) => /Only one initial states block/.test(e.message))).toBe(true)
  })

  it('a block after the first gate', () => {
    const errors = errorsOf(
      lang.parse(program(2, [lang.gate('h', 1), lang.begin, lang.gate('x', 0), lang.end])),
    )
    expect(errors[0].message).toMatch(/before the first gate/)
    expect(errors[0].line).toBe(L + 1)
  })

  it('another statement inside the block', () => {
    const errors = errorsOf(
      lang.parse(program(1, [lang.begin, lang.gate('x', 0), lang.other, lang.end])),
    )
    expect(errors.some((e) => e.line === L + 2)).toBe(true)
  })

  it('an out-of-range qubit inside the block is still reported', () => {
    const errors = errorsOf(lang.parse(program(1, [lang.begin, lang.gate('x', 3), lang.end])))
    expect(errors[0].message).toMatch(/out of range/)
  })
})

describe('block before the register', () => {
  it('QASM: markers before qreg', () => {
    const text = `${QASM_HEAD}// initial states\n// end initial states\nqreg q[1];\n`
    const errors = errorsOf(parseQasm(text))
    expect(errors[0].message).toMatch(/right after the register declaration/)
    expect(errors[0].line).toBe(3)
  })

  it('Qiskit: markers before QuantumCircuit(n)', () => {
    const text = '# initial states\n# end initial states\nqc = QuantumCircuit(1)\n'
    const errors = errorsOf(parseQiskit(text))
    expect(errors[0].message).toMatch(/right after the circuit is created/)
    expect(errors[0]).toMatchObject({ line: 1, tab: 'qiskit' })
  })
})

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/** An angle both generators write exactly (p·π/q or a short decimal). */
function exactAngle(rand: () => number): number {
  if (rand() < 0.5) return Number((rand() * 6 - 3).toFixed(6))
  for (;;) {
    const q = 1 + Math.floor(rand() * 16)
    const p = Math.floor(rand() * 33) - 16
    if (p !== 0 && gcd(Math.abs(p), q) === 1) return (p * Math.PI) / q
  }
}

/** Random start states and random gates in their earliest columns (how parsers place them). */
function randomCircuit(rand: () => number, numQubits: number, gates: number): Circuit {
  const initialStates = Array.from(
    { length: numQubits },
    () => INITIAL_STATES[Math.floor(rand() * INITIAL_STATES.length)],
  )
  const circuit: Circuit = { numQubits, initialStates, operations: [] }
  const usable = GATE_TYPES.filter((g) => GATES[g].arity <= numQubits)
  for (let k = 0; k < gates; k++) {
    const gate: GateType = usable[Math.floor(rand() * usable.length)]
    const qubits: number[] = []
    while (qubits.length < GATES[gate].arity) {
      const q = Math.floor(rand() * numQubits)
      if (!qubits.includes(q)) qubits.push(q)
    }
    circuit.operations.push({
      id: `r${k}`,
      gate,
      qubits,
      column: earliestFreeColumn(circuit, qubits),
      ...(GATES[gate].parametric ? { angle: exactAngle(rand) } : {}),
    })
  }
  return circuit
}

function expectSameState(a: Circuit, b: Circuit) {
  const sa = simulate(a)
  const sb = simulate(b)
  expect(sb).toHaveLength(sa.length)
  sa.forEach((amp, i) => {
    expect(Math.abs(amp.re - sb[i].re)).toBeLessThan(1e-9)
    expect(Math.abs(amp.im - sb[i].im)).toBeLessThan(1e-9)
  })
}

/** The code with the two marker lines removed: the prep gates become ordinary gates. */
const withoutMarkers = (text: string) =>
  text
    .split('\n')
    .filter((line) => markerKind(line.trim()) === null)
    .join('\n')

describe('round trips with initial states', () => {
  it('every single-qubit start state, both languages', () => {
    for (const state of INITIAL_STATES) {
      const c = circuitWith([state, '0'], [{ id: 'a', gate: 'CX', column: 0, qubits: [0, 1] }])
      expect(circuitsEqual(ok(parseQasm(toQasm(c))), c)).toBe(true)
      expect(circuitsEqual(ok(parseQiskit(toQiskit(c))), c)).toBe(true)
    }
  })

  it('presets (including those with initial states)', () => {
    for (const preset of PRESETS) {
      const viaQasm = ok(parseQasm(toQasm(preset.circuit)))
      const viaQiskit = ok(parseQiskit(toQiskit(preset.circuit)))
      expect(viaQasm.initialStates).toEqual(preset.circuit.initialStates)
      expect(circuitsEqual(viaQasm, viaQiskit)).toBe(true)
      expectSameState(preset.circuit, viaQasm)
    }
  })

  const rand = mulberry32(20261009)
  const cases = Array.from({ length: 240 }, (_, i) => {
    const n = 1 + (i % 6)
    return [i, randomCircuit(rand, n, Math.floor(rand() * 25))] as const
  })

  it.each(cases)('#%i parseQasm(toQasm(c)) ≡ c ≡ parseQiskit(toQiskit(c))', (_i, c) => {
    const viaQasm = ok(parseQasm(toQasm(c)))
    const viaQiskit = ok(parseQiskit(toQiskit(c))) // zero problems, analysis tail included
    expect(circuitsEqual(viaQasm, c)).toBe(true)
    expect(circuitsEqual(viaQiskit, c)).toBe(true)
    expect(toQasm(viaQasm)).toBe(toQasm(c))
    expect(toQiskit(viaQiskit)).toBe(toQiskit(c))
  })

  it.each(cases.slice(0, 60))(
    '#%i physics: prep gates as ordinary gates = the engine start state',
    (_i, c) => {
      const asGatesQasm = ok(parseQasm(withoutMarkers(toQasm(c))))
      const asGatesQiskit = ok(parseQiskit(withoutMarkers(toQiskit(c))))
      expect(asGatesQasm.initialStates).toEqual(defaultInitialStates(c.numQubits))
      expectSameState(c, asGatesQasm)
      expectSameState(c, asGatesQiskit)
    },
  )
})
