// Qiskit (straight-line subset) parser: every supported form and every error (PLAN.md → V2-1).
import { describe, expect, it } from 'vitest'
import { MAX_OPERATIONS, type Circuit, type Problem } from '../../src/model/types'
import {
  FINAL_MEASUREMENT_MESSAGE,
  MAX_QISKIT_SOURCE_LENGTH,
  parseQiskit,
  STRAIGHT_LINE_MESSAGE,
} from '../../src/parser/qiskit'

const HEADER = 'from qiskit import QuantumCircuit\nqc = QuantumCircuit(3)\n'

/** Parses and expects no problems at all. */
function ok(source: string): Circuit {
  const { circuit, problems } = parseQiskit(source)
  expect(problems).toEqual([])
  expect(circuit).not.toBeNull()
  return circuit as Circuit
}

/** Gates in written order as [gate, column, qubits, angle?]. */
function gates(circuit: Circuit) {
  return circuit.operations.map((o) =>
    o.angle === undefined ? [o.gate, o.column, o.qubits] : [o.gate, o.column, o.qubits, o.angle],
  )
}

/** Parses and expects at least one error; returns all problems. */
function fails(source: string): Problem[] {
  const { circuit, problems } = parseQiskit(source)
  expect(circuit).toBeNull()
  expect(problems.some((p) => p.severity === 'error')).toBe(true)
  return problems
}

const errors = (problems: Problem[]) => problems.filter((p) => p.severity === 'error')

