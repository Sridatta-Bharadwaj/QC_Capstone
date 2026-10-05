import { describe, expect, it } from 'vitest'
import {
  CAMERA_POSITION,
  blochToThree,
  latitudeCircle,
  longitudeCircle,
  spherical,
} from '../../src/components/Bloch/coords'
import { formatFixed, formatVector } from '../../src/components/Bloch/format'
import { VECTORS } from './mockVectors'

describe('blochToThree (physics z-up → three.js Y-up)', () => {
  it('puts |0⟩ (+z) straight up in three.js', () => {
    expect(blochToThree(VECTORS.zero)).toEqual([0, 1, 0])
  })

  it('maps +x toward the viewer (three +Z) and +y to the right (three +X)', () => {
    expect(blochToThree(VECTORS.plus)).toEqual([0, 0, 1])
    expect(blochToThree(VECTORS.plusI)).toEqual([1, 0, 0])
  })

  it('keeps the maximally mixed state at the origin and preserves length', () => {
    expect(blochToThree(VECTORS.maximallyMixed)).toEqual([0, 0, 0])
    const [a, b, c] = blochToThree({ x: 0.3, y: -0.4, z: 0.5 })
    expect(Math.hypot(a, b, c)).toBeCloseTo(Math.hypot(0.3, -0.4, 0.5), 12)
  })

  it('is a rotation, not a mirror: x × y still equals z after mapping', () => {
    const [x1, x2, x3] = blochToThree({ x: 1, y: 0, z: 0 })
    const [y1, y2, y3] = blochToThree({ x: 0, y: 1, z: 0 })
    const cross = [x2 * y3 - x3 * y2, x3 * y1 - x1 * y3, x1 * y2 - x2 * y1]
    expect(cross).toEqual(blochToThree({ x: 0, y: 0, z: 1 }))
  })
})

describe('sphere geometry', () => {
  it('spherical(1, θ, φ) matches the textbook pure-state angles', () => {
    const plus = spherical(1, Math.PI / 2, 0)
    expect(plus.x).toBeCloseTo(1, 12)
    expect(plus.y).toBeCloseTo(0, 12)
    expect(plus.z).toBeCloseTo(0, 12)
  })

  it('latitude and longitude circles lie on the unit sphere and are closed', () => {
    for (const circle of [latitudeCircle(Math.PI / 4, 16), longitudeCircle(Math.PI / 3, 16)]) {
      expect(circle).toHaveLength(17)
      for (const [a, b, c] of circle) expect(Math.hypot(a, b, c)).toBeCloseTo(1, 12)
      circle[0].forEach((v, i) => expect(circle[16][i]).toBeCloseTo(v, 12))
    }
  })

  it('places the camera above the equator on the +x/+y side (x appears at the lower left)', () => {
    const [right, up, toward] = CAMERA_POSITION
    expect(up).toBeGreaterThan(0) // physics z > 0
    expect(toward).toBeGreaterThan(right) // mostly along physics +x
    expect(right).toBeGreaterThan(0) // turned a little toward physics +y
  })
})

describe('number formatting', () => {
  it('uses fixed 3 decimals and uses a real minus sign (U+2212) and never prints −0.000', () => {
    expect(formatFixed(1 / 3)).toBe('0.333')
    expect(formatFixed(-1e-12)).toBe('0.000')
    expect(formatFixed(-0.70710678)).toBe('−0.707')
    expect(formatVector({ x: Math.SQRT1_2, y: -1e-15, z: -Math.SQRT1_2 })).toBe(
      '(0.707, 0.000, −0.707)',
    )
  })
})
