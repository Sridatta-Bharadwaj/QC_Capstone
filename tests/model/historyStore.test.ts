import { beforeEach, describe, expect, it } from 'vitest'
import { emptyCircuit } from '../../src/model/circuit'
import { HISTORY_LIMIT, useHistoryStore } from '../../src/model/historyStore'

const c = (n: number) => emptyCircuit(n)
const h = () => useHistoryStore.getState()

beforeEach(() => {
  h().reset(c(1))
})

describe('history store', () => {
  it('undo and redo walk the snapshots', () => {
    h().push(c(2), 'canvas')
    h().push(c(3), 'canvas')
    expect(h().canUndo).toBe(true)
    expect(h().undo()?.numQubits).toBe(2)
    expect(h().undo()?.numQubits).toBe(1)
    expect(h().undo()).toBeNull()
    expect(h().canRedo).toBe(true)
    expect(h().redo()?.numQubits).toBe(2)
  })

  it('a push after undo drops the redo tail', () => {
    h().push(c(2), 'canvas')
    h().undo()
    h().push(c(4), 'canvas')
    expect(h().canRedo).toBe(false)
    expect(h().undo()?.numQubits).toBe(1)
  })

  it('coalesces pushes with the same key into one entry', () => {
    h().push(c(2), 'canvas', { coalesceKey: 'drag-1' })
    h().push(c(3), 'canvas', { coalesceKey: 'drag-1' })
    h().push(c(4), 'canvas', { coalesceKey: 'drag-2' })
    expect(h().entries).toHaveLength(3)
    expect(h().undo()?.numQubits).toBe(3)
  })

  it(`keeps at most ${HISTORY_LIMIT} entries`, () => {
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h().push(c(1 + (i % 6)), 'canvas')
    expect(h().entries).toHaveLength(HISTORY_LIMIT)
    expect(h().index).toBe(HISTORY_LIMIT - 1)
  })
})
