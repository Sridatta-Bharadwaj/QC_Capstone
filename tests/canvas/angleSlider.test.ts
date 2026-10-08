import { describe, expect, it, vi } from 'vitest'
import {
  FrameThrottle,
  KEY_STEP,
  SLIDER_MAX,
  SLIDER_MAX_TICKS,
  SLIDER_MIN,
  SLIDER_MIN_TICKS,
  angleToTicks,
  keyboardAngle,
  newGestureKey,
  sliderLabel,
  sliderValueText,
  snapAngle,
  ticksToAngle,
} from '../../src/components/Canvas/angleSlider'

const PI = Math.PI

describe('slider ticks', () => {
  it('covers −2π … 2π with π/8 exactly on a tick', () => {
    expect(ticksToAngle(SLIDER_MIN_TICKS)).toBeCloseTo(-2 * PI, 12)
    expect(ticksToAngle(SLIDER_MAX_TICKS)).toBeCloseTo(2 * PI, 12)
    expect(angleToTicks(PI / 8)).toBe(90)
    expect(ticksToAngle(90)).toBe(PI / 8)
  })

  it('rounds to the nearest tick and clamps out-of-range angles', () => {
    expect(angleToTicks(PI / 2 + 1e-6)).toBe(360)
    expect(angleToTicks(10)).toBe(SLIDER_MAX_TICKS)
    expect(angleToTicks(-10)).toBe(SLIDER_MIN_TICKS)
  })
})

describe('snapAngle (Shift)', () => {
  it.each([
    [0.4, PI / 8], // π/8 ≈ 0.393
    [PI / 2 + 0.1, PI / 2],
    [-0.15, 0], // nearer 0 than −π/8
    [-0.25, -PI / 8],
  ])('snaps %f to the nearest multiple of π/8', (input, expected) => {
    expect(snapAngle(input)).toBeCloseTo(expected, 12)
  })

  it('snaps to exact π fractions that format as such', () => {
    expect(sliderLabel(snapAngle(1.2))).toBe('3π/8')
    expect(sliderLabel(snapAngle(-2.3))).toBe('−3π/4')
    expect(snapAngle(100)).toBe(SLIDER_MAX)
  })
})

describe('slider label', () => {
  it('shows an exact π fraction when there is one, otherwise a decimal', () => {
    expect(sliderLabel(PI / 2)).toBe('π/2')
    expect(sliderLabel(-2 * PI)).toBe('−2π')
    expect(sliderLabel(0)).toBe('0')
    expect(sliderLabel(ticksToAngle(1))).toBe('0.004363')
    expect(sliderLabel(1.2)).toBe('1.2')
  })

  it('aria-valuetext uses the same text plus the unit', () => {
    expect(sliderValueText(PI / 4)).toBe('π/4 radians')
    expect(sliderValueText(-PI)).toBe('−π radians')
  })
})

describe('keyboardAngle', () => {
  it('moves 1° per arrow key', () => {
    expect(keyboardAngle(0, 'ArrowRight', false)).toBeCloseTo(KEY_STEP, 12)
    expect(keyboardAngle(0, 'ArrowUp', false)).toBeCloseTo(KEY_STEP, 12)
    expect(keyboardAngle(0, 'ArrowLeft', false)).toBeCloseTo(-KEY_STEP, 12)
    expect(keyboardAngle(0, 'ArrowDown', false)).toBeCloseTo(-KEY_STEP, 12)
  })

  it('Shift+arrows and PageUp/PageDown jump to the next π/8 mark', () => {
    expect(keyboardAngle(0, 'ArrowRight', true)).toBeCloseTo(PI / 8, 12)
    expect(keyboardAngle(PI / 8, 'ArrowRight', true)).toBeCloseTo(PI / 4, 12)
    expect(keyboardAngle(0.1, 'ArrowLeft', true)).toBeCloseTo(0, 12)
    expect(keyboardAngle(PI / 8, 'PageDown', false)).toBeCloseTo(0, 12)
    expect(keyboardAngle(0.1, 'PageUp', false)).toBeCloseTo(PI / 8, 12)
  })

  it('Home/End go to the ends, and the range is clamped', () => {
    expect(keyboardAngle(1, 'Home', false)).toBe(SLIDER_MIN)
    expect(keyboardAngle(1, 'End', false)).toBe(SLIDER_MAX)
    expect(keyboardAngle(SLIDER_MAX, 'ArrowRight', false)).toBe(SLIDER_MAX)
    expect(keyboardAngle(SLIDER_MIN, 'PageDown', false)).toBe(SLIDER_MIN)
  })

  it('ignores other keys', () => {
    expect(keyboardAngle(0, 'a', false)).toBeNull()
    expect(keyboardAngle(0, 'Enter', true)).toBeNull()
  })
})

describe('newGestureKey', () => {
  it('never repeats a key', () => {
    const a = newGestureKey('slider', 'op1')
    const b = newGestureKey('slider', 'op1')
    expect(a).not.toBe(b)
    expect(a).toMatch(/^slider:op1:\d+$/)
  })
})

describe('FrameThrottle', () => {
  function setup() {
    const frames: (() => void)[] = []
    const commit = vi.fn()
    const cancel = vi.fn()
    const throttle = new FrameThrottle(
      commit,
      (cb) => frames.push(cb),
      (handle) => cancel(handle),
    )
    return { frames, commit, cancel, throttle }
  }

  it('commits only the latest value, once per frame', () => {
    const { frames, commit, throttle } = setup()
    throttle.push(1)
    throttle.push(2)
    throttle.push(3)
    expect(frames).toHaveLength(1)
    expect(commit).not.toHaveBeenCalled()
    frames[0]()
    expect(commit).toHaveBeenCalledExactlyOnceWith(3)
    throttle.push(4)
    expect(frames).toHaveLength(2)
    frames[1]()
    expect(commit).toHaveBeenLastCalledWith(4)
    expect(commit).toHaveBeenCalledTimes(2)
  })

  it('flush commits the pending value now and cancels the frame', () => {
    const { frames, commit, cancel, throttle } = setup()
    throttle.push(5)
    throttle.flush()
    expect(commit).toHaveBeenCalledExactlyOnceWith(5)
    expect(cancel).toHaveBeenCalledTimes(1)
    frames[0]() // a late frame has nothing left to commit
    expect(commit).toHaveBeenCalledTimes(1)
    throttle.flush()
    expect(commit).toHaveBeenCalledTimes(1)
  })
})
