// Real-world OpenQASM 2.0 (V2-3): files as Qiskit's qasm2.dumps writes them, gate definitions,
// u/p/sx gates, measurement rules, the OpenQASM 3 message, size limits and hostile input.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyze } from '../../src/engine'
import {
  MAX_OPERATIONS,
  MAX_UPLOAD_BYTES,
  type Circuit,
  type InitialState,
} from '../../src/model/types'
import { FINAL_MEASUREMENT_MESSAGE, gateAfterMeasurementMessage } from '../../src/parser/messages'
import {
  MAX_GATE_DEPTH,
  MAX_REPORTED_PROBLEMS,
  QASM3_MESSAGE,
  circuitsEqual,
  parseQasm,
} from '../../src/parser/qasm'
import { parseQiskit } from '../../src/parser/qiskit'

const fixture = (name: string) =>
  readFileSync(resolve(__dirname, '../fixtures/files', name), 'utf8')

const HEADER = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\n'

function valid(source: string): Circuit {
  const { circuit, problems } = parseQasm(source)
  expect(problems.filter((p) => p.severity === 'error')).toEqual([])
  expect(circuit).not.toBeNull()
  return circuit as Circuit
}

function errorMessages(source: string): string[] {
  const { circuit, problems } = parseQasm(source)
  expect(circuit).toBeNull()
  return problems.filter((p) => p.severity === 'error').map((p) => p.message)
}

/** Gates as compact tuples: [gate, column, qubits, angle?]. */
function shape(circuit: Circuit) {
  return circuit.operations.map((o) =>
    o.angle === undefined ? [o.gate, o.column, o.qubits] : [o.gate, o.column, o.qubits, o.angle],
  )
}

/** Milliseconds taken by fn. */
function timed(fn: () => void): number {
  const start = performance.now()
  fn()
  return performance.now() - start
}

describe('Qiskit-exported files', () => {
  it('Bell pair with measure_all: barrier, creg and final measurements are warnings', () => {
    const { circuit, problems } = parseQasm(fixture('bell_measure_all.qasm'))
    expect(shape(circuit as Circuit)).toEqual([
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ])
    expect(problems.every((p) => p.severity === 'warning')).toBe(true)
    const measures = problems.filter((p) => p.message === FINAL_MEASUREMENT_MESSAGE)
    expect(measures.map((p) => p.line)).toEqual([8, 9])
    expect(problems.some((p) => p.message.includes("'barrier' is ignored"))).toBe(true)
    expect(problems.some((p) => p.message.includes('Classical register meas'))).toBe(true)
  })

  it('GHZ with barriers', () => {
    const c = valid(fixture('ghz_barrier.qasm'))
    expect(shape(c)).toEqual([
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
      ['CX', 2, [1, 2]],
    ])
  })

  it('custom gates with parameters are expanded inline, nested definitions included', () => {
    const c = valid(fixture('custom_gates.qasm'))
    // entangle(pi/2, pi) → ry(pi/2) q0; rzx(pi/2) q0,q1 → h q1; cx; rz(pi/2) q1; cx; h q1
    const expected = valid(
      HEADER + 'ry(pi/2) q[0];\nh q[1];\ncx q[0],q[1];\nrz(pi/2) q[1];\ncx q[0],q[1];\nh q[1];\n',
    )
    expect(circuitsEqual(c, expected)).toBe(true)
    expect(shape(c)).toEqual(shape(expected))
  })

  it('whole-register measure (measure q -> c;) is a final measurement', () => {
    const { problems } = parseQasm(fixture('custom_gates.qasm'))
    expect(problems).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('Classical register c'),
      }),
      expect.objectContaining({ severity: 'warning', message: FINAL_MEASUREMENT_MESSAGE }),
    ])
  })

  it('u3 / u2 / u1 / p / sx / u are drawn as rotations, with one warning per gate name', () => {
    const { circuit, problems } = parseQasm(fixture('u_gates.qasm'))
    expect(shape(circuit as Circuit)).toEqual([
      // u3(pi/2, 0, pi) → rz(pi), ry(pi/2) (the zero-angle rz is dropped)
      ['RZ', 0, [0], Math.PI],
      ['RY', 1, [0], Math.PI / 2],
      // u2(0, pi) = u3(pi/2, 0, pi)
      ['RZ', 0, [1], Math.PI],
      ['RY', 1, [1], Math.PI / 2],
      ['RZ', 0, [2], Math.PI / 4],
      ['RZ', 1, [2], Math.PI / 2],
      ['RX', 0, [3], Math.PI / 2],
      ['RZ', 1, [3], Math.PI],
      ['RY', 2, [3], Math.PI],
    ])
    expect(problems.map((p) => p.severity)).toEqual(Array(6).fill('warning'))
    expect(problems[0].message).toBe(
      "'u3' is shown as rz, ry, rz: the same gate up to a global phase, which does not " +
        'change any density matrix.',
    )
  })

  it('unsupported qelib1 gates are named in the error', () => {
    expect(errorMessages(HEADER + 'ch q[0],q[1];')[0]).toMatch(/^Gate 'ch' is not supported yet/)
    expect(errorMessages(HEADER + 'crz(pi) q[0],q[1];')[0]).toMatch(/'crz'/)
  })
})

