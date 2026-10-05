// Complex-number helpers.
//
// A complex number z = re + i·im. Quantum amplitudes are complex, so every
// part of the engine is built on these few operations. They return new
// objects (never mutate) so the code reads like the math on paper.
import type { Complex } from './types'

/** z = re + i·im */
export function complex(re: number, im = 0): Complex {
  return { re, im }
}

export const ZERO: Complex = complex(0, 0)
export const ONE: Complex = complex(1, 0)

export function add(a: Complex, b: Complex): Complex {
  return complex(a.re + b.re, a.im + b.im)
}

export function sub(a: Complex, b: Complex): Complex {
  return complex(a.re - b.re, a.im - b.im)
}

/** (a + bi)(c + di) = (ac − bd) + (ad + bc)i */
export function mul(a: Complex, b: Complex): Complex {
  return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
}

/** Complex conjugate: flip the sign of the imaginary part. conj(a + bi) = a − bi. */
export function conj(a: Complex): Complex {
  return complex(a.re, -a.im)
}

/** Multiply by a real number. */
export function scale(a: Complex, s: number): Complex {
  return complex(a.re * s, a.im * s)
}

/**
 * |z|² = re² + im². For an amplitude this is the probability of measuring
 * that basis state (the Born rule).
 */
export function abs2(a: Complex): number {
  return a.re * a.re + a.im * a.im
}

/** |z|, the length of z. */
export function abs(a: Complex): number {
  return Math.sqrt(abs2(a))
}

/** e^{iθ} = cos θ + i sin θ (Euler's formula): a pure phase of length 1. */
export function expi(theta: number): Complex {
  return complex(Math.cos(theta), Math.sin(theta))
}

/** r·e^{iθ}: the complex number with length r at angle θ. */
export function fromPolar(r: number, theta: number): Complex {
  return complex(r * Math.cos(theta), r * Math.sin(theta))
}

/** True when both parts differ by at most `eps`. */
export function approxEqual(a: Complex, b: Complex, eps = 1e-10): boolean {
  return Math.abs(a.re - b.re) <= eps && Math.abs(a.im - b.im) <= eps
}
