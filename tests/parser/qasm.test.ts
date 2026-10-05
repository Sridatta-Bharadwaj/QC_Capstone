import { describe, expect, it } from 'vitest'
import { circuitsEqual, parseQasm, suggestGateName } from '../../src/parser/qasm'
import type { Circuit, Problem } from '../../src/model/types'

const HEADER = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\n'

/** Parses a program that must be valid; returns the circuit. */
function ok(body: string, header = HEADER): Circuit {
  const { circuit, problems } = parseQasm(header + body)
  expect(problems.filter((p) => p.severity === 'error')).toEqual([])
  expect(circuit).not.toBeNull()
  return circuit as Circuit
}

/** Gates as compact tuples in written order: [gate, column, qubits, angle?]. */
function shape(circuit: Circuit) {
  return circuit.operations.map((o) =>
    o.angle === undefined ? [o.gate, o.column, o.qubits] : [o.gate, o.column, o.qubits, o.angle],
  )
}

/** Errors only, with position, for exact-location assertions. */
function errors(source: string): Problem[] {
  const result = parseQasm(source)
  const errs = result.problems.filter((p) => p.severity === 'error')
  expect(result.circuit).toBeNull()
  return errs
}

describe('parseQasm: gates', () => {
  it.each([
    ['id', 'I'],
    ['h', 'H'],
    ['x', 'X'],
    ['y', 'Y'],
    ['z', 'Z'],
    ['s', 'S'],
    ['sdg', 'Sdg'],
    ['t', 'T'],
    ['tdg', 'Tdg'],
  ])('single-qubit %s → %s', (name, gate) => {
    expect(shape(ok(`${name} q[2];`))).toEqual([[gate, 0, [2]]])
  })

  it.each([
    ['rx', 'RX'],
    ['ry', 'RY'],
    ['rz', 'RZ'],
  ])('rotation %s → %s with angle', (name, gate) => {
    expect(shape(ok(`${name}(pi/2) q[1];`))).toEqual([[gate, 0, [1], Math.PI / 2]])
  })

  it('multi-qubit gates keep argument order (control first, target last)', () => {
    const c = ok(
      'cx q[2],q[0];\nCX q[0],q[1];\ncz q[1],q[2];\nswap q[0],q[2];\nccx q[0],q[1],q[2];',
    )
    expect(shape(c)).toEqual([
      ['CX', 0, [2, 0]],
      ['CX', 1, [0, 1]],
      ['CZ', 2, [1, 2]],
      ['SWAP', 3, [0, 2]],
      ['CCX', 4, [0, 1, 2]],
    ])
  })

  it('accepts any register name used consistently', () => {
    const c = ok('h data[0];\ncx data[0],data[1];', 'OPENQASM 2.0;\nqreg data[2];\n')
    expect(c.numQubits).toBe(2)
    expect(shape(c)).toEqual([
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ])
  })

  it('include is optional', () => {
    expect(ok('h q[0];', 'OPENQASM 2.0;\nqreg q[1];\n').numQubits).toBe(1)
  })

  it('an empty register body is a valid circuit', () => {
    expect(ok('')).toEqual({ numQubits: 3, operations: [] })
  })
})

describe('parseQasm: angles', () => {
  const angleOf = (expr: string) => ok(`rz(${expr}) q[0];`).operations[0].angle
  it.each([
    ['pi', Math.PI],
    ['-pi/4', -Math.PI / 4],
    ['3*pi/4', (3 * Math.PI) / 4],
    ['2*(pi/3)', (2 * Math.PI) / 3],
    ['0.25', 0.25],
    ['-1.5e-1', -0.15],
    ['.5', 0.5],
    ['π/2', Math.PI / 2],
    [' pi / 8 ', Math.PI / 8],
  ])('%s', (expr, value) => {
    expect(angleOf(expr)).toBeCloseTo(value, 12)
  })

  it('invalid expression is an error on the expression', () => {
    const [e] = errors(HEADER + 'rz(pi**2) q[0];')
    expect(e.message).toContain("Invalid angle expression 'pi**2'")
    expect(e).toMatchObject({ line: 4, column: 4, endLine: 4, endColumn: 9 })
  })

  it('unknown identifiers in the angle are invalid', () => {
    expect(errors(HEADER + 'rx(theta) q[0];')[0].message).toContain("'theta'")
  })

  it('missing angle on a rotation', () => {
    expect(errors(HEADER + 'rx q[0];')[0].message).toBe("'rx' needs an angle, e.g. rx(pi/2) q[0];")
    expect(errors(HEADER + 'ry() q[0];')[0].message).toContain('needs an angle')
  })

  it('angle on a fixed gate, and two angles on a rotation', () => {
    expect(errors(HEADER + 'h(pi) q[0];')[0].message).toBe("'h' takes no angle parameter.")
    expect(errors(HEADER + 'rz(pi,0) q[0];')[0].message).toBe("'rz' takes exactly one angle.")
  })

  it("missing ')'", () => {
    expect(errors(HEADER + 'rz(pi q[0];')[0].message).toBe("Missing ')' after the angle.")
  })
})

