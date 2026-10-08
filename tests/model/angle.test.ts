import { describe, expect, it } from 'vitest'
import {
  evaluateAngle,
  formatAngle,
  formatAngleShort,
  MAX_ANGLE_DEPTH,
  MAX_ANGLE_LENGTH,
  parseAngle,
  QISKIT_PI_NAMES,
} from '../../src/model/angle'

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

describe('evaluateAngle: language options and hostile input', () => {
  it('QASM names for π by default; Python names with QISKIT_PI_NAMES', () => {
    expect(parseAngle('np.pi')).toBeNull()
    expect(parseAngle('π/2', { piNames: QISKIT_PI_NAMES })).toBeNull()
    for (const name of ['pi', 'np.pi', 'numpy.pi', 'math.pi']) {
      expect(parseAngle(`-${name}/4`, { piNames: QISKIT_PI_NAMES })).toBeCloseTo(-Math.PI / 4, 12)
    }
    expect(parseAngle('np.e', { piNames: QISKIT_PI_NAMES })).toBeNull()
    expect(parseAngle('constructor', { piNames: QISKIT_PI_NAMES })).toBeNull()
  })

  it('says why an expression was rejected', () => {
    expect(evaluateAngle('pi/2')).toEqual({ value: Math.PI / 2 })
    expect(evaluateAngle('pi +')).toEqual({ error: 'Invalid angle expression.' })
    expect(evaluateAngle('1/0')).toEqual({ error: 'Angle is not a finite number.' })
    expect(evaluateAngle('1e308*10')).toEqual({ error: 'Angle is not a finite number.' })
  })

  it('rejects over-long input before reading it', () => {
    const result = evaluateAngle(`1${'+1'.repeat(MAX_ANGLE_LENGTH)}`)
    expect(result).toEqual({ error: expect.stringMatching(/too long/) })
  })

  it('caps nesting depth (parentheses and unary signs) without a stack overflow', () => {
    const ok = `${'('.repeat(MAX_ANGLE_DEPTH)}pi${')'.repeat(MAX_ANGLE_DEPTH)}`
    expect(parseAngle(ok)).toBeCloseTo(Math.PI, 12)
    const deep = `${'('.repeat(MAX_ANGLE_DEPTH + 1)}pi${')'.repeat(MAX_ANGLE_DEPTH + 1)}`
    expect(evaluateAngle(deep)).toEqual({ error: expect.stringMatching(/nested too deeply/) })
    expect(evaluateAngle(`${'-'.repeat(400)}pi`)).toEqual({
      error: expect.stringMatching(/nested too deeply/),
    })
    // 10k parentheses: rejected by the length cap, fast.
    const start = performance.now()
    expect(parseAngle(`${'('.repeat(10_000)}pi${')'.repeat(10_000)}`)).toBeNull()
    expect(performance.now() - start).toBeLessThan(100)
  })

  it('huge and non-finite numbers are rejected', () => {
    expect(parseAngle('9'.repeat(400))).toBeNull()
    expect(parseAngle('1e999')).toBeNull()
    expect(parseAngle('1e300*1e300')).toBeNull()
  })
})
