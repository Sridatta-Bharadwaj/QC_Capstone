import { describe, expect, it } from 'vitest'
import { qiskitStatement, toQiskit } from '../../src/codegen'
import { PRESETS } from '../../src/model/presets'
import { GATE_TYPES, type Circuit, type GateType, type Operation } from '../../src/model/types'
import { defaultInitialStates } from '../../src/model/circuit'

let nextId = 0
function op(gate: GateType, column: number, qubits: number[], angle?: number): Operation {
  nextId += 1
  return { id: `t${nextId}`, gate, column, qubits, ...(angle === undefined ? {} : { angle }) }
}

const PI_IMPORT = 'from math import pi\n\n'
const IMPORTS =
  'from qiskit import QuantumCircuit\n' +
  'from qiskit.quantum_info import Statevector, partial_trace\n\n'

const TRACE =
  '\n# Reduced density matrix of each qubit: trace out all the others.\n' +
  '# Note: Qiskit orders qubits little-endian (q0 is the rightmost bit), but\n' +
  '# partial_trace works with qubit indices, so rho[k] is still qubit k.\n' +
  'state = Statevector(qc)\n' +
  'rho = [partial_trace(state, [j for j in range(qc.num_qubits) if j != k]) for k in range(qc.num_qubits)]\n'

describe('qiskitStatement', () => {
  const cases: [Operation, string][] = [
    [op('I', 0, [0]), 'qc.id(0)'],
    [op('H', 0, [1]), 'qc.h(1)'],
    [op('X', 0, [2]), 'qc.x(2)'],
    [op('Y', 0, [0]), 'qc.y(0)'],
    [op('Z', 0, [0]), 'qc.z(0)'],
    [op('S', 0, [0]), 'qc.s(0)'],
    [op('Sdg', 0, [0]), 'qc.sdg(0)'],
    [op('T', 0, [0]), 'qc.t(0)'],
    [op('Tdg', 0, [0]), 'qc.tdg(0)'],
    [op('RX', 0, [1], Math.PI / 2), 'qc.rx(pi/2, 1)'],
    [op('RY', 0, [0], (-3 * Math.PI) / 4), 'qc.ry(-3*pi/4, 0)'],
    [op('RZ', 0, [2], 0.25), 'qc.rz(0.25, 2)'],
    [op('CX', 0, [0, 1]), 'qc.cx(0, 1)'],
    [op('CX', 0, [2, 0]), 'qc.cx(2, 0)'],
    [op('CZ', 0, [1, 0]), 'qc.cz(1, 0)'],
    [op('SWAP', 0, [0, 3]), 'qc.swap(0, 3)'],
    [op('CCX', 0, [0, 2, 1]), 'qc.ccx(0, 2, 1)'],
  ]

  it.each(cases)('%# %j', (operation, expected) => {
    expect(qiskitStatement(operation)).toBe(expected)
  })

  it('covers every gate type', () => {
    const covered = new Set(cases.map(([o]) => o.gate))
    expect([...covered].sort()).toEqual([...GATE_TYPES].sort())
  })

  it('formats angles as pi fractions or decimals', () => {
    const angle = (a: number) => qiskitStatement(op('RX', 0, [0], a))
    expect(angle(Math.PI)).toBe('qc.rx(pi, 0)')
    expect(angle(2 * Math.PI)).toBe('qc.rx(2*pi, 0)')
    expect(angle(-Math.PI / 3)).toBe('qc.rx(-pi/3, 0)')
    expect(angle(0)).toBe('qc.rx(0, 0)')
    expect(angle(1.2345)).toBe('qc.rx(1.2345, 0)')
  })
})