describe('parseQasm: comments and whitespace', () => {
  it('ignores line and block comments anywhere', () => {
    const src = [
      '// Bell state',
      'OPENQASM 2.0; /* version */',
      'include "qelib1.inc";',
      '/* multi',
      '   line */ qreg q[2];',
      'h /* inline */ q[0]; // superposition',
      'cx q[0],',
      '   q[1];',
    ].join('\n')
    const { circuit, problems } = parseQasm(src)
    expect(problems).toEqual([])
    expect(shape(circuit as Circuit)).toEqual([
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ])
  })

  it('several statements on one line, tabs and CRLF', () => {
    const c = ok('h q[0];\th q[1];  x q[2];\r\ncx q[0],q[1];')
    expect(shape(c)).toEqual([
      ['H', 0, [0]],
      ['H', 0, [1]],
      ['X', 0, [2]],
      ['CX', 1, [0, 1]],
    ])
  })

  it('unterminated block comment is an error at its start', () => {
    const [e] = errors(HEADER + 'h q[0];\n/* oops\nx q[0];')
    expect(e).toMatchObject({ line: 5, column: 1, endColumn: 3 })
    expect(e.message).toContain("'/*'")
  })
})

describe('parseQasm: header, include, registers', () => {
  it('missing header', () => {
    const [e] = errors('qreg q[2];\nh q[0];')
    expect(e).toMatchObject({ line: 1, column: 1, endColumn: 5 })
    expect(e.message).toContain("'OPENQASM 2.0;'")
  })

  it('other version', () => {
    const [e] = errors('OPENQASM 3.0;\nqreg q[1];')
    expect(e.message).toBe('Only OpenQASM 2.0 is supported (found version 3.0).')
    expect(e).toMatchObject({ line: 1, column: 10, endColumn: 13 })
  })

  it('header not first', () => {
    const errs = errors('qreg q[1];\nOPENQASM 2.0;')
    expect(errs.map((e) => e.line)).toEqual([1, 2])
    expect(errs[1].message).toContain('must be the first statement')
  })

  it('other include is a warning, not an error', () => {
    const { circuit, problems } = parseQasm('OPENQASM 2.0;\ninclude "mygates.inc";\nqreg q[1];')
    expect(circuit).not.toBeNull()
    expect(problems).toEqual([
      expect.objectContaining({ severity: 'warning', line: 2, column: 1, endColumn: 22 }),
    ])
  })

  it('creg is a warning and ignored', () => {
    const { circuit, problems } = parseQasm(HEADER + 'creg c[3];\nh q[0];')
    expect(shape(circuit as Circuit)).toEqual([['H', 0, [0]]])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatchObject({ severity: 'warning', line: 4 })
  })

  it('qreg above the cap explains the teaching limit', () => {
    const [e] = errors('OPENQASM 2.0;\nqreg q[8];')
    expect(e.message).toContain('at most 6 qubits')
    expect(e.message).toContain('teaching cap')
    expect(e).toMatchObject({ line: 2, column: 1, endColumn: 10 })
  })

  it('qreg of size 6 is allowed, 0 is not', () => {
    expect(parseQasm('OPENQASM 2.0;\nqreg q[6];').circuit?.numQubits).toBe(6)
    expect(errors('OPENQASM 2.0;\nqreg q[0];')[0].message).toContain('at least 1 qubit')
  })

  it('second qreg', () => {
    expect(errors(HEADER + 'qreg r[2];')[0].message).toContain('Only one qreg')
  })

  it('missing qreg', () => {
    expect(errors('OPENQASM 2.0;\n')[0].message).toContain('Missing quantum register')
  })

  it('empty program', () => {
    expect(errors('')[0].message).toContain('Empty program')
    expect(errors('  // just a comment\n')[0].message).toContain('Empty program')
  })
})

