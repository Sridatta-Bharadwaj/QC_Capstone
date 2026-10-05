import { describe, expect, it } from 'vitest'
import {
  columnCount,
  earliestFreeColumn,
  isPlacementFree,
  sortedOperations,
  validateOperation,
} from '../../src/model/circuit'
import type { Circuit } from '../../src/model/types'

const circuit: Circuit = {
  numQubits: 3,
  operations: [
    { id: 'a', gate: 'H', column: 0, qubits: [0] },
    { id: 'b', gate: 'CX', column: 1, qubits: [0, 2] },
  ],
}

describe('placement', () => {
  it('a multi-qubit gate blocks every wire in its span', () => {
    expect(isPlacementFree(circuit, 1, [1])).toBe(false)
    expect(isPlacementFree(circuit, 0, [1])).toBe(true)
    expect(isPlacementFree(circuit, 1, [1], 'b')).toBe(true)
  })

  it('auto-places after the last gate touching the span', () => {
    expect(earliestFreeColumn(circuit, [1])).toBe(2)
    expect(earliestFreeColumn({ numQubits: 3, operations: [circuit.operations[0]] }, [1])).toBe(0)
  })

  it('counts columns and sorts in time order', () => {
    expect(columnCount(circuit)).toBe(2)
    expect(sortedOperations(circuit).map((o) => o.id)).toEqual(['a', 'b'])
  })
})

describe('validateOperation', () => {
  it('accepts valid gates', () => {
    expect(validateOperation({ gate: 'RX', column: 0, qubits: [0], angle: 1 }, 1)).toBeNull()
  })
  it('rejects bad arity, duplicates, range and missing angle', () => {
    expect(validateOperation({ gate: 'CX', column: 0, qubits: [0] }, 2)).not.toBeNull()
    expect(validateOperation({ gate: 'CX', column: 0, qubits: [1, 1] }, 2)).not.toBeNull()
    expect(validateOperation({ gate: 'X', column: 0, qubits: [2] }, 2)).not.toBeNull()
    expect(validateOperation({ gate: 'RZ', column: 0, qubits: [0] }, 1)).not.toBeNull()
  })
})