describe('supported forms', () => {
  it('reads a Bell circuit', () => {
    const c = ok(
      'from qiskit import QuantumCircuit\n\nqc = QuantumCircuit(2)\nqc.h(0)\nqc.cx(0, 1)\n',
    )
    expect(c.numQubits).toBe(2)
    expect(c.initialStates).toEqual(['0', '0'])
    expect(gates(c)).toEqual([
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ])
  })

  it.each([
    ['h', 'H'],
    ['x', 'X'],
    ['y', 'Y'],
    ['z', 'Z'],
    ['s', 'S'],
    ['sdg', 'Sdg'],
    ['t', 'T'],
    ['tdg', 'Tdg'],
    ['id', 'I'],
    ['i', 'I'],
  ])('single-qubit gate qc.%s', (method, gate) => {
    expect(gates(ok(`${HEADER}qc.${method}(2)\n`))).toEqual([[gate, 0, [2]]])
  })

  it.each([
    ['rx', 'RX'],
    ['ry', 'RY'],
    ['rz', 'RZ'],
  ])('rotation qc.%s', (method, gate) => {
    expect(gates(ok(`${HEADER}qc.${method}(pi/2, 1)\n`))).toEqual([[gate, 0, [1], Math.PI / 2]])
  })

  it.each([
    ['cx(0, 2)', 'CX', [0, 2]],
    ['cnot(2, 0)', 'CX', [2, 0]],
    ['cz(1, 0)', 'CZ', [1, 0]],
    ['swap(0, 2)', 'SWAP', [0, 2]],
    ['ccx(0, 1, 2)', 'CCX', [0, 1, 2]],
    ['toffoli(2, 0, 1)', 'CCX', [2, 0, 1]],
  ])('multi-qubit gate qc.%s', (call, gate, qubits) => {
    expect(gates(ok(`${HEADER}qc.${call}\n`))).toEqual([[gate, 0, qubits]])
  })

  it('any variable name works', () => {
    expect(gates(ok('circuit = QuantumCircuit(1)\ncircuit.x(0)\n'))).toEqual([['X', 0, [0]]])
  })

  it('accepts qiskit.QuantumCircuit and a name= keyword', () => {
    expect(ok('import qiskit\nqc = qiskit.QuantumCircuit(2, name="bell")\n').numQubits).toBe(2)
  })

  it.each([
    ['pi', Math.PI],
    ['np.pi/4', Math.PI / 4],
    ['numpy.pi / 2', Math.PI / 2],
    ['math.pi*3/4', (3 * Math.PI) / 4],
    ['-(pi - 1)', -(Math.PI - 1)],
    ['0.25', 0.25],
    ['1e-3', 0.001],
  ])('angle %s', (text, value) => {
    const [op] = ok(
      `import numpy as np\nimport math\nqc = QuantumCircuit(1)\nqc.rz(${text}, 0)\n`,
    ).operations
    expect(op.angle).toBeCloseTo(value, 12)
  })

  it('a list applies a single-qubit gate to each qubit', () => {
    expect(gates(ok(`${HEADER}qc.h([0, 1, 2])\nqc.rx(pi, [0, 2,])\n`))).toEqual([
      ['H', 0, [0]],
      ['H', 0, [1]],
      ['H', 0, [2]],
      ['RX', 1, [0], Math.PI],
      ['RX', 1, [2], Math.PI],
    ])
  })

  it('keyword arguments', () => {
    const c = ok(
      `${HEADER}qc.h(qubit=1)\nqc.rx(theta=pi/2, qubit=0)\nqc.ry(pi, qubit=2)\n` +
        'qc.cx(control_qubit=0, target_qubit=2)\nqc.cz(0, target_qubit=1)\n' +
        'qc.swap(qubit1=1, qubit2=2)\nqc.ccx(control_qubit1=0, control_qubit2=1, target_qubit=2)\n',
    )
    expect(gates(c)).toEqual([
      ['H', 0, [1]],
      ['RX', 0, [0], Math.PI / 2],
      ['RY', 0, [2], Math.PI],
      ['CX', 1, [0, 2]],
      ['CZ', 2, [0, 1]],
      ['SWAP', 3, [1, 2]],
      ['CCX', 4, [0, 1, 2]],
    ])
  })

  it('auto-places gates: written order = time order, independent gates share a column', () => {
    expect(gates(ok(`${HEADER}qc.h(0)\nqc.x(1)\nqc.cx(0, 2)\nqc.z(1)\n`))).toEqual([
      ['H', 0, [0]],
      ['X', 0, [1]],
      ['CX', 1, [0, 2]],
      ['Z', 2, [1]], // q1 is crossed by the CX line in column 1
    ])
  })

  it('ignores comments, blank lines, imports and the analysis tail', () => {
    const source = [
      '# Bell state',
      'from math import pi',
      'import numpy as np',
      'from numpy import pi',
      'from qiskit import QuantumCircuit',
      'from qiskit.quantum_info import Statevector, partial_trace',
      'import matplotlib.pyplot as plt',
      '',
      'qc = QuantumCircuit(2)  # two qubits',
      'qc.h(0)',
      'qc.cx(0,',
      '      1)  # implicit line joining',
      'qc.draw()',
      "qc.draw('mpl')",
      'print(qc)',
      'print(qc.depth())',
      'state = Statevector(qc)',
      'rho = [partial_trace(state, [j for j in range(qc.num_qubits) if j != k]) for k in range(qc.num_qubits)]',
      'for r in rho:',
      '    print(r)',
      'if __name__ == "__main__":',
      '    plt.show()',
      'plt.show()',
      '"""A docstring',
      'spanning lines with qc.h(0) inside"""',
      "label = f'{qc.num_qubits} qubits'",
    ].join('\n')
    expect(gates(ok(source))).toEqual([
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ])
  })

  it('semicolons and backslash continuations', () => {
    expect(gates(ok(`${HEADER}qc.h(0); qc.x(1)\nqc.cx(0, \\\n  1)\n`))).toEqual([
      ['H', 0, [0]],
      ['X', 0, [1]],
      ['CX', 1, [0, 1]],
    ])
  })

  it('accepts Windows line endings', () => {
    expect(gates(ok('qc = QuantumCircuit(2)\r\nqc.h(0)\r\nqc.cx(0, 1)\r\n'))).toHaveLength(2)
  })

  it('reuses ids of unchanged gates from `previous`', () => {
    const first = ok(`${HEADER}qc.h(0)\nqc.x(1)\n`)
    const { circuit } = parseQiskit(`${HEADER}qc.h(0)\nqc.x(1)\nqc.z(2)\n`, { previous: first })
    expect(circuit?.operations[0].id).toBe(first.operations[0].id)
    expect(circuit?.operations[1].id).toBe(first.operations[1].id)
    expect(circuit?.operations[2].id).not.toBe(first.operations[0].id)
  })
})