describe('parseQasm: gate errors with exact positions', () => {
  it('unknown gate with suggestion', () => {
    const [e] = errors(HEADER + 'hh q[0];')
    expect(e.message).toBe("Unknown gate 'hh'. Did you mean 'h'?")
    expect(e).toMatchObject({ line: 4, column: 1, endLine: 4, endColumn: 3 })
  })

  it('wrong case suggests the lowercase name', () => {
    expect(errors(HEADER + 'H q[0];')[0].message).toBe(
      "Unknown gate 'H'. Did you mean 'h'? Gate names are case-sensitive.",
    )
  })

  it('unknown gate without a close match', () => {
    expect(errors(HEADER + 'foobar q[0];')[0].message).toBe("Unknown gate 'foobar'.")
  })

  it('known but unsupported qelib gate', () => {
    expect(errors(HEADER + 'u3(0,0,0) q[0];')[0].message).toMatch(
      /^Gate 'u3' is not supported in v1\. Supported gates: id, h, /,
    )
  })

  it('wrong arity', () => {
    const [e] = errors(HEADER + 'cx q[0];')
    expect(e.message).toBe("'cx' needs 2 qubits (control, target), got 1.")
    expect(e).toMatchObject({ line: 4, column: 4, endColumn: 8 })
    expect(errors(HEADER + 'h q[0],q[1];')[0].message).toBe("'h' needs 1 qubit, got 2.")
    expect(errors(HEADER + 'h;')[0].message).toBe("'h' needs 1 qubit, got 0.")
  })

  it('index out of range', () => {
    const [e] = errors(HEADER + 'x q[0];\ncx q[1],q[3];')
    expect(e.message).toBe('Qubit q[3] is out of range: q[3] has indices 0 to 2.')
    expect(e).toMatchObject({ line: 5, column: 9, endLine: 5, endColumn: 13 })
  })

  it('duplicate qubit', () => {
    const [e] = errors(HEADER + 'cx q[1],q[1];')
    expect(e.message).toBe("'cx' uses q[1] more than once; qubits must be distinct.")
    expect(e).toMatchObject({ line: 4, column: 9, endColumn: 13 })
  })

  it('unknown register', () => {
    expect(errors(HEADER + 'h r[0];')[0].message).toBe("Unknown register 'r'. Did you mean 'q'?")
    expect(errors(HEADER + 'creg c[1];\nh c[0];')[0].message).toContain('classical register')
  })

  it('whole-register argument', () => {
    expect(errors(HEADER + 'h q;')[0].message).toContain('indexed qubit like q[0]')
  })

  it("missing ';' points just after the statement and parsing continues on the next line", () => {
    const errs = errors(HEADER + 'h q[0]\ncx q[0],q[1];\nx q[9];')
    expect(errs).toHaveLength(2)
    expect(errs[0]).toMatchObject({
      message: "Missing ';' at the end of the statement.",
      line: 4,
      column: 7,
      endColumn: 8,
    })
    expect(errs[1]).toMatchObject({ line: 6 })
  })

  it('measure is an error (not part of v1)', () => {
    const [e] = errors(HEADER + 'creg c[1];\nmeasure q[0] -> c[0];')
    expect(e.message).toContain("'measure' is not supported in v1")
    expect(e).toMatchObject({ line: 5, column: 1, endColumn: 21 })
  })

  it('reset, if and gate definitions are errors; barrier is a warning', () => {
    expect(errors(HEADER + 'reset q[0];')[0].message).toContain("'reset'")
    expect(errors(HEADER + 'creg c[1];\nif(c==1) x q[0];')[0].message).toContain("'if'")
    const def = errors(HEADER + 'gate foo a { h a; }\nh q[0];')
    expect(def).toHaveLength(1)
    expect(def[0].message).toContain('Custom gate definitions')
    const barrier = parseQasm(HEADER + 'h q[0];\nbarrier q[0],q[1];\nh q[1];')
    expect(barrier.problems).toEqual([expect.objectContaining({ severity: 'warning', line: 5 })])
    expect(shape(barrier.circuit as Circuit)).toEqual([
      ['H', 0, [0]],
      ['H', 0, [1]],
    ])
  })

  it('collects several errors in one pass', () => {
    const src =
      HEADER + ['hh q[0];', 'cx q[0];', 'x q[7];', 'rz(pi**2) q[0];', 'h q[0];'].join('\n')
    const errs = errors(src)
    expect(errs.map((e) => e.line)).toEqual([4, 5, 6, 7])
  })

  it('unexpected character', () => {
    expect(errors(HEADER + 'h q[0]; @')[0]).toMatchObject({ line: 4, column: 9 })
  })
})

