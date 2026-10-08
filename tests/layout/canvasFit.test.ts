import { describe, expect, it } from 'vitest'
import { ROW_H } from '../../src/components/Canvas/CircuitGrid'
import { MAX_TOP_SHARE, MIN_TOP_SHARE, fitTopHeight } from '../../src/components/Layout/canvasFit'

// Main column height at 1280×720 and the canvas chrome (header + hint footer), as measured.
const GROUP = 666
const CHROME = 59

describe('fitTopHeight', () => {
  it('never shrinks the circuit row below the minimum share', () => {
    expect(fitTopHeight(GROUP, CHROME, 1)).toBe(Math.round(MIN_TOP_SHARE * GROUP))
  })

  it('never grows it beyond the default 55 % (6 qubits)', () => {
    expect(fitTopHeight(GROUP, CHROME, 6)).toBe(Math.round(MAX_TOP_SHARE * GROUP))
  })

  it('grows by one wire per extra qubit in between', () => {
    expect(fitTopHeight(GROUP, CHROME, 4) - fitTopHeight(GROUP, CHROME, 3)).toBe(ROW_H)
  })

  it('leaves room for every wire of a 6-qubit circuit at 1280×720', () => {
    // Header + footer + ruler + 6 wires + padding, without the extra slack.
    const needed = CHROME + 20 + 6 * ROW_H + 8
    expect(fitTopHeight(GROUP, CHROME, 6)).toBeGreaterThanOrEqual(needed)
  })
})