describe('warnings (circuit still valid)', () => {
  it('classical bits and barrier', () => {
    const { circuit, problems } = parseQiskit('qc = QuantumCircuit(2, 2)\nqc.h(0)\nqc.barrier()\n')
    expect(circuit).not.toBeNull()
    expect(problems.map((p) => [p.severity, p.line, p.tab])).toEqual([
      ['warning', 1, 'qiskit'],
      ['warning', 3, 'qiskit'],
    ])
    expect(problems[0].message).toMatch(/Classical bits are ignored/)
    expect(problems[1].message).toMatch(/barrier/)
  })

  it.each([
    'qc.measure(0, 0)\nqc.measure(1, 1)',
    'qc.measure([0, 1], [0, 1])',
    'qc.measure(range(2), range(2))',
    'qc.measure(qubit=1, cbit=1)\nqc.measure(0, 0)',
    'qc.measure_all()',
  ])('final measurement %j is ignored with a warning', (measure) => {
    const { circuit, problems } = parseQiskit(
      `qc = QuantumCircuit(2)\nqc.h(0)\nqc.cx(0, 1)\n${measure}\n`,
    )
    expect(circuit?.operations).toHaveLength(2)
    expect(problems.length).toBeGreaterThan(0)
    for (const p of problems) {
      expect(p.severity).toBe('warning')
      expect(p.message).toBe(FINAL_MEASUREMENT_MESSAGE)
    }
  })

  it('a measured qubit may be followed by gates on other qubits', () => {
    const { circuit } = parseQiskit('qc = QuantumCircuit(2)\nqc.measure(0, 0)\nqc.h(1)\n')
    expect(circuit?.operations).toHaveLength(1)
  })
})

