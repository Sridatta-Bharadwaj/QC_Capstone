import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ROTATION_ANGLE,
  MIN_VISIBLE_COLUMNS,
  defaultQubits,
  gateParts,
  planAppend,
  planDrop,
  qubitRoles,
  retargetQubits,
  visibleColumnCount,
} from '../../src/components/Canvas/placement'
import type { Circuit } from '../../src/model/types'
import { defaultInitialStates } from '../../src/model/circuit'

const circuit = (numQubits: number, operations: Circuit['operations'] = []): Circuit => ({
  numQubits,
  initialStates: defaultInitialStates(numQubits),
  operations,
})

describe('defaultQubits', () => {
  it('puts single-qubit gates on the drop wire', () => {
    expect(defaultQubits('H', 2, 3)).toEqual([2])
  })

  it('uses the drop wire as control and the next wire as target', () => {
    expect(defaultQubits('CX', 0, 3)).toEqual([0, 1])
    expect(defaultQubits('CCX', 0, 3)).toEqual([0, 1, 2])
  })

  it('goes upward at the bottom of the circuit', () => {
    expect(defaultQubits('CX', 2, 3)).toEqual([2, 1])
    expect(defaultQubits('CCX', 3, 4)).toEqual([3, 2, 1])
  })

  it('falls back to the block that fits, keeping the drop wire first', () => {
    expect(defaultQubits('CCX', 1, 3)).toEqual([1, 0, 2])
  })

  it('returns null when the circuit is too small', () => {
    expect(defaultQubits('CX', 0, 1)).toBeNull()
    expect(defaultQubits('CCX', 0, 2)).toBeNull()
  })
})

describe('planDrop from the palette', () => {
  it('creates a gate at the drop cell', () => {
    const plan = planDrop(circuit(2), { kind: 'palette', gate: 'H' }, { qubit: 1, column: 3 })
    expect(plan).toMatchObject({ ok: true, kind: 'add', op: { gate: 'H', column: 3, qubits: [1] } })
  })

  it('gives new rotations the default angle', () => {
    const plan = planDrop(circuit(1), { kind: 'palette', gate: 'RY' }, { qubit: 0, column: 0 })
    expect(plan.ok && plan.kind === 'add' && plan.op.angle).toBe(DEFAULT_ROTATION_ANGLE)
  })

  it('refuses gates that need more qubits than the circuit has', () => {
    const plan = planDrop(circuit(2), { kind: 'palette', gate: 'CCX' }, { qubit: 0, column: 0 })
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.reason).toMatch(/CCX needs 3 qubits/)
  })

  it('refuses occupied cells, including wires crossed by a multi-qubit gate', () => {
    const c = circuit(3, [{ id: 'a', gate: 'CX', column: 0, qubits: [0, 2] }])
    const plan = planDrop(c, { kind: 'palette', gate: 'H' }, { qubit: 1, column: 0 })
    expect(plan.ok).toBe(false)
    expect(!plan.ok && plan.reason).toMatch(/Column 0/)
  })

  it('refuses negative columns', () => {
    const plan = planDrop(circuit(1), { kind: 'palette', gate: 'H' }, { qubit: 0, column: -1 })
    expect(plan.ok).toBe(false)
  })
})

describe('planDrop for moves', () => {
  const c = circuit(4, [
    { id: 'cx', gate: 'CX', column: 0, qubits: [0, 1] },
    { id: 'h', gate: 'H', column: 2, qubits: [3] },
  ])

  it('keeps relative offsets, anchored on the grabbed part', () => {
    // Grab the target (q1) and drop it on q3: everything shifts by +2.
    const plan = planDrop(
      c,
      { kind: 'operation', id: 'cx', grabbedQubit: 1 },
      { qubit: 3, column: 1 },
    )
    expect(plan).toMatchObject({ ok: true, kind: 'move', patch: { column: 1, qubits: [2, 3] } })
  })

  it('refuses moves that leave the circuit', () => {
    const plan = planDrop(
      c,
      { kind: 'operation', id: 'cx', grabbedQubit: 0 },
      { qubit: 3, column: 1 },
    )
    expect(plan.ok).toBe(false)
  })

  it('refuses moves onto another gate but ignores the moved gate itself', () => {
    const blocked = planDrop(
      c,
      { kind: 'operation', id: 'cx', grabbedQubit: 0 },
      { qubit: 2, column: 2 },
    )
    expect(blocked.ok).toBe(false)
    const same = planDrop(
      c,
      { kind: 'operation', id: 'cx', grabbedQubit: 0 },
      { qubit: 1, column: 0 },
    )
    expect(same).toMatchObject({ ok: true, patch: { qubits: [1, 2], column: 0 } })
  })

  it('reports a missing gate', () => {
    const plan = planDrop(
      c,
      { kind: 'operation', id: 'nope', grabbedQubit: 0 },
      { qubit: 0, column: 0 },
    )
    expect(plan.ok).toBe(false)
  })
})

describe('planAppend', () => {
  it('places the gate after the last gate on its wires', () => {
    const c = circuit(2, [
      { id: 'a', gate: 'H', column: 0, qubits: [0] },
      { id: 'b', gate: 'X', column: 3, qubits: [1] },
    ])
    expect(planAppend(c, 'H', 0)).toMatchObject({ ok: true, column: 1, qubits: [0] })
    expect(planAppend(c, 'CX', 0)).toMatchObject({ ok: true, column: 4, qubits: [0, 1] })
  })

  it('refuses gates that do not fit', () => {
    expect(planAppend(circuit(1), 'SWAP', 0).ok).toBe(false)
  })
})

describe('helpers', () => {
  it('retargetQubits swaps roles when the wire is already used', () => {
    expect(retargetQubits([0, 1], 1, 2)).toEqual([0, 2])
    expect(retargetQubits([0, 1], 0, 1)).toEqual([1, 0])
    expect(retargetQubits([0, 1, 2], 2, 0)).toEqual([2, 1, 0])
  })

  it('names roles and parts per gate', () => {
    expect(qubitRoles('CX')).toEqual(['Control', 'Target'])
    expect(qubitRoles('CCX')).toHaveLength(3)
    expect(gateParts('CX')).toEqual(['control', 'target'])
    expect(gateParts('CZ')).toEqual(['control', 'control'])
    expect(gateParts('SWAP')).toEqual(['swap', 'swap'])
    expect(gateParts('RZ')).toEqual(['box'])
  })

  it('shows at least the minimum number of columns plus empty room', () => {
    expect(visibleColumnCount(0)).toBe(MIN_VISIBLE_COLUMNS)
    expect(visibleColumnCount(20)).toBeGreaterThan(20)
  })
})