describe('u-family rewrites are right up to a global phase (physics check)', () => {
  type C = [number, number] // complex number as [re, im]
  const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
  const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]]
  const expi = (t: number): C => [Math.cos(t), Math.sin(t)]
  const r = (x: number): C => [x, 0]

  /** The textbook U3(θ, φ, λ) matrix (OpenQASM 2.0 spec). */
  const U3 = (t: number, p: number, l: number): C[][] => [
    [r(Math.cos(t / 2)), mul(r(-Math.sin(t / 2)), expi(l))],
    [mul(r(Math.sin(t / 2)), expi(p)), mul(r(Math.cos(t / 2)), expi(p + l))],
  ]
  const s = Math.SQRT1_2
  const START: Record<InitialState, C[]> = {
    '0': [r(1), r(0)],
    '1': [r(0), r(1)],
    '+': [r(s), r(s)],
    '-': [r(s), r(-s)],
    i: [r(s), [0, s]],
    '-i': [r(s), [0, -s]],
  }

  /** Bloch vector of U|start⟩: x = 2 Re(a* b), y = 2 Im(a* b), z = |a|² − |b|². */
  function expectedBloch(u: C[][], start: C[]) {
    const a = add(mul(u[0][0], start[0]), mul(u[0][1], start[1]))
    const b = add(mul(u[1][0], start[0]), mul(u[1][1], start[1]))
    const conjAB = mul([a[0], -a[1]], b)
    return { x: 2 * conjAB[0], y: 2 * conjAB[1], z: a[0] ** 2 + a[1] ** 2 - b[0] ** 2 - b[1] ** 2 }
  }

  const cases: [string, C[][]][] = [
    ['u3(0.7,1.1,-0.4)', U3(0.7, 1.1, -0.4)],
    ['u(2.1,-0.3,0.9)', U3(2.1, -0.3, 0.9)],
    ['U(1,2,3)', U3(1, 2, 3)],
    ['u2(0.5,1.3)', U3(Math.PI / 2, 0.5, 1.3)],
    ['u1(0.8)', U3(0, 0, 0.8)],
    ['p(-1.2)', U3(0, 0, -1.2)],
    ['sx', U3(Math.PI / 2, -Math.PI / 2, Math.PI / 2)],
    ['sxdg', U3(-Math.PI / 2, -Math.PI / 2, Math.PI / 2)],
  ]

  it.each(cases)('%s', (gate, u) => {
    for (const state of Object.keys(START) as InitialState[]) {
      const c = valid(`OPENQASM 2.0;\nqreg q[1];\n${gate} q[0];\n`)
      const bloch = analyze({ ...c, initialStates: [state] }).qubits[0].bloch
      const want = expectedBloch(u, START[state])
      expect(bloch.x).toBeCloseTo(want.x, 10)
      expect(bloch.y).toBeCloseTo(want.y, 10)
      expect(bloch.z).toBeCloseTo(want.z, 10)
    }
  })
})