describe('errors', () => {
  /** Expects exactly one error and returns it. */
  function oneError(source: string): Problem {
    const list = errors(fails(source))
    expect(list).toHaveLength(1)
    expect(list[0].tab).toBe('qiskit')
    return list[0]
  }

  it.each([
    ['for loop', 'for k in range(3):\n    qc.h(k)', 5],
    ['while loop', 'while True:\n    qc.x(0)', 5],
    ['if block', 'if True:\n    qc.x(0)', 5],
    ['def', 'def build(c):\n    qc.h(0)', 5],
    ['with', 'with open("f") as f:\n    qc.h(0)', 5],
    ['one-line for', 'for k in range(3): qc.h(k)', 20],
    ['comprehension', '[qc.h(k) for k in range(3)]', 2],
    ['assignment', 'g = qc.h(0)', 5],
    ['call argument', 'print(qc.h(0))', 7],
    ['lambda', 'f = lambda: qc.x(0)', 13],
    ['for loop (unknown method)', 'for k in range(2):\n    qc.hh(k)', 5],
    ['assignment (unsupported method)', 'g = qc.reset(0)', 5],
  ])('gate call in a %s → straight-line error', (_name, code, column) => {
    const e = oneError(`${HEADER}${code}\n`)
    expect(e.message).toBe(STRAIGHT_LINE_MESSAGE)
    expect(e.column).toBe(column)
  })

  it('position covers `qc.method`', () => {
    const e = oneError(`${HEADER}for k in range(3):\n    qc.h(k)\n`)
    expect([e.line, e.column, e.endLine, e.endColumn]).toEqual([4, 5, 4, 9])
  })

  it('variable used before QuantumCircuit(...)', () => {
    const e = oneError('qc.h(0)\nqc = QuantumCircuit(2)\n')
    expect(e.message).toMatch(/'qc' is used before qc = QuantumCircuit\(\.\.\.\) creates it/)
    expect([e.line, e.column]).toEqual([1, 1])
  })

  it('gate call on something that is not the circuit', () => {
    expect(oneError('qc = QuantumCircuit(2)\ncirc.h(0)\n').message).toMatch(
      /'circ' is not the circuit: gates go on 'qc'/,
    )
  })

  it('no circuit at all', () => {
    expect(oneError('from qiskit import QuantumCircuit\nprint(1)\n').message).toMatch(
      /No circuit found/,
    )
    expect(oneError('').message).toMatch(/Empty program/)
    expect(oneError('# only a comment\n').message).toMatch(/Empty program/)
  })

  it('unknown and unsupported methods', () => {
    const e = oneError(`${HEADER}qc.hh(0)\n`)
    expect(e.message).toBe("Unknown method 'qc.hh'. Did you mean 'qc.h'?")
    expect([e.line, e.column, e.endColumn]).toEqual([3, 1, 6])
    expect(oneError(`${HEADER}qc.frobnicate(0)\n`).message).toBe("Unknown method 'qc.frobnicate'.")
    expect(oneError(`${HEADER}qc.u(0, 0, 0, 0)\n`).message).toMatch(/'qc.u' is not supported/)
    expect(oneError(`${HEADER}qc.reset(0)\n`).message).toMatch(/'qc.reset' is not supported/)
  })

  it.each([
    ['qc.h()', /needs 1 argument: qc.h\(qubit\); missing qubit/],
    ['qc.h(0, 1)', /takes 1 argument: qc.h\(qubit\); got 2/],
    ['qc.rx(0)', /missing qubit/],
    ['qc.cx(0)', /needs 2 arguments: qc.cx\(control_qubit, target_qubit\); missing target_qubit/],
    ['qc.ccx(0, 1)', /missing target_qubit/],
    ['qc.swap(0, 1, 2)', /takes 2 arguments/],
    ['qc.h(target=0)', /qc.h has no argument 'target'/],
    ['qc.h(0, qubit=1)', /argument 'qubit' is given twice/],
    ['qc.h(qubit=0, 1)', /positional argument cannot follow a keyword/],
    ['qc.h(qubit=)', /Missing a value after 'qubit='/],
    ['qc.h(0,,)', /Expected an argument/],
  ])('wrong arguments: %s', (call, message) => {
    expect(oneError(`${HEADER}${call}\n`).message).toMatch(message)
  })

  it.each([
    ['qc.h(3)', /Qubit 3 is out of range: the circuit has 3 qubits \(0 to 2\)/],
    ['qc.h([0, 5])', /Qubit 5 is out of range/],
    ['qc.cx(0, 7)', /Qubit 7 is out of range/],
    ['qc.h(-1)', /negative indices are not supported/],
    ['qc.h(1.5)', /a qubit must be a whole number/],
    ['qc.h(k)', /a qubit must be a whole number/],
    ['qc.h([])', /qubit list is empty/],
    ['qc.cx([0, 1], 2)', /lists of qubits are only supported for single-qubit gates/],
    ['qc.cx(1, 1)', /uses qubit 1 more than once/],
  ])('bad qubits: %s', (call, message) => {
    expect(oneError(`${HEADER}${call}\n`).message).toMatch(message)
  })

  it('positions point at the bad argument', () => {
    const e = oneError(`${HEADER}qc.cx(0, 7)\n`)
    expect([e.line, e.column, e.endLine, e.endColumn]).toEqual([3, 10, 3, 11])
  })

  it.each([
    ['qc.rx(theta, 0)', /Invalid angle 'theta'/],
    ['qc.rx(2pi, 0)', /Invalid angle/],
    ['qc.rx(1/0, 0)', /not a finite number/],
    ['qc.rx(1e999, 0)', /Invalid angle/],
    ['qc.rx(pi**2, 0)', /Invalid angle/],
  ])('bad angle: %s', (call, message) => {
    expect(oneError(`${HEADER}${call}\n`).message).toMatch(message)
  })

  it.each([
    ['QuantumCircuit(0)', /at least 1 qubit/],
    ['QuantumCircuit(7)', /at most 6 qubits/],
    ['QuantumCircuit()', /needs the number of qubits/],
    ['QuantumCircuit(n)', /Registers and expressions are not supported/],
    ['QuantumCircuit(QuantumRegister(2))', /Registers and expressions are not supported/],
    ['QuantumCircuit(2, c)', /Classical bits must be a whole number/],
    ['QuantumCircuit(2, 2, 2)', /at most 2 numbers/],
    ['QuantumCircuit(2, global_phase=1)', /unsupported argument 'global_phase'/],
  ])('bad circuit creation: %s', (call, message) => {
    expect(errors(fails(`qc = ${call}\n`)).map((p) => p.message)).toEqual(
      expect.arrayContaining([expect.stringMatching(message)]),
    )
  })

  it('only one circuit per file', () => {
    expect(oneError('qc = QuantumCircuit(2)\nqc2 = QuantumCircuit(3)\n').message).toMatch(
      /Only one circuit per file/,
    )
  })

  it('reassigning the circuit variable', () => {
    expect(oneError(`${HEADER}qc = qc.compose(other)\n`).message).toMatch(/Reassigning 'qc'/)
    expect(oneError(`${HEADER}qc += other\n`).message).toMatch(/Reassigning 'qc'/)
  })

  it('gate after a measurement on the same qubit', () => {
    const problems = fails('qc = QuantumCircuit(2)\nqc.measure(0, 0)\nqc.cx(0, 1)\n')
    const e = errors(problems)
    expect(e).toHaveLength(1)
    expect(e[0].message).toMatch(/Gate after a measurement: qubit 0 was measured on line 2/)
    expect(e[0].line).toBe(3)
    expect(errors(fails('qc = QuantumCircuit(2)\nqc.measure_all()\nqc.x(1)\n'))).toHaveLength(1)
  })

  it('unexpected text after a call, unexpected indentation, syntax problems', () => {
    expect(oneError(`${HEADER}qc.h(0).c_if(c, 1)\n`).message).toMatch(/Unexpected '.c_if\(c,1\)'/)
    expect(oneError(`${HEADER}  qc.h(0)\n`).message).toMatch(/Unexpected indentation/)
    expect(oneError(`${HEADER}qc.h(0\n`).message).toBe("'(' was never closed.")
    expect(oneError(`${HEADER}qc.h(0))\n`).message).toBe("Unmatched ')'.")
    expect(oneError(`${HEADER}qc.h(0]\n`).message).toMatch(/does not match/)
    expect(oneError(`${HEADER}x = 'abc\n`).message).toMatch(/Unterminated string/)
    expect(oneError(`${HEADER}x = """abc\n`).message).toMatch(/Unterminated string/)
    expect(oneError(`${HEADER}x = 1 $ 2\n`).message).toBe("Unexpected character '$'.")
  })

  it('several problems are reported in text order', () => {
    const problems = fails(`${HEADER}qc.foo(0)\nfor k in range(2):\n    qc.h(k)\nqc.h(9)\n`)
    expect(problems.map((p) => p.line)).toEqual([3, 5, 6])
  })
})

