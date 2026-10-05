// Shared test helpers for the engine tests.
import { expect } from 'vitest'
import type { BlochVector, ComplexMatrix, StateVector } from '../../src/engine'
import type { Circuit, GateType } from '../../src/model/types'

export const EPS = 1e-10

type Step = [gate: GateType, column: number, qubits: number[], angle?: number]

/** Small circuit builder: circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]]). */
export function circuit(numQubits: number, ...steps: Step[]): Circuit {
  return {
    numQubits,
    operations: steps.map(([gate, column, qubits, angle], i) => ({
      id: `t${i}`,
      gate,
      column,
      qubits,
      ...(angle === undefined ? {} : { angle }),
    })),
  }
}

export function expectClose(actual: number, expected: number, eps = EPS): void {
  expect(Math.abs(actual - expected), `${actual} ≈ ${expected}`).toBeLessThanOrEqual(eps)
}

export function expectBloch(actual: BlochVector, expected: BlochVector, eps = EPS): void {
  expectClose(actual.x, expected.x, eps)
  expectClose(actual.y, expected.y, eps)
  expectClose(actual.z, expected.z, eps)
}

/** Compare a statevector against [re, im] pairs (or plain reals). */
export function expectState(
  actual: StateVector,
  expected: (number | [number, number])[],
  eps = EPS,
): void {
  expect(actual.length).toBe(expected.length)
  expected.forEach((e, i) => {
    const [re, im] = typeof e === 'number' ? [e, 0] : e
    expectClose(actual[i].re, re, eps)
    expectClose(actual[i].im, im, eps)
  })
}

export function expectMatrixClose(a: ComplexMatrix, b: ComplexMatrix, eps = EPS): void {
  expect(a.length).toBe(b.length)
  for (let i = 0; i < a.length; i++) {
    expect(a[i].length).toBe(b[i].length)
    for (let j = 0; j < a[i].length; j++) {
      expectClose(a[i][j].re, b[i][j].re, eps)
      expectClose(a[i][j].im, b[i][j].im, eps)
    }
  }
}

export function norm2(state: StateVector): number {
  return state.reduce((s, a) => s + a.re * a.re + a.im * a.im, 0)
}

/** Deterministic PRNG (mulberry32) so random-circuit tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const SINGLE: GateType[] = ['I', 'H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg', 'RX', 'RY', 'RZ']

/** Random circuit: one gate per column, random gate/qubits/angle. */
export function randomCircuit(rand: () => number, numQubits: number, numGates: number): Circuit {
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]
  const distinct = (count: number): number[] => {
    const pool = Array.from({ length: numQubits }, (_, i) => i)
    const out: number[] = []
    while (out.length < count) out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0])
    return out
  }
  const allowed: GateType[] = [
    ...SINGLE,
    ...(numQubits >= 2 ? (['CX', 'CZ', 'SWAP'] as GateType[]) : []),
    ...(numQubits >= 3 ? (['CCX'] as GateType[]) : []),
  ]
  const steps: Step[] = []
  for (let col = 0; col < numGates; col++) {
    const gate = pick(allowed)
    const arity = gate === 'CCX' ? 3 : gate === 'CX' || gate === 'CZ' || gate === 'SWAP' ? 2 : 1
    const angle =
      gate === 'RX' || gate === 'RY' || gate === 'RZ' ? (rand() * 2 - 1) * 2 * Math.PI : undefined
    steps.push([gate, col, distinct(arity), angle])
  }
  return circuit(numQubits, ...steps)
}