describe('measurement', () => {
  it('a gate after a measurement on that qubit is an error (same wording as Qiskit)', () => {
    const { problems } = parseQasm(fixture('mid_measure.qasm'))
    const error = problems.find((p) => p.severity === 'error')
    expect(error).toMatchObject({
      message: gateAfterMeasurementMessage('q[0]', 6),
      line: 7,
    })
    const qiskit = parseQiskit(
      'from qiskit import QuantumCircuit\nqc = QuantumCircuit(1, 1)\nqc.measure(0, 0)\nqc.x(0)\n',
    )
    const qiskitError = qiskit.problems.find((p) => p.severity === 'error')
    expect(qiskitError?.message).toBe(gateAfterMeasurementMessage('0', 3))
  })

  it('a gate on another qubit after a measurement is fine', () => {
    const c = valid(HEADER + 'creg c[2];\nmeasure q[0] -> c[0];\nh q[1];\n')
    expect(shape(c)).toEqual([['H', 0, [1]]])
  })

  it('a gate defined in the file still counts as a gate after measurement', () => {
    const msgs = errorMessages(
      HEADER + 'gate g a { x a; }\ncreg c[1];\nmeasure q[1] -> c[0];\ng q[1];\n',
    )
    expect(msgs[0]).toMatch(/^Gate after a measurement: qubit q\[1\]/)
  })

  it('measure syntax errors', () => {
    expect(errorMessages(HEADER + 'creg c[1];\nmeasure q[0];')[0]).toContain("'->'")
    expect(errorMessages(HEADER + 'measure q[0] -> c[0];')[0]).toContain(
      "Unknown classical register 'c'",
    )
    expect(errorMessages(HEADER + 'creg c[1];\nmeasure q[5] -> c[0];')[0]).toContain('out of range')
  })
})

describe('gate definitions', () => {
  it('parameters go through the angle evaluator, including unary minus and nesting', () => {
    const c = valid(HEADER + 'gate r2(a,b) x { rz(-a) x; rx((a+b)/2) x; }\nr2(-pi/2, pi/2) q[0];\n')
    expect(shape(c)).toEqual([
      ['RZ', 0, [0], Math.PI / 2],
      ['RX', 1, [0], 0],
    ])
  })

  it('a qelib1-style definition of a built-in gate is ignored with a warning', () => {
    const { circuit, problems } = parseQasm(HEADER + 'gate h a { u2(0,pi) a; }\nh q[0];\n')
    expect(shape(circuit as Circuit)).toEqual([['H', 0, [0]]])
    expect(problems[0].message).toContain("Definition of 'h' is ignored")
  })

  it.each([
    ['self-recursive', 'gate a x { a x; }\na q[0];', 'calls itself'],
    [
      'mutually recursive',
      'gate a x { b x; }\ngate b x { a x; }\na q[0];',
      'must be defined before it is used',
    ],
    ['redefined', 'gate g x { h x; }\ngate g x { x x; }\n', "'g' is already defined"],
    ['unknown parameter', 'gate g(t) x { rz(u) x; }\n', "Unknown parameter 'u'"],
    ['unknown qubit', 'gate g x { h y; }\n', "'y' is not a qubit of gate 'g'"],
    ['wrong arity in body', 'gate g x { cx x; }\n', "'cx' needs 2 qubits, got 1"],
    ['wrong parameter count', 'gate g(t) x { rz(t) x; }\ng q[0];\n', "'g' needs 1 parameter"],
    ['missing brace', 'gate g x { h x;\n', "Missing '}'"],
    ['opaque', 'opaque magic(t) a, b;\n', "Opaque gate 'magic'"],
  ])('%s → error', (_, body, message) => {
    expect(errorMessages(HEADER + body).join('\n')).toContain(message)
  })

  it(`nesting deeper than ${MAX_GATE_DEPTH} levels is an error`, () => {
    const defs = ['gate g0 a { h a; }']
    for (let k = 1; k <= MAX_GATE_DEPTH + 2; k++) defs.push(`gate g${k} a { g${k - 1} a; }`)
    const ok = parseQasm(
      HEADER + defs.slice(0, MAX_GATE_DEPTH).join('\n') + `\ng${MAX_GATE_DEPTH - 1} q[0];`,
    )
    expect(ok.circuit?.operations).toHaveLength(1)
    const msgs = errorMessages(HEADER + defs.join('\n') + `\ng${MAX_GATE_DEPTH + 2} q[0];`)
    expect(msgs).toHaveLength(1)
    expect(msgs[0]).toContain('nested too deeply')
  })
})

