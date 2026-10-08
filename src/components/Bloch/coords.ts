// Pure geometry for the Bloch sphere scene. No React, no three.js: easy to unit-test.
//
// Two coordinate systems meet here:
//   - Physics (Bloch) convention: right-handed, z is UP (|0⟩ at +z, |1⟩ at −z),
//     x points toward the viewer, y points to the right.
//   - three.js convention: right-handed, Y is UP, the default camera looks down −Z.
//
// Mapping physics → three.js:   (x, y, z)  ↦  (X, Y, Z) = (y, z, x)
//   physics z (up)       → three Y (up)
//   physics y (right)    → three X (right)
//   physics x (to viewer)→ three Z (out of the screen)
// It is a cyclic permutation of the axes, so it is a rotation (no mirror):
// right-handedness is preserved (in three.js Z × X = Y, just like x × y = z in physics).
import type { BlochVector } from '../../engine/types'

export type Vec3 = [number, number, number]

/** Map a physics-convention Bloch vector (z up) to three.js coordinates (Y up). */
export function blochToThree(v: BlochVector): Vec3 {
  return [v.y, v.z, v.x]
}

/**
 * Point on a sphere of radius r from polar angle θ (from +z) and azimuth φ (from +x toward +y),
 * in physics coordinates. This is how a pure qubit cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩ sits on the sphere.
 */
export function spherical(r: number, theta: number, phi: number): BlochVector {
  return {
    x: r * Math.sin(theta) * Math.cos(phi),
    y: r * Math.sin(theta) * Math.sin(phi),
    z: r * Math.cos(theta),
  }
}

/** Closed circle of constant polar angle θ (a "latitude" line; θ = π/2 is the equator). */
export function latitudeCircle(theta: number, segments = 64): Vec3[] {
  return Array.from({ length: segments + 1 }, (_, i) =>
    blochToThree(spherical(1, theta, (2 * Math.PI * i) / segments)),
  )
}

/** Closed great circle through both poles at azimuth φ (a "longitude" line). */
export function longitudeCircle(phi: number, segments = 64): Vec3[] {
  return Array.from({ length: segments + 1 }, (_, i) =>
    blochToThree(spherical(1, (2 * Math.PI * i) / segments, phi)),
  )
}

/** Textbook viewpoint: slightly above the equator, rotated so +x comes toward the viewer's lower left. */
export const CAMERA_POSITION: Vec3 = blochToThree(
  spherical(5.2, (70 * Math.PI) / 180, (25 * Math.PI) / 180),
)

/**
 * Below this |r| the arrow is not drawn; the sphere shows a dot and an "r = 0" marker at the
 * centre instead (maximally mixed state). Engine round-off for r = 0 is ~1e-16.
 */
export const ZERO_VECTOR_THRESHOLD = 1e-6

export function vectorLength(v: BlochVector): number {
  return Math.hypot(v.x, v.y, v.z)
}
