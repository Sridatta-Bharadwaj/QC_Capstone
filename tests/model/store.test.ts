import { beforeEach, describe, expect, it } from 'vitest'
import { PRESETS } from '../../src/model/presets'
import { useCircuitStore } from '../../src/model/store'
import { MAX_QUBITS } from '../../src/model/types'

const initial = useCircuitStore.getState()

beforeEach(() => {
  useCircuitStore.setState(initial, true)
})

describe('circuit store', () => {
  it('adds gates and tags the change source', () => {
    const id = useCircuitStore.getState().addOperation({ gate: 'H', column: 0, qubits: [0] })
    expect(id).not.toBeNull()
    const s = useCircuitStore.getState()
    expect(s.circuit.operations).toHaveLength(1)
    expect(s.lastSource).toBe('canvas')
    expect(s.revision).toBe(1)
  })

  it('rejects collisions and invalid gates', () => {
    const { addOperation } = useCircuitStore.getState()
    addOperation({ gate: 'H', column: 0, qubits: [0] })
    expect(addOperation({ gate: 'X', column: 0, qubits: [0] })).toBeNull()
    expect(addOperation({ gate: 'X', column: 0, qubits: [5] })).toBeNull()
  })

  it('moves a gate with updateOperation', () => {
    const id = useCircuitStore.getState().addOperation({ gate: 'H', column: 0, qubits: [0] })!
    expect(useCircuitStore.getState().updateOperation(id, { column: 3, qubits: [1] })).toBe(true)
    expect(useCircuitStore.getState().circuit.operations[0]).toMatchObject({
      column: 3,
      qubits: [1],
    })
  })

  it('caps qubits at MAX_QUBITS and drops gates on removed wires', () => {
    const s = useCircuitStore.getState()
    for (let i = 0; i < 10; i++) s.addQubit()
    expect(useCircuitStore.getState().circuit.numQubits).toBe(MAX_QUBITS)
    useCircuitStore.getState().addOperation({ gate: 'X', column: 0, qubits: [MAX_QUBITS - 1] })
    useCircuitStore.getState().removeQubit()
    expect(useCircuitStore.getState().circuit.operations).toHaveLength(0)
    for (let i = 0; i < 10; i++) useCircuitStore.getState().removeQubit()
    expect(useCircuitStore.getState().circuit.numQubits).toBe(1)
  })

  it('loads presets with source "preset"', () => {
    useCircuitStore.getState().loadPreset('bell')
    const s = useCircuitStore.getState()
    expect(s.lastSource).toBe('preset')
    expect(s.circuit.numQubits).toBe(2)
    expect(s.circuit.operations.map((o) => o.gate)).toEqual(['H', 'CX'])
  })

  it('clears the selection when the selected qubit disappears', () => {
    useCircuitStore.getState().selectQubit(1)
    useCircuitStore.getState().removeQubit()
    expect(useCircuitStore.getState().selectedQubit).toBeNull()
  })
})

describe('presets', () => {
  it('are all valid, collision-free circuits', async () => {
    const { validateOperation, isPlacementFree } = await import('../../src/model/circuit')
    for (const p of PRESETS) {
      for (const op of p.circuit.operations) {
        expect(validateOperation(op, p.circuit.numQubits), `${p.id}/${op.id}`).toBeNull()
        expect(isPlacementFree(p.circuit, op.column, op.qubits, op.id), `${p.id}/${op.id}`).toBe(
          true,
        )
      }
    }
  })
})
