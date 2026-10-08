// Pure logic behind the rotation-angle slider in the gate inspector (PLAN.md → V2-6).
//
// The native <input type="range"> works in whole "ticks" so that its values are exact
// integers (no floating-point drift while dragging):
//
//   1 tick = π/720 rad = 0.25°        range −2π … 2π  =  −1440 … 1440 ticks
//
// π/8 is exactly 90 ticks, so the Shift-snap positions (multiples of π/8) all sit on ticks.
import { formatAngleShort } from '../../model/angle'

/** Ticks per π radians (one tick = 0.25°). */
export const TICKS_PER_PI = 720
export const SLIDER_MIN_TICKS = -2 * TICKS_PER_PI
export const SLIDER_MAX_TICKS = 2 * TICKS_PER_PI
export const SLIDER_MIN = -2 * Math.PI
export const SLIDER_MAX = 2 * Math.PI

/** Shift snaps the slider to multiples of this (π/8 = 22.5°). */
export const SNAP_STEP = Math.PI / 8
/** One arrow-key press without Shift moves the angle by 1°. */
export const KEY_STEP = Math.PI / 180

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value))

/** Radians → slider ticks (rounded, clamped to the slider range). */
export function angleToTicks(angle: number): number {
  return clamp(Math.round((angle / Math.PI) * TICKS_PER_PI), SLIDER_MIN_TICKS, SLIDER_MAX_TICKS)
}

/** Slider ticks → radians. */
export function ticksToAngle(ticks: number): number {
  return (ticks / TICKS_PER_PI) * Math.PI
}

/** Nearest multiple of `step` (default π/8), kept inside the slider range. */
export function snapAngle(angle: number, step = SNAP_STEP): number {
  return clamp(Math.round(angle / step) * step, SLIDER_MIN, SLIDER_MAX)
}

/**
 * Text next to the slider: an exact π fraction when there is one ("π/2", "−3π/4"),
 * otherwise a short decimal in radians ("1.911").
 */
export function sliderLabel(angle: number): string {
  return formatAngleShort(angle)
}

/** What a screen reader announces for the slider (aria-valuetext). */
export function sliderValueText(angle: number): string {
  return `${sliderLabel(angle)} radians`
}

/** Tolerance so an angle already on a π/8 mark counts as "on" it despite rounding. */
const ON_MARK = 1e-9

/**
 * New angle for a key press on the slider, or null if the key is not a slider key.
 *   ←/↓ and →/↑: ±1°; with Shift: to the previous/next multiple of π/8
 *   PageDown/PageUp: to the previous/next multiple of π/8
 *   Home/End: −2π / 2π
 */
export function keyboardAngle(angle: number, key: string, shift: boolean): number | null {
  const marks = angle / SNAP_STEP
  const nextMark = (Math.floor(marks + ON_MARK) + 1) * SNAP_STEP
  const prevMark = (Math.ceil(marks - ON_MARK) - 1) * SNAP_STEP
  let next: number
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = shift ? nextMark : angle + KEY_STEP
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      next = shift ? prevMark : angle - KEY_STEP
      break
    case 'PageUp':
      next = nextMark
      break
    case 'PageDown':
      next = prevMark
      break
    case 'Home':
      next = SLIDER_MIN
      break
    case 'End':
      next = SLIDER_MAX
      break
    default:
      return null
  }
  return clamp(next, SLIDER_MIN, SLIDER_MAX)
}

/** Counter shared by every slider instance, so a history key is never reused. */
let gestureCount = 0

/**
 * A fresh undo-history coalesce key for one gesture (one drag, or one key press with its
 * auto-repeat). All circuit changes made with the same key become one undo step.
 */
export function newGestureKey(kind: 'slider' | 'slider-key', opId: string): string {
  gestureCount += 1
  return `${kind}:${opId}:${gestureCount}`
}

type Schedule = (callback: () => void) => number
type Cancel = (handle: number) => void

/**
 * Throttles slider values to at most one commit per animation frame.
 *
 * A pointer drag fires `input` events faster than the screen refreshes; recomputing the
 * circuit (and the worker's simulation) for each would be wasted work. `push` only remembers
 * the latest value and asks for one animation frame; that frame commits it. `flush` commits
 * a pending value right away (on release, so the final position is never lost).
 */
export class FrameThrottle {
  private pending: number | null = null
  private frame: number | null = null
  private readonly commit: (value: number) => void
  private readonly schedule: Schedule
  private readonly cancelFrame: Cancel

  constructor(commit: (value: number) => void, schedule?: Schedule, cancel?: Cancel) {
    this.commit = commit
    // Looked up at call time so tests can stub requestAnimationFrame.
    this.schedule = schedule ?? ((cb) => requestAnimationFrame(cb))
    this.cancelFrame = cancel ?? ((handle) => cancelAnimationFrame(handle))
  }

  push(value: number): void {
    this.pending = value
    if (this.frame === null) {
      this.frame = this.schedule(() => {
        this.frame = null
        this.commitPending()
      })
    }
  }

  /** Commit the pending value now (if any) and drop the scheduled frame. */
  flush(): void {
    if (this.frame !== null) {
      this.cancelFrame(this.frame)
      this.frame = null
    }
    this.commitPending()
  }

  private commitPending(): void {
    if (this.pending === null) return
    const value = this.pending
    this.pending = null
    this.commit(value)
  }
}
