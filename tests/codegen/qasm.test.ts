import { describe, expect, it } from 'vitest'
import { qasmStatement, toQasm } from '../../src/codegen'
import { PRESETS } from '../../src/model/presets'
import { GATE_TYPES, type Circuit, type GateType, type Operation } from '../../src/model/types'

let nextId = 0
function op(gate: GateType, column: number, qubits: number[], angle?: number): Operation {
  nextId += 1
  return { id: `t${nextId}`, gate, column, qubits, ...(angle === undefined ? {} : { angle }) }
}

const HEADER = 'OPENQASM 2.0;\ninclude "qelib1.inc";\n\n'

describe('qasmStatement', () => {
  const cases: [Operation, string][] = [
    [op('I', 0, [0]), 'id q[0];'],
    [op('H', 0, [1]), 'h q[1];'],
    [op('X', 0, [2]), 'x q[2];'],
    [op('Y', 0, [0]), 'y q[0];'],
    [op('Z', 0, [0]), 'z q[0];'],
    [op('S', 0, [0]), 's q[0];'],
    [op('Sdg', 0, [0]), 'sdg q[0];'],
    [op('T', 0, [0]), 't q[0];'],
    [op('Tdg', 0, [0]), 'tdg q[0];'],
    [op('RX', 0, [1], Math.PI / 2), 'rx(pi/2) q[1];'],
    [op('RY', 0, [0], (-3 * Math.PI) / 4), 'ry(-3*pi/4) q[0];'],
    [op('RZ', 0, [0], 0.25), 'rz(0.25) q[0];'],
    [op('CX', 0, [0, 1]), 'cx q[0],q[1];'],
    [op('CX', 0, [2, 0]), 'cx q[2],q[0];'],
    [op('CZ', 0, [1, 0]), 'cz q[1],q[0];'],
    [op('SWAP', 0, [0, 3]), 'swap q[0],q[3];'],
    [op('CCX', 0, [0, 2, 1]), 'ccx q[0],q[2],q[1];'],
  ]

  it.each(cases)('%# %j', (operation, expected) => {
    expect(qasmStatement(operation)).toBe(expected)
  })

  it('covers every gate type', () => {
    const covered = new Set(cases.map(([o]) => o.gate))
    expect([...covered].sort()).toEqual([...GATE_TYPES].sort())
  })

  it('formats angles as pi fractions or decimals', () => {
    const angle = (a: number) => qasmStatement(op('RZ', 0, [0], a))
    expect(angle(Math.PI)).toBe('rz(pi) q[0];')
    expect(angle(-Math.PI)).toBe('rz(-pi) q[0];')
    expect(angle(2 * Math.PI)).toBe('rz(2*pi) q[0];')
    expect(angle(Math.PI / 8)).toBe('rz(pi/8) q[0];')
    expect(angle(0)).toBe('rz(0) q[0];')
    expect(angle(1.2345)).toBe('rz(1.2345) q[0];')
    expect(angle(-0.1)).toBe('rz(-0.1) q[0];')
  })
})

describe('toQasm', () => {
  it('writes header and register for an empty circuit', () => {
    expect(toQasm({ numQubits: 2, operations: [] })).toBe(HEADER + 'qreg q[2];\n')
  })

  it('matches the documented example', () => {
    const circuit: Circuit = {
      numQubits: 2,
      operations: [op('RX', 2, [1], Math.PI / 2), op('CX', 1, [0, 1]), op('H', 0, [0])],
    }
    expect(toQasm(circuit)).toBe(HEADER + 'qreg q[2];\n\nh q[0];\ncx q[0],q[1];\nrx(pi/2) q[1];\n')
  })

  it('orders by column, then by lowest qubit within a column', () => {
    const circuit: Circuit = {
      numQubits: 4,
      operations: [
        op('X', 1, [3]),
        op('CX', 1, [2, 0]),
        op('H', 0, [2]),
        op('Z', 0, [0]),
        op('Y', 0, [3]),
      ],
    }
    expect(toQasm(circuit)).toBe(
      HEADER + 'qreg q[4];\n\nz q[0];\nh q[2];\ny q[3];\ncx q[2],q[0];\nx q[3];\n',
    )
  })

  it('handles a 1-qubit circuit', () => {
    expect(toQasm({ numQubits: 1, operations: [op('H', 0, [0])] })).toBe(
      HEADER + 'qreg q[1];\n\nh q[0];\n',
    )
  })

  it('handles a 6-qubit circuit', () => {
    const operations = [op('H', 0, [0]), ...[1, 2, 3, 4, 5].map((t) => op('CX', t, [t - 1, t]))]
    expect(toQasm({ numQubits: 6, operations })).toBe(
      HEADER +
        'qreg q[6];\n\nh q[0];\ncx q[0],q[1];\ncx q[1],q[2];\ncx q[2],q[3];\ncx q[3],q[4];\ncx q[4],q[5];\n',
    )
  })

  it('is deterministic and does not mutate the circuit', () => {
    const circuit: Circuit = { numQubits: 2, operations: [op('X', 1, [1]), op('H', 0, [0])] }
    const before = JSON.stringify(circuit)
    expect(toQasm(circuit)).toBe(toQasm(structuredClone(circuit)))
    expect(JSON.stringify(circuit)).toBe(before)
  })
})

describe('toQasm presets', () => {
  const expected: Record<string, string> = {
    plus: 'qreg q[1];\n\nh q[0];\n',
    bell: 'qreg q[2];\n\nh q[0];\ncx q[0],q[1];\n',
    ghz3: 'qreg q[3];\n\nh q[0];\ncx q[0],q[1];\ncx q[1],q[2];\n',
    w3:
      'qreg q[3];\n\n' +
      'ry(1.91063323625) q[0];\nry(pi/4) q[1];\ncx q[0],q[1];\nry(-pi/4) q[1];\n' +
      'cx q[0],q[1];\ncx q[1],q[2];\ncx q[0],q[1];\nx q[0];\n',
    product: 'qreg q[3];\n\nh q[0];\nx q[1];\nh q[2];\ns q[2];\n',
  }

  it('has an expectation for every preset', () => {
    expect(Object.keys(expected).sort()).toEqual(PRESETS.map((p) => p.id).sort())
  })

  it.each(PRESETS.map((p) => [p.id, p] as const))('%s', (id, preset) => {
    expect(toQasm(preset.circuit)).toBe(HEADER + expected[id])
  })
})
