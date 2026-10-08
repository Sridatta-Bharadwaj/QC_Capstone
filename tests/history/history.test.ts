import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  isNewCircuit,
  newCircuit,
  redoCircuit,
  runWithHistoryKey,
  startHistoryTracking,
  undoCircuit,
} from '../../src/history/history'
import { circuitsEqual, emptyCircuit } from '../../src/model/circuit'
import { HISTORY_LIMIT, useHistoryStore } from '../../src/model/historyStore'
import { useCircuitStore } from '../../src/model/store'

const initial = useCircuitStore.getState()
let stop: () => void = () => {}

beforeEach(() => {
  useCircuitStore.setState(initial, true)
  stop = startHistoryTracking()
})

afterEach(() => stop())

const store = () => useCircuitStore.getState()
const hist = () => useHistoryStore.getState()

describe('history wiring', () => {
  it('starts with one entry and nothing to undo', () => {
    expect(hist().entries).toHaveLength(1)
    expect(hist().canUndo).toBe(false)
    expect(hist().canRedo).toBe(false)
  })

  it('records canvas edits and undoes/redoes them with source history', () => {
    store().addOperation({ gate: 'H', column: 0, qubits: [0] })
    store().addOperation({ gate: 'CX', column: 1, qubits: [0, 1] })
    expect(hist().entries).toHaveLength(3)

    expect(undoCircuit()).toBe(true)
    expect(store().circuit.operations.map((o) => o.gate)).toEqual(['H'])
    expect(store().lastSource).toBe('history')
    // Undo/redo must not push new entries.
    expect(hist().entries).toHaveLength(3)

    expect(undoCircuit()).toBe(true)
    expect(store().circuit.operations).toHaveLength(0)
    expect(undoCircuit()).toBe(false)

    expect(redoCircuit()).toBe(true)
    expect(redoCircuit()).toBe(true)
    expect(store().circuit.operations).toHaveLength(2)
    expect(redoCircuit()).toBe(false)
    expect(hist().entries).toHaveLength(3)
  })

  it('a new change after undo drops the redo tail', () => {
    store().addOperation({ gate: 'H', column: 0, qubits: [0] })
    undoCircuit()
    store().addOperation({ gate: 'X', column: 0, qubits: [0] })
    expect(hist().canRedo).toBe(false)
    expect(hist().entries).toHaveLength(2)
  })

  it('records every external source (preset, file, url, qasm, qiskit) but not restore', () => {
    store().loadPreset('bell')
    store().setCircuit(emptyCircuit(3), 'file')
    store().setCircuit(emptyCircuit(4), 'url')
    store().setCircuit(emptyCircuit(5), 'qasm')
    store().setCircuit(emptyCircuit(6), 'qiskit')
    store().setCircuit(emptyCircuit(1), 'restore')
    expect(hist().entries.map((e) => e.source)).toEqual([
      'restore',
      'preset',
      'file',
      'url',
      'qasm',
      'qiskit',
    ])
  })

  it('skips changes that leave the circuit as it was', () => {
    store().setCircuit(emptyCircuit(2), 'qasm')
    expect(hist().entries).toHaveLength(1)
  })

  it('coalesces changes made under the same key into one entry', () => {
    const id = store().addOperation({ gate: 'RX', column: 0, qubits: [0], angle: 0 })!
    const before = store().circuit
    for (const angle of [0.1, 0.2, 0.3, 0.4]) {
      runWithHistoryKey('slider:drag-1', () => store().updateOperation(id, { angle }))
    }
    expect(hist().entries).toHaveLength(3) // initial, add, one coalesced drag
    expect(hist().entries[2].coalesceKey).toBe('slider:drag-1')

    undoCircuit()
    expect(circuitsEqual(store().circuit, before)).toBe(true)
    expect(store().circuit.operations[0].angle).toBe(0)

    redoCircuit()
    expect(store().circuit.operations[0].angle).toBe(0.4)

    // A second drag is a separate entry.
    runWithHistoryKey('slider:drag-2', () => store().updateOperation(id, { angle: 1 }))
    expect(hist().entries).toHaveLength(4)
  })

  it('restores the outer key after runWithHistoryKey, even when fn throws', () => {
    expect(() =>
      runWithHistoryKey('k', () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    store().addOperation({ gate: 'H', column: 0, qubits: [0] })
    expect(hist().entries.at(-1)?.coalesceKey).toBeUndefined()
  })

  it('caps the history at HISTORY_LIMIT entries', () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      store().addOperation({ gate: 'H', column: i, qubits: [0] })
    }
    expect(hist().entries).toHaveLength(HISTORY_LIMIT)
  })

  it('New circuit clears to 2 qubits, all |0⟩, and is undoable', () => {
    store().loadPreset('ghz3')
    expect(isNewCircuit(store().circuit)).toBe(false)
    newCircuit()
    expect(isNewCircuit(store().circuit)).toBe(true)
    expect(store().circuit.initialStates).toEqual(['0', '0'])
    undoCircuit()
    expect(store().circuit.numQubits).toBe(3)
  })

  it('isNewCircuit is false when an initial state differs', () => {
    expect(isNewCircuit({ ...emptyCircuit(2), initialStates: ['0', '+'] })).toBe(false)
  })
})
