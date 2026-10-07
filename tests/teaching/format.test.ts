import { describe, expect, it } from 'vitest'
import {
  MAX_DISPLAY_QUBITS,
  MINUS,
  basisBits,
  basisLabel,
  basisParts,
  blochFromRho,
  cellKey,
  formatComplex,
  formatReal,
  formatScientific,
  isZero,
  maxAbsDifference,
  qubitList,
  subscript,
} from '../../src/components/Teaching/format'

const c = (re: number, im = 0) => ({ re, im })
const S = Math.SQRT1_2 / 2 // 0.35355…

describe('formatReal', () => {
  it('uses fixed decimals and a real minus sign', () => {
    expect(formatReal(0.5)).toBe('0.500')
    expect(formatReal(-0.25)).toBe(`${MINUS}0.250`)
  })
  it('never prints negative zero', () => {
    expect(formatReal(-1e-17)).toBe('0.000')
    expect(formatReal(-0.0004)).toBe('0.000')
  })
})

describe('formatComplex', () => {
  it('formats real, imaginary and mixed values', () => {
    expect(formatComplex(c(0.5))).toBe('0.500')
    expect(formatComplex(c(S, -S))).toBe(`0.354 ${MINUS} 0.354i`)
    expect(formatComplex(c(-S, S))).toBe(`${MINUS}0.354 + 0.354i`)
    expect(formatComplex(c(0, -0.5))).toBe(`${MINUS}0.500i`)
    expect(formatComplex(c(0, 1))).toBe('1.000i')
  })
  it('drops parts that round to zero and never shows -0.000', () => {
    expect(formatComplex(c(-1e-17, -1e-17))).toBe('0.000')
    expect(formatComplex(c(0.5, -1e-17))).toBe('0.500')
    expect(formatComplex(c(-1e-17, 0.25))).toBe('0.250i')
    expect(formatComplex(c(0, 0))).not.toContain('-')
  })
})

describe('formatScientific', () => {
  it('prints exact zero as 0 and small numbers in e-notation', () => {
    expect(formatScientific(0)).toBe('0')
    expect(formatScientific(1.234e-16)).toBe('1.2e−16')
  })
})

describe('basis labels (big-endian: q0 is the leftmost bit)', () => {
  it('splits an index into bits', () => {
    expect(basisBits(1, 2)).toEqual([0, 1])
    expect(basisBits(6, 3)).toEqual([1, 1, 0])
    expect(basisLabel(1, 2)).toBe('|01⟩')
    expect(basisLabel(4, 3)).toBe('|100⟩')
    expect(basisLabel(1, 1)).toBe('|1⟩')
  })
  it('flags the highlighted qubit bit', () => {
    const parts = basisParts(2, 3, 1) // |010⟩, highlight q1
    expect(parts.map((p) => p.bit)).toEqual([0, 1, 0])
    expect(parts.map((p) => p.highlighted)).toEqual([false, true, false])
    expect(basisParts(2, 3, null).some((p) => p.highlighted)).toBe(false)
  })
})

describe('misc helpers', () => {
  it('readable-size threshold is 4 qubits (16×16)', () => {
    expect(MAX_DISPLAY_QUBITS).toBe(4)
  })
  it('subscript', () => {
    expect(subscript(0)).toBe('₀')
    expect(subscript('01')).toBe('₀₁')
    expect(subscript(12)).toBe('₁₂')
  })
  it('isZero, cellKey, qubitList', () => {
    expect(isZero(c(1e-12, -1e-12))).toBe(true)
    expect(isZero(c(0, 1e-3))).toBe(false)
    expect(cellKey(3, 5)).toBe('3,5')
    expect(qubitList([0, 2])).toBe('q0, q2')
    expect(qubitList([])).toBeNull()
  })
  it('maxAbsDifference', () => {
    const a = [
      [c(0.5), c(0)],
      [c(0), c(0.5)],
    ]
    const b = [
      [c(0.5), c(0, 1e-3)],
      [c(0), c(0.5)],
    ]
    expect(maxAbsDifference(a, a)).toBe(0)
    expect(maxAbsDifference(a, b)).toBeCloseTo(1e-3, 12)
  })
  it('blochFromRho reads r off the matrix', () => {
    // |+i⟩ = (|0⟩ + i|1⟩)/√2 → ρ = ½[[1, −i], [i, 1]] → r = (0, 1, 0)
    const rho = [
      [c(0.5), c(0, -0.5)],
      [c(0, 0.5), c(0.5)],
    ]
    expect(blochFromRho(rho)).toEqual({ x: 0, y: 1, z: 0 })
    // |1⟩ → r = (0, 0, −1)
    expect(
      blochFromRho([
        [c(0), c(0)],
        [c(0), c(1)],
      ]).z,
    ).toBe(-1)
  })
})
