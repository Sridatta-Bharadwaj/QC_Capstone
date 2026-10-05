import { describe, expect, it } from 'vitest'
import {
  abs,
  abs2,
  add,
  approxEqual,
  complex,
  conj,
  expi,
  fromPolar,
  mul,
  scale,
  sub,
} from '../../src/engine/complex'
import { FIXED_GATES, rotationGate } from '../../src/engine/gates'
import type { ComplexMatrix } from '../../src/engine'
import { expectClose, expectMatrixClose } from './helpers'

describe('complex helpers', () => {
  it('basic arithmetic', () => {
    expect(add(complex(1, 2), complex(3, -1))).toEqual(complex(4, 1))
    expect(sub(complex(1, 2), complex(3, -1))).toEqual(complex(-2, 3))
    // (1 + 2i)(3 − i) = 3 − i + 6i − 2i² = 5 + 5i
    expect(mul(complex(1, 2), complex(3, -1))).toEqual(complex(5, 5))
    expect(conj(complex(1, 2))).toEqual(complex(1, -2))
    expect(scale(complex(1, -2), 3)).toEqual(complex(3, -6))
    expect(complex(7)).toEqual({ re: 7, im: 0 })
  })

  it('i² = −1', () => {
    expect(mul(complex(0, 1), complex(0, 1))).toEqual(complex(-1, 0))
  })

  it('modulus and polar form', () => {
    expect(abs2(complex(3, 4))).toBe(25)
    expect(abs(complex(3, 4))).toBe(5)
    expect(approxEqual(expi(Math.PI / 2), complex(0, 1))).toBe(true)
    expect(approxEqual(expi(Math.PI), complex(-1, 0))).toBe(true)
    expect(approxEqual(fromPolar(2, Math.PI / 2), complex(0, 2))).toBe(true)
  })

  it('approxEqual respects the tolerance', () => {
    expect(approxEqual(complex(1, 0), complex(1 + 1e-12, 0))).toBe(true)
    expect(approxEqual(complex(1, 0), complex(1 + 1e-6, 0))).toBe(false)
    expect(approxEqual(complex(1, 0), complex(1 + 1e-6, 0), 1e-5)).toBe(true)
  })
})

function matMul(a: ComplexMatrix, b: ComplexMatrix): ComplexMatrix {
  return a.map((row, i) =>
    b[0].map((_, j) => row.reduce((s, _x, k) => add(s, mul(a[i][k], b[k][j])), complex(0))),
  )
}
function dagger(a: ComplexMatrix): ComplexMatrix {
  return a[0].map((_, j) => a.map((row) => conj(row[j])))
}
const ID: ComplexMatrix = [
  [complex(1), complex(0)],
  [complex(0), complex(1)],
]

describe('gate matrices', () => {
  const all: [string, ComplexMatrix][] = [
    ...Object.entries(FIXED_GATES),
    ...[0.3, 1.7, -2.2, Math.PI].flatMap((t) =>
      (['RX', 'RY', 'RZ'] as const).map((g): [string, ComplexMatrix] => [
        `${g}(${t})`,
        rotationGate(g, t),
      ]),
    ),
  ]

  it.each(all)('%s is unitary (U†U = I)', (_name, u) => {
    expectMatrixClose(matMul(dagger(u), u), ID)
  })

  it('S† undoes S and T† undoes T; T² = S; S² = Z', () => {
    expectMatrixClose(matMul(FIXED_GATES.S, FIXED_GATES.Sdg), ID)
    expectMatrixClose(matMul(FIXED_GATES.T, FIXED_GATES.Tdg), ID)
    expectMatrixClose(matMul(FIXED_GATES.T, FIXED_GATES.T), FIXED_GATES.S)
    expectMatrixClose(matMul(FIXED_GATES.S, FIXED_GATES.S), FIXED_GATES.Z)
  })

  it('rotations by π equal the Paulis up to a global phase of −i', () => {
    const minusI = complex(0, -1)
    const times = (m: ComplexMatrix) => m.map((row) => row.map((x) => mul(minusI, x)))
    expectMatrixClose(rotationGate('RX', Math.PI), times(FIXED_GATES.X))
    expectMatrixClose(rotationGate('RY', Math.PI), times(FIXED_GATES.Y))
    expectMatrixClose(rotationGate('RZ', Math.PI), times(FIXED_GATES.Z))
  })

  it('Qiskit convention entries', () => {
    const t = 0.8
    const rx = rotationGate('RX', t)
    expectClose(rx[0][1].im, -Math.sin(t / 2))
    const ry = rotationGate('RY', t)
    expectClose(ry[0][1].re, -Math.sin(t / 2))
    expectClose(ry[1][0].re, Math.sin(t / 2))
    const rz = rotationGate('RZ', t)
    expectClose(rz[0][0].im, -Math.sin(t / 2))
    expectClose(rz[1][1].im, Math.sin(t / 2))
  })
})
