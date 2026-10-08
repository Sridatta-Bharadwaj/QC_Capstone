// validateCircuit: the gate for every circuit that comes from outside (storage, URL, files).
import { describe, expect, it } from 'vitest'
import { PRESETS } from '../../src/model/presets'
import { MAX_OPERATIONS, MAX_QUBITS } from '../../src/model/types'
import { validateCircuit } from '../../src/model/validate'

const ok = (input: unknown) => {
  const res = validateCircuit(input)
  if (!('circuit' in res)) throw new Error(`expected valid, got: ${res.error}`)
  return res.circuit
}
const bad = (input: unknown) => {
  const res = validateCircuit(input)
  if (!('error' in res)) throw new Error('expected an error')
  return res.error
}

describe('validateCircuit', () => {
  it('accepts every preset after a JSON round trip', () => {
    for (const p of PRESETS) {
      const c = ok(JSON.parse(JSON.stringify(p.circuit)))
      expect(c.numQubits).toBe(p.circuit.numQubits)
      expect(c.operations).toHaveLength(p.circuit.operations.length)
    }
  })

  it('defaults missing initial states to |0⟩', () => {
    expect(ok({ numQubits: 2, operations: [] }).initialStates).toEqual(['0', '0'])
  })

  it('builds a fresh circuit: new ids, no extra keys', () => {
    const c = ok({
      numQubits: 1,
      operations: [{ id: '<img onerror=x>', gate: 'H', column: 0, qubits: [0], extra: 1 }],
      evil: true,
    })
    expect(c.operations[0].id).not.toContain('<')
    expect(Object.keys(c)).toEqual(['numQubits', 'initialStates', 'operations'])
    expect(Object.keys(c.operations[0]).sort()).toEqual(['column', 'gate', 'id', 'qubits'])
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'circuit'],
    ['zero qubits', { numQubits: 0, operations: [] }],
    ['too many qubits', { numQubits: MAX_QUBITS + 1, operations: [] }],
    ['fractional qubits', { numQubits: 1.5, operations: [] }],
    ['qubits as string', { numQubits: '2', operations: [] }],
    ['missing operations', { numQubits: 2 }],
    ['bad initial state', { numQubits: 1, initialStates: ['2'], operations: [] }],
    ['initial states length', { numQubits: 2, initialStates: ['0'], operations: [] }],
    ['unknown gate', { numQubits: 1, operations: [{ gate: 'FOO', column: 0, qubits: [0] }] }],
    [
      'prototype gate name',
      { numQubits: 1, operations: [{ gate: 'constructor', column: 0, qubits: [0] }] },
    ],
    ['qubit out of range', { numQubits: 2, operations: [{ gate: 'H', column: 0, qubits: [2] }] }],
    ['negative qubit', { numQubits: 2, operations: [{ gate: 'H', column: 0, qubits: [-1] }] }],
    ['wrong arity', { numQubits: 2, operations: [{ gate: 'CX', column: 0, qubits: [0] }] }],
    ['repeated qubit', { numQubits: 2, operations: [{ gate: 'CX', column: 0, qubits: [1, 1] }] }],
    ['negative column', { numQubits: 1, operations: [{ gate: 'H', column: -1, qubits: [0] }] }],
    ['huge column', { numQubits: 1, operations: [{ gate: 'H', column: 1e9, qubits: [0] }] }],
    ['missing angle', { numQubits: 1, operations: [{ gate: 'RX', column: 0, qubits: [0] }] }],
    [
      'infinite angle',
      { numQubits: 1, operations: [{ gate: 'RX', column: 0, qubits: [0], angle: Infinity }] },
    ],
    [
      'string angle',
      { numQubits: 1, operations: [{ gate: 'RX', column: 0, qubits: [0], angle: '1' }] },
    ],
    [
      'overlapping gates',
      {
        numQubits: 3,
        operations: [
          { gate: 'CX', column: 0, qubits: [0, 2] },
          { gate: 'H', column: 0, qubits: [1] },
        ],
      },
    ],
  ])('rejects %s', (_name, input) => {
    expect(bad(input)).toMatch(/\S/)
  })

  it(`rejects more than ${MAX_OPERATIONS} operations`, () => {
    const operations = Array.from({ length: MAX_OPERATIONS + 1 }, (_, i) => ({
      gate: 'H',
      column: i,
      qubits: [0],
    }))
    expect(bad({ numQubits: 1, operations })).toMatch(/limit/)
  })

  it('ignores inherited (prototype) properties', () => {
    const proto = { numQubits: 1, operations: [] }
    expect(bad(Object.create(proto))).toMatch(/\S/)
  })

  it('never throws on a hostile getter', () => {
    const input = {
      numQubits: 1,
      get operations(): never {
        throw new Error('boom')
      },
    }
    expect(bad(input)).toMatch(/\S/)
  })
})