describe('toQiskit', () => {
  it('matches the documented example', () => {
    const circuit: Circuit = {
      numQubits: 2,
      initialStates: defaultInitialStates(2),
      operations: [op('CX', 1, [0, 1]), op('RX', 2, [1], Math.PI / 2), op('H', 0, [0])],
    }
    expect(toQiskit(circuit)).toBe(
      PI_IMPORT +
        IMPORTS +
        'qc = QuantumCircuit(2)\nqc.h(0)\nqc.cx(0, 1)\nqc.rx(pi/2, 1)\n' +
        TRACE,
    )
  })

  it('handles an empty circuit', () => {
    expect(toQiskit({ numQubits: 3, initialStates: defaultInitialStates(3), operations: [] })).toBe(
      IMPORTS + 'qc = QuantumCircuit(3)\n' + TRACE,
    )
  })

  it('orders by column, then by lowest qubit within a column', () => {
    const circuit: Circuit = {
      numQubits: 3,
      initialStates: defaultInitialStates(3),
      operations: [op('CZ', 1, [2, 1]), op('X', 0, [2]), op('H', 0, [0]), op('T', 1, [0])],
    }
    expect(toQiskit(circuit)).toBe(
      IMPORTS + 'qc = QuantumCircuit(3)\nqc.h(0)\nqc.x(2)\nqc.t(0)\nqc.cz(2, 1)\n' + TRACE,
    )
  })

  it('uses DensityMatrix for a 1-qubit circuit (nothing to trace out)', () => {
    expect(
      toQiskit({
        numQubits: 1,
        initialStates: defaultInitialStates(1),
        operations: [op('H', 0, [0])],
      }),
    ).toBe(
      'from qiskit import QuantumCircuit\n' +
        'from qiskit.quantum_info import DensityMatrix, Statevector\n\n' +
        'qc = QuantumCircuit(1)\nqc.h(0)\n\n' +
        '# Only one qubit, so there is nothing to trace out:\n' +
        '# its reduced density matrix is the full density matrix |psi><psi|.\n' +
        'state = Statevector(qc)\nrho = [DensityMatrix(state)]\n',
    )
  })

  it('imports pi only when an angle uses it', () => {
    const rx = (angle: number) =>
      toQiskit({
        numQubits: 2,
        initialStates: defaultInitialStates(2),
        operations: [op('RX', 0, [0], angle)],
      })
    expect(rx(Math.PI / 2).startsWith(PI_IMPORT + 'from qiskit import')).toBe(true)
    expect(rx(-Math.PI).startsWith(PI_IMPORT)).toBe(true)
    expect(rx(0.25)).not.toContain('from math import pi')
    expect(rx(0.25).startsWith(IMPORTS)).toBe(true)
    expect(
      toQiskit({
        numQubits: 2,
        initialStates: defaultInitialStates(2),
        operations: [op('H', 0, [0])],
      }),
    ).not.toContain('math')
  })

  it('handles a 6-qubit circuit', () => {
    const operations = [
      op('H', 0, [0]),
      ...[1, 2, 3, 4, 5].map((t) => op('CX', t, [t - 1, t])),
      op('CCX', 6, [0, 5, 3]),
    ]
    expect(toQiskit({ numQubits: 6, initialStates: defaultInitialStates(6), operations })).toBe(
      IMPORTS +
        'qc = QuantumCircuit(6)\nqc.h(0)\nqc.cx(0, 1)\nqc.cx(1, 2)\nqc.cx(2, 3)\nqc.cx(3, 4)\n' +
        'qc.cx(4, 5)\nqc.ccx(0, 5, 3)\n' +
        TRACE,
    )
  })
})

describe('toQiskit presets', () => {
  const body: Record<string, string> = {
    bell: 'qc = QuantumCircuit(2)\nqc.h(0)\nqc.cx(0, 1)\n',
    ghz3: 'qc = QuantumCircuit(3)\nqc.h(0)\nqc.cx(0, 1)\nqc.cx(1, 2)\n',
    w3:
      'qc = QuantumCircuit(3)\nqc.ry(1.91063323625, 0)\nqc.ry(pi/4, 1)\nqc.cx(0, 1)\n' +
      'qc.ry(-pi/4, 1)\nqc.cx(0, 1)\nqc.cx(1, 2)\nqc.cx(0, 1)\nqc.x(0)\n',
    product: 'qc = QuantumCircuit(3)\nqc.h(0)\nqc.x(1)\nqc.h(2)\nqc.s(2)\n',
    partial: 'qc = QuantumCircuit(2)\nqc.ry(pi/3, 0)\nqc.cx(0, 1)\n',
    kickback:
      'qc = QuantumCircuit(2)\n# initial states\nqc.h(0)\nqc.x(1)\nqc.h(1)\n# end initial states\n' +
      'qc.cx(0, 1)\n',
  }

  it('covers every multi-qubit preset', () => {
    const multi = PRESETS.filter((p) => p.circuit.numQubits > 1).map((p) => p.id)
    expect(Object.keys(body).sort()).toEqual(multi.sort())
  })

  it.each(Object.keys(body))('%s', (id) => {
    const preset = PRESETS.find((p) => p.id === id)!
    const imports = body[id].includes('pi') ? PI_IMPORT + IMPORTS : IMPORTS
    expect(toQiskit(preset.circuit)).toBe(imports + body[id] + TRACE)
  })

  it('plus (single qubit)', () => {
    const preset = PRESETS.find((p) => p.id === 'plus')!
    expect(toQiskit(preset.circuit)).toContain('qc = QuantumCircuit(1)\nqc.h(0)\n')
    expect(toQiskit(preset.circuit)).toContain('rho = [DensityMatrix(state)]')
  })
})
