import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ARROW_TWEEN_MS,
  ArrowAnimator,
  CONE_LENGTH,
  arrowShape,
  easeOutCubic,
  lerpVector,
  prefersReducedMotion,
  sampleTween,
} from '../../src/components/Bloch/arrowAnimation'
import { VECTORS } from './mockVectors'

const ZERO = { x: 0, y: 0, z: 0 }
const UP = { x: 0, y: 0, z: 1 }
const PLUS = { x: 1, y: 0, z: 0 }

describe('easeOutCubic', () => {
  it('has exact endpoints and is clamped', () => {
    expect(easeOutCubic(0)).toBe(0)
    expect(easeOutCubic(1)).toBe(1)
    expect(easeOutCubic(-1)).toBe(0)
    expect(easeOutCubic(2)).toBe(1)
  })

  it('eases out: ahead of linear and monotonic', () => {
    expect(easeOutCubic(0.5)).toBeCloseTo(0.875, 12)
    let last = 0
    for (let t = 0.05; t <= 1; t += 0.05) {
      const v = easeOutCubic(t)
      expect(v).toBeGreaterThanOrEqual(t - 1e-12)
      expect(v).toBeGreaterThan(last)
      last = v
    }
  })
})

describe('lerpVector', () => {
  it('interpolates the vector componentwise (so length changes too)', () => {
    expect(lerpVector(UP, ZERO, 0)).toEqual(UP)
    expect(lerpVector(UP, ZERO, 1)).toEqual(ZERO)
    expect(lerpVector(UP, ZERO, 0.5)).toEqual({ x: 0, y: 0, z: 0.5 })
    expect(lerpVector(UP, PLUS, 0.5)).toEqual({ x: 0.5, y: 0, z: 0.5 })
  })
})

describe('sampleTween', () => {
  const tween = { from: UP, to: PLUS, start: 1000, duration: ARROW_TWEEN_MS }

  it('starts at `from`, ends exactly at `to`', () => {
    expect(sampleTween(tween, 1000)).toEqual({ vector: UP, done: false })
    expect(sampleTween(tween, 900)).toEqual({ vector: UP, done: false })
    expect(sampleTween(tween, 1000 + ARROW_TWEEN_MS)).toEqual({ vector: PLUS, done: true })
    expect(sampleTween(tween, 5000).vector).toBe(PLUS)
  })

  it('follows ease-out in between', () => {
    const { vector } = sampleTween(tween, 1000 + ARROW_TWEEN_MS / 2)
    expect(vector.x).toBeCloseTo(0.875, 12)
    expect(vector.z).toBeCloseTo(0.125, 12)
  })
})

describe('ArrowAnimator', () => {
  it('shows the first vector immediately', () => {
    const a = new ArrowAnimator(UP)
    expect(a.frame(0)).toEqual({ vector: UP, animating: false })
  })

  it('animates to a new vector over ≈250 ms and then stops', () => {
    const a = new ArrowAnimator(UP)
    a.setTarget(ZERO, 0, false)
    expect(a.animating).toBe(true)
    const mid = a.frame(ARROW_TWEEN_MS / 2)
    expect(mid.animating).toBe(true)
    expect(mid.vector.z).toBeCloseTo(0.125, 12) // the arrow shrinks toward the centre
    expect(a.frame(ARROW_TWEEN_MS)).toEqual({ vector: ZERO, animating: false })
    expect(a.animating).toBe(false)
  })

  it('an interruption starts from the vector currently on screen', () => {
    const a = new ArrowAnimator(UP)
    a.setTarget(PLUS, 0, false)
    const shown = a.displayed(100)
    a.setTarget({ x: 0, y: 1, z: 0 }, 100, false)
    // No jump: the new tween begins exactly where the arrow was.
    expect(a.frame(100).vector).toEqual(shown)
    expect(a.frame(100 + ARROW_TWEEN_MS).vector).toEqual({ x: 0, y: 1, z: 0 })
  })

  it('re-sending the current target does not restart the tween', () => {
    const a = new ArrowAnimator(UP)
    a.setTarget(PLUS, 0, false)
    a.setTarget({ ...PLUS }, 200, false)
    expect(a.frame(ARROW_TWEEN_MS).animating).toBe(false)
  })

  it('does not animate when the vector is unchanged', () => {
    const a = new ArrowAnimator(UP)
    a.setTarget({ ...UP }, 0, false)
    expect(a.animating).toBe(false)
  })

  it('jumps immediately under reduced motion', () => {
    const a = new ArrowAnimator(UP)
    a.setTarget(PLUS, 0, true)
    expect(a.animating).toBe(false)
    expect(a.frame(0)).toEqual({ vector: PLUS, animating: false })
  })
})

describe('prefersReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('reads the media query', () => {
    const matchMedia = vi.fn((q: string) => ({ matches: q.includes('reduce') }))
    vi.stubGlobal('window', { matchMedia })
    expect(prefersReducedMotion()).toBe(true)
    expect(matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  })

  it('is false when matchMedia is missing or throws', () => {
    vi.stubGlobal('window', {})
    expect(prefersReducedMotion()).toBe(false)
    vi.stubGlobal('window', {
      matchMedia: () => {
        throw new Error('no')
      },
    })
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('arrowShape', () => {
  it('hides the arrow for r = 0 and below 1e-6 (r = 0 marker shown instead)', () => {
    expect(arrowShape(ZERO)).toEqual({ visible: false })
    expect(arrowShape({ x: 5e-7, y: 0, z: 0 })).toEqual({ visible: false })
    expect(arrowShape({ x: NaN, y: 0, z: 0 })).toEqual({ visible: false })
    expect(arrowShape({ x: 2e-6, y: 0, z: 0 }).visible).toBe(true)
  })

  it('full-length arrow: cone apex exactly at the tip', () => {
    const shape = arrowShape(VECTORS.zero)
    if (!shape.visible) throw new Error('expected a visible arrow')
    expect(shape.length).toBe(1)
    expect(shape.direction).toEqual([0, 1, 0]) // +z (|0⟩) is three.js up
    expect(shape.coneLength).toBe(CONE_LENGTH)
    expect(shape.shaftLength + shape.coneLength).toBeCloseTo(shape.length, 12)
    expect(shape.coneCenter + shape.coneLength / 2).toBeCloseTo(shape.length, 12)
  })

  it('short arrows get a proportionally smaller head that never passes the origin', () => {
    const shape = arrowShape({ x: 0.1, y: 0, z: 0 })
    if (!shape.visible) throw new Error('expected a visible arrow')
    expect(shape.coneLength).toBeCloseTo(0.05, 12)
    expect(shape.shaftLength).toBeGreaterThan(0)
    expect(shape.direction).toEqual([0, 0, 1]) // +x points toward the viewer (three +Z)
  })
})
