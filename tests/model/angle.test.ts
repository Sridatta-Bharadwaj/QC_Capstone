import { describe, expect, it } from 'vitest'
import { formatAngle, formatAngleShort, parseAngle } from '../../src/model/angle'

describe('parseAngle', () => {
  it.each([
    ['pi', Math.PI],
    ['π/2', Math.PI / 2],
    ['-pi/4', -Math.PI / 4],
    ['3*pi/4', (3 * Math.PI) / 4],
    ['2*(pi/3)', (2 * Math.PI) / 3],
    ['0.25', 0.25],
    ['.5', 0.5],
    ['1e-3', 0.001],
    [' - - pi ', Math.PI],
    ['pi - pi/2', Math.PI / 2],
  ])('%s', (text, expected) => {
    expect(parseAngle(text)).toBeCloseTo(expected, 12)
  })

  it.each(['', 'pi/', '2pi pi', 'theta', '(pi', 'pi)', '1/0', '*2'])('rejects %j', (text) => {
    expect(parseAngle(text)).toBeNull()
  })
})

describe('formatAngle', () => {
  it.each([
    [0, '0'],
    [Math.PI, 'pi'],
    [-Math.PI / 2, '-pi/2'],
    [(3 * Math.PI) / 4, '3*pi/4'],
    [2 * Math.PI, '2*pi'],
    [0.3, '0.3'],
  ])('%f → %s', (radians, text) => {
    expect(formatAngle(radians)).toBe(text)
  })

  it('round-trips arbitrary angles closely', () => {
    const theta = 2 * Math.acos(1 / Math.sqrt(3))
    expect(parseAngle(formatAngle(theta))).toBeCloseTo(theta, 10)
  })

  it('supports a custom pi symbol', () => {
    expect(formatAngle(Math.PI / 2, 'π')).toBe('π/2')
  })
})

describe('formatAngleShort (gate box label)', () => {
  it.each([
    [0, '0'],
    [Math.PI / 2, 'π/2'],
    [(-3 * Math.PI) / 4, '−3π/4'],
    [2 * Math.acos(1 / Math.sqrt(3)), '1.911'],
    [-0.123456, '−0.1235'],
    [0.3, '0.3'],
  ])('%f → %s', (radians, text) => {
    expect(formatAngleShort(radians)).toBe(text)
  })
})
