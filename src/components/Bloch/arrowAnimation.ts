// Pure logic for the animated Bloch arrow (PLAN.md → V2-6). No React, no three.js.
//
// When a qubit's Bloch vector changes, the arrow glides from the old vector to the new one
// over ~250 ms instead of jumping, so you can see HOW the state moved.
//
// Why interpolate the vector itself (x, y, z) and not the angles θ, φ?
//   - A mixed state has |r| < 1. Interpolating the vector animates the length too, so an
//     arrow visibly shrinks toward the centre when a qubit becomes entangled.
//   - Angles are undefined at the poles and at r = 0; the straight line between two vectors
//     always exists.
//
// Why ease-out? The arrow starts fast and settles gently on the new value, which reads as
// "responding to my change" and keeps the final value easy to see. Under
// prefers-reduced-motion the arrow jumps straight to the new vector.
import type { BlochVector } from '../../engine/types'
import { ZERO_VECTOR_THRESHOLD, blochToThree, vectorLength, type Vec3 } from './coords'

export const ARROW_TWEEN_MS = 250

/** Cubic ease-out: fast start, slow finish. 0 → 0 and 1 → 1 exactly. */
export function easeOutCubic(t: number): number {
  const clamped = Math.min(1, Math.max(0, t))
  return 1 - (1 - clamped) ** 3
}

/** Point a fraction `t` of the way along the straight line from `a` to `b`. */
export function lerpVector(a: BlochVector, b: BlochVector, t: number): BlochVector {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  }
}

const SAME_VECTOR = 1e-12

function sameVector(a: BlochVector, b: BlochVector): boolean {
  return (
    Math.abs(a.x - b.x) < SAME_VECTOR &&
    Math.abs(a.y - b.y) < SAME_VECTOR &&
    Math.abs(a.z - b.z) < SAME_VECTOR
  )
}

export interface VectorTween {
  from: BlochVector
  to: BlochVector
  /** Start time in ms (same clock as the `now` passed to sampleTween). */
  start: number
  duration: number
}

/** Vector shown at time `now`, and whether the tween has finished (then it is exactly `to`). */
export function sampleTween(
  tween: VectorTween,
  now: number,
): { vector: BlochVector; done: boolean } {
  const t = (now - tween.start) / tween.duration
  if (t >= 1) return { vector: tween.to, done: true }
  if (t <= 0) return { vector: tween.from, done: false }
  return { vector: lerpVector(tween.from, tween.to, easeOutCubic(t)), done: false }
}

/** True if the user asked the OS for less motion. Safe where matchMedia does not exist. */
export function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    )
  } catch {
    return false
  }
}

/**
 * Keeps track of the vector currently on screen and of the running tween.
 * The sphere component calls `setTarget` when the qubit's vector changes and `frame` once
 * per rendered frame.
 */
export class ArrowAnimator {
  private shown: BlochVector
  private tween: VectorTween | null = null

  constructor(initial: BlochVector) {
    // The first vector is shown as is: nothing to animate from.
    this.shown = initial
  }

  /** Vector on screen at time `now` (mid-tween if one is running). */
  displayed(now: number): BlochVector {
    return this.tween ? sampleTween(this.tween, now).vector : this.shown
  }

  get animating(): boolean {
    return this.tween !== null
  }

  /**
   * A new vector arrived. The tween starts from what is on screen right now, so a change
   * that interrupts a running animation continues smoothly from the arrow's current spot.
   */
  setTarget(target: BlochVector, now: number, reducedMotion: boolean): void {
    if (this.tween && sameVector(this.tween.to, target)) return // already heading there
    const from = this.displayed(now)
    if (reducedMotion || sameVector(from, target)) {
      this.tween = null
      this.shown = target
      return
    }
    this.shown = from
    this.tween = { from, to: target, start: now, duration: ARROW_TWEEN_MS }
  }

  /** Advance to time `now`; returns the vector to draw and whether more frames are needed. */
  frame(now: number): { vector: BlochVector; animating: boolean } {
    if (this.tween) {
      const { vector, done } = sampleTween(this.tween, now)
      this.shown = vector
      if (done) this.tween = null
    }
    return { vector: this.shown, animating: this.tween !== null }
  }
}

/** Length of the cone (arrow head) for a full-length arrow, in sphere radii. */
export const CONE_LENGTH = 0.2
export const CONE_RADIUS = 0.075

/**
 * How to draw the arrow for vector `v`, in three.js coordinates.
 *
 * The arrow is modelled pointing along +Y (length 1) and then rotated onto `direction`;
 * the numbers below are positions/sizes along that local +Y axis:
 *   shaft from 0 to `shaftLength`, cone centred at `coneCenter`, tip dot at `length`.
 *
 * Below |r| = ZERO_VECTOR_THRESHOLD (1e-6) there is no direction to point at (maximally mixed
 * state): no arrow, the sphere shows the "r = 0" marker instead.
 */
export type ArrowShape =
  | { visible: false }
  | {
      visible: true
      length: number
      /** Unit vector in three.js coordinates. */
      direction: Vec3
      shaftLength: number
      coneLength: number
      coneRadius: number
      coneCenter: number
    }

export function arrowShape(v: BlochVector): ArrowShape {
  const length = vectorLength(v)
  if (!(length >= ZERO_VECTOR_THRESHOLD)) return { visible: false }
  const [X, Y, Z] = blochToThree(v)
  // Short vectors get a proportionally smaller cone so the head never overshoots the origin.
  const coneLength = Math.min(CONE_LENGTH, length * 0.5)
  return {
    visible: true,
    length,
    direction: [X / length, Y / length, Z / length],
    shaftLength: length - coneLength,
    coneLength,
    coneRadius: CONE_RADIUS * (coneLength / CONE_LENGTH),
    coneCenter: length - coneLength / 2,
  }
}