describe('parseQasm: auto-placement', () => {
  it('independent gates share a column, dependent gates follow', () => {
    const c = ok('h q[0];\nh q[1];\ncx q[0],q[1];\nx q[2];\nz q[0];')
    expect(shape(c)).toEqual([
      ['H', 0, [0]],
      ['H', 0, [1]],
      ['CX', 1, [0, 1]],
      ['X', 0, [2]],
      ['Z', 2, [0]],
    ])
  })

  it('a multi-qubit gate blocks every wire in its span', () => {
    // cx q[0],q[2] crosses q[1], so a later h q[1] must come after it.
    const c = ok('cx q[0],q[2];\nh q[1];')
    expect(shape(c)).toEqual([
      ['CX', 0, [0, 2]],
      ['H', 1, [1]],
    ])
    // ...and a gate on q[1] before it pushes the cx right.
    expect(shape(ok('h q[1];\ncx q[2],q[0];'))).toEqual([
      ['H', 0, [1]],
      ['CX', 1, [2, 0]],
    ])
  })

  it('written order is time order even when later gates could fit earlier', () => {
    const c = ok('x q[0];\nx q[0];\nh q[1];')
    expect(shape(c)).toEqual([
      ['X', 0, [0]],
      ['X', 1, [0]],
      ['H', 0, [1]],
    ])
  })
})

describe('parseQasm: ids', () => {
  it('fresh unique ids without a previous circuit', () => {
    const c = ok('h q[0];\nh q[1];')
    expect(new Set(c.operations.map((o) => o.id)).size).toBe(2)
  })

  it('keeps ids of unchanged gates when a previous circuit is given', () => {
    const first = ok('h q[0];\ncx q[0],q[1];')
    const second = parseQasm(HEADER + 'x q[2];\nh q[0];\ncx q[0],q[1];', { previous: first })
      .circuit as Circuit
    expect(second.operations[1].id).toBe(first.operations[0].id)
    expect(second.operations[2].id).toBe(first.operations[1].id)
    expect(first.operations.map((o) => o.id)).not.toContain(second.operations[0].id)
  })

  it('a changed angle gets a new id', () => {
    const first = ok('rz(pi/2) q[0];')
    const second = parseQasm(HEADER + 'rz(pi/3) q[0];', { previous: first }).circuit as Circuit
    expect(second.operations[0].id).not.toBe(first.operations[0].id)
  })
})

describe('helpers', () => {
  it('suggestGateName', () => {
    expect(suggestGateName('cnot')).toBeNull()
    expect(suggestGateName('swp')).toBe('swap')
    expect(suggestGateName('CCX')).toBe('ccx')
    expect(suggestGateName('a')).toBeNull()
  })

  it('circuitsEqual ignores ids and array order', () => {
    const a = ok('h q[0];\nh q[1];')
    const b: Circuit = {
      numQubits: 3,
      operations: [...a.operations].reverse().map((o, i) => ({ ...o, id: `x${i}` })),
    }
    expect(circuitsEqual(a, b)).toBe(true)
    expect(circuitsEqual(a, { ...b, numQubits: 2 })).toBe(false)
    expect(circuitsEqual(a, ok('h q[0];\nh q[2];'))).toBe(false)
  })
})