describe('limits and hostile input (fail fast, never hang or overflow)', () => {
  it(`more than ${MAX_OPERATIONS} gates → error`, () => {
    const body = 'qc.h(0)\n'.repeat(MAX_OPERATIONS + 1)
    const e = errors(fails(`${HEADER}${body}`))
    expect(e).toHaveLength(1)
    expect(e[0].message).toMatch(/Too many gates: a circuit can have at most 500/)
    expect(e[0].line).toBe(2 + MAX_OPERATIONS + 1)
  })

  it(`exactly ${MAX_OPERATIONS} gates is fine`, () => {
    expect(ok(`${HEADER}${'qc.h(0)\n'.repeat(MAX_OPERATIONS)}`).operations).toHaveLength(
      MAX_OPERATIONS,
    )
  })

  it('a list cannot sneak past the gate limit', () => {
    const list = `[${Array.from({ length: 600 }, () => '0').join(', ')}]`
    expect(errors(fails(`${HEADER}qc.h(${list})\n`))[0].message).toMatch(/Too many gates/)
  })

  it('10k lines bail out quickly', () => {
    const start = performance.now()
    fails(`${HEADER}${'qc.cx(0, 1)\n'.repeat(10_000)}`)
    expect(performance.now() - start).toBeLessThan(2000)
  })

  it('10k lines of ignored code are fine', () => {
    const start = performance.now()
    ok(`${HEADER}${'x = 1 + 2  # analysis\n'.repeat(4000)}`)
    expect(performance.now() - start).toBeLessThan(2000)
  })

  it('source over the size limit is rejected before parsing', () => {
    const e = errors(fails(`${HEADER}${'#'.repeat(MAX_QISKIT_SOURCE_LENGTH)}`))
    expect(e).toHaveLength(1)
    expect(e[0].message).toMatch(/too long/)
  })

  it('deeply nested parentheses in an angle', () => {
    const deep = `${'('.repeat(10_000)}pi${')'.repeat(10_000)}`
    expect(errors(fails(`${HEADER}qc.rx(${deep}, 0)\n`))[0].message).toMatch(/too long/)
    const medium = `${'('.repeat(200)}pi${')'.repeat(200)}`
    expect(errors(fails(`${HEADER}qc.rx(${medium}, 0)\n`))[0].message).toMatch(/nested too deeply/)
  })

  it('deeply nested brackets elsewhere', () => {
    const deep = `x = ${'['.repeat(20_000)}${']'.repeat(20_000)}\n`
    expect(ok(`${HEADER}${deep}`).operations).toEqual([])
    expect(fails(`${HEADER}x = ${'('.repeat(20_000)}\n`).length).toBeGreaterThan(0)
  })

  it('huge numbers', () => {
    expect(errors(fails(`${HEADER}qc.h(${'9'.repeat(400)})\n`))[0].message).toMatch(/out of range/)
    expect(errors(fails(`qc = QuantumCircuit(${'9'.repeat(400)})\n`))[0].message).toMatch(
      /at most 6 qubits/,
    )
  })

  it('hostile method names do not reach Object.prototype', () => {
    expect(errors(fails(`${HEADER}qc.constructor(0)\n`))[0].message).toMatch(/Unknown method/)
    expect(errors(fails(`${HEADER}qc.__proto__(0)\n`))[0].message).toMatch(/Unknown method/)
  })
})