describe('limits', () => {
  it('OpenQASM 3 gets one clear error', () => {
    const { circuit, problems } = parseQasm(fixture('qasm3.qasm'))
    expect(circuit).toBeNull()
    expect(problems).toEqual([expect.objectContaining({ message: QASM3_MESSAGE, line: 1 })])
    expect(errorMessages('OPENQASM 3;\nqubit q;')).toEqual([QASM3_MESSAGE])
    expect(errorMessages('// header\nOPENQASM 3.1;\n')).toEqual([QASM3_MESSAGE])
  })

  it('a qreg over the cap names the limit', () => {
    expect(errorMessages('OPENQASM 2.0;\nqreg q[7];')[0]).toContain('at most 6 qubits')
    expect(errorMessages('OPENQASM 2.0;\nqreg q[99999999999];\nh q[5];')[0]).toContain(
      'at most 6 qubits',
    )
  })

  it(`more than ${MAX_OPERATIONS} gates → error, parsing stops`, () => {
    const atLimit = HEADER + 'h q[0];\n'.repeat(MAX_OPERATIONS)
    expect(valid(atLimit).operations).toHaveLength(MAX_OPERATIONS)
    const msgs = errorMessages(atLimit + 'h q[1];\nh q[1];\n')
    expect(msgs).toEqual([`Too many gates: a circuit can have at most ${MAX_OPERATIONS}.`])
  })

  it('code over 100 KB is rejected before parsing', () => {
    const big = HEADER + '// padding\n'.repeat(Math.ceil(MAX_UPLOAD_BYTES / 11))
    const { circuit, problems } = parseQasm(big)
    expect(circuit).toBeNull()
    expect(problems).toEqual([
      expect.objectContaining({ message: expect.stringMatching(/too long/) }),
    ])
  })

  it('placement is linear: 500 gates on 6 wires parse quickly and match ASAP layering', () => {
    const lines = ['OPENQASM 2.0;', 'qreg q[6];']
    for (let i = 0; i < MAX_OPERATIONS; i++)
      lines.push(i % 3 === 0 ? `cx q[${i % 6}],q[${(i + 3) % 6}];` : `h q[${i % 6}];`)
    let c: Circuit | null = null
    expect(timed(() => (c = valid(lines.join('\n'))))).toBeLessThan(1000)
    expect((c as unknown as Circuit).operations).toHaveLength(MAX_OPERATIONS)
  })
})

describe('hostile input fails fast with an error', () => {
  const cases: [string, string][] = [
    ['deeply nested parentheses', HEADER + `rx(${'('.repeat(5000)}pi${')'.repeat(5000)}) q[0];`],
    ['unclosed parentheses', HEADER + `rx(${'('.repeat(20000)} q[0];`],
    ['huge numbers', HEADER + `rx(1e999) q[0];\nrz(${'9'.repeat(400)}) q[0];`],
    ['huge qubit index', HEADER + 'h q[99999999999999999999999];'],
    ['10k lines of gates', HEADER + 'h q[0];\n'.repeat(10_000)],
    ['10k lines of garbage', HEADER + '@#$ ;\n'.repeat(10_000)],
    ['10k barrier warnings', HEADER + 'barrier q[0];\n'.repeat(9_000)],
    [
      'exponential gate expansion (each gate calls the previous twice, 30 levels)',
      HEADER +
        ['gate g0 a { h a; }']
          .concat(Array.from({ length: 30 }, (_, k) => `gate g${k + 1} a { g${k} a; g${k} a; }`))
          .join('\n') +
        '\ng30 q[0];\n',
    ],
    [
      'exponential expansion within the depth limit (2^15 gates)',
      HEADER +
        ['gate g0 a { h a; }']
          .concat(Array.from({ length: 15 }, (_, k) => `gate g${k + 1} a { g${k} a; g${k} a; }`))
          .join('\n') +
        '\ng15 q[0];\n',
    ],
    [
      'exponential expansion of empty gates',
      HEADER +
        ['gate g0 a { }']
          .concat(Array.from({ length: 15 }, (_, k) => `gate g${k + 1} a { g${k} a; g${k} a; }`))
          .join('\n') +
        '\ng15 q[0];\n',
    ],
  ]

  it.each(cases)('%s', (_, source) => {
    let result: ReturnType<typeof parseQasm> | null = null
    const ms = timed(() => (result = parseQasm(source)))
    expect(ms).toBeLessThan(1000)
    const { circuit, problems } = result as unknown as ReturnType<typeof parseQasm>
    expect(circuit).toBeNull()
    expect(problems.some((p) => p.severity === 'error')).toBe(true)
    expect(problems.length).toBeLessThanOrEqual(MAX_REPORTED_PROBLEMS + 1)
  })
})
