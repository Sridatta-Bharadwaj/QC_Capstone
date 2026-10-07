import { describe, expect, it } from 'vitest'
import {
  analyze,
  blochVector,
  complex,
  densityMatrix,
  ENTANGLEMENT_EPSILON,
  partialTraceExplicit,
  purity,
  reducedDensityMatrix,
  simulate,
  type ComplexMatrix,
} from '../../src/engine'
import { PRESETS, findPreset } from '../../src/model/presets'
import type { Circuit } from '../../src/model/types'
import {
  circuit,
  expectBloch,
  expectClose,
  expectMatrixClose,
  mulberry32,
  randomCircuit,
} from './helpers'

/** ρ is Hermitian (ρ = ρ†), has trace 1 and a real non-negative diagonal. */
function expectValidDensityMatrix(rho: ComplexMatrix): void {
  let trace = 0
  for (let i = 0; i < rho.length; i++) {
    trace += rho[i][i].re
    expectClose(rho[i][i].im, 0)
    expect(rho[i][i].re).toBeGreaterThanOrEqual(-1e-12)
    for (let j = 0; j < rho.length; j++) {
      expectClose(rho[i][j].re, rho[j][i].re)
      expectClose(rho[i][j].im, -rho[j][i].im)
    }
  }
  expectClose(trace, 1)
}

/** Every qubit: direct and explicit reduced ρ agree, both valid density matrices. */
function expectMethodsAgree(c: Circuit, eps = 1e-10): void {
  const state = simulate(c)
  for (let k = 0; k < c.numQubits; k++) {
    const direct = reducedDensityMatrix(state, c.numQubits, k)
    const explicit = partialTraceExplicit(state, c.numQubits, k)
    expectMatrixClose(explicit.reduced, direct, eps)
    expectValidDensityMatrix(direct)
  }
}

describe('single-qubit states on the Bloch sphere', () => {
  const s = Math.SQRT1_2
  const cases: [string, Circuit, { x: number; y: number; z: number }][] = [
    ['|0⟩', circuit(1), { x: 0, y: 0, z: 1 }],
    ['|1⟩', circuit(1, ['X', 0, [0]]), { x: 0, y: 0, z: -1 }],
    ['|+⟩', circuit(1, ['H', 0, [0]]), { x: 1, y: 0, z: 0 }],
    ['|−⟩', circuit(1, ['X', 0, [0]], ['H', 1, [0]]), { x: -1, y: 0, z: 0 }],
    ['|i⟩', circuit(1, ['H', 0, [0]], ['S', 1, [0]]), { x: 0, y: 1, z: 0 }],
    ['|−i⟩', circuit(1, ['H', 0, [0]], ['Sdg', 1, [0]]), { x: 0, y: -1, z: 0 }],
    ['T|+⟩', circuit(1, ['H', 0, [0]], ['T', 1, [0]]), { x: s, y: s, z: 0 }],
    ['T†|+⟩', circuit(1, ['H', 0, [0]], ['Tdg', 1, [0]]), { x: s, y: -s, z: 0 }],
    ['Y|0⟩', circuit(1, ['Y', 0, [0]]), { x: 0, y: 0, z: -1 }],
    ['Z|+⟩', circuit(1, ['H', 0, [0]], ['Z', 1, [0]]), { x: -1, y: 0, z: 0 }],
  ]

  it.each(cases)('%s', (_name, c, expected) => {
    const q = analyze(c).qubits[0]
    expectBloch(q.bloch, expected)
    expectClose(q.length, 1)
    expectClose(q.purity, 1)
    expect(q.entangled).toBe(false)
    expectValidDensityMatrix(q.rho)
  })

  it('ρ of |0⟩ is [[1,0],[0,0]]; ρ of |+⟩ is all ½', () => {
    expectMatrixClose(analyze(circuit(1)).qubits[0].rho, [
      [complex(1), complex(0)],
      [complex(0), complex(0)],
    ])
    const half = complex(0.5)
    expectMatrixClose(analyze(circuit(1, ['H', 0, [0]])).qubits[0].rho, [
      [half, half],
      [half, half],
    ])
  })
})

describe('rotations', () => {
  const angles = [0, 0.3, Math.PI / 4, Math.PI / 2, 1.9, Math.PI, -0.8, 2 * Math.PI, 5.1]

  it.each(angles)('Ry(%f)|0⟩ → (sin θ, 0, cos θ)', (t) => {
    const q = analyze(circuit(1, ['RY', 0, [0], t])).qubits[0]
    expectBloch(q.bloch, { x: Math.sin(t), y: 0, z: Math.cos(t) })
  })

  it.each(angles)('Rx(%f)|0⟩ → (0, −sin θ, cos θ)', (t) => {
    const q = analyze(circuit(1, ['RX', 0, [0], t])).qubits[0]
    expectBloch(q.bloch, { x: 0, y: -Math.sin(t), z: Math.cos(t) })
  })

  it.each(angles)('Rz(%f)|+⟩ → (cos θ, sin θ, 0)', (t) => {
    const q = analyze(circuit(1, ['H', 0, [0]], ['RZ', 1, [0], t])).qubits[0]
    expectBloch(q.bloch, { x: Math.cos(t), y: Math.sin(t), z: 0 })
  })

  it('Rz leaves |0⟩ on +z (only a global phase)', () => {
    expectBloch(analyze(circuit(1, ['RZ', 0, [0], 1.1])).qubits[0].bloch, { x: 0, y: 0, z: 1 })
  })

  it('rotations keep the state pure', () => {
    const q = analyze(circuit(1, ['RX', 0, [0], 0.4], ['RY', 1, [0], 1.3], ['RZ', 2, [0], -2]))
      .qubits[0]
    expectClose(q.length, 1)
    expectClose(q.purity, 1)
  })
})

describe('entangled states', () => {
  // Bell states: H on q0, CX(0→1), then X / Z on q0 to reach the other three.
  const bells: [string, Circuit][] = [
    ['Φ⁺', circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]])],
    ['Φ⁻', circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]], ['Z', 2, [0]])],
    ['Ψ⁺', circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]], ['X', 2, [0]])],
    ['Ψ⁻', circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]], ['X', 2, [0]], ['Z', 3, [0]])],
  ]

  it.each(bells)('Bell %s: each qubit maximally mixed', (_name, c) => {
    const a = analyze(c)
    for (const q of a.qubits) {
      expectBloch(q.bloch, { x: 0, y: 0, z: 0 })
      expectClose(q.length, 0)
      expectClose(q.purity, 0.5)
      expect(q.entangled).toBe(true)
      // maximally mixed = I/2
      expectMatrixClose(q.rho, [
        [complex(0.5), complex(0)],
        [complex(0), complex(0.5)],
      ])
    }
    expectMethodsAgree(c)
  })

  it('Bell Φ⁺ amplitudes are (|00⟩ + |11⟩)/√2', () => {
    const s = analyze(bells[0][1]).state
    expectClose(s[0].re, Math.SQRT1_2)
    expectClose(s[3].re, Math.SQRT1_2)
    expectClose(s[1].re, 0)
    expectClose(s[2].re, 0)
  })

  it('GHZ (3 qubits): all r = 0, purity 0.5', () => {
    const a = analyze(findPreset('ghz3')!.circuit)
    expect(a.qubits).toHaveLength(3)
    for (const q of a.qubits) {
      expectBloch(q.bloch, { x: 0, y: 0, z: 0 })
      expectClose(q.purity, 0.5)
      expect(q.entangled).toBe(true)
    }
  })

  it('W state preset: each qubit x = y = 0, z = 1/3, |r| = 1/3', () => {
    const a = analyze(findPreset('w3')!.circuit)
    // amplitudes 1/√3 on |100⟩, |010⟩, |001⟩
    for (const i of [1, 2, 4])
      expectClose(Math.hypot(a.state[i].re, a.state[i].im), 1 / Math.sqrt(3))
    for (const q of a.qubits) {
      expectBloch(q.bloch, { x: 0, y: 0, z: 1 / 3 })
      expectClose(q.length, 1 / 3)
      // purity = (1 + |r|²)/2 = 5/9
      expectClose(q.purity, 5 / 9)
      expect(q.entangled).toBe(true)
    }
  })

  it('product preset |+⟩|1⟩|i⟩: +x, −z, +y, all pure', () => {
    const a = analyze(findPreset('product')!.circuit)
    expectBloch(a.qubits[0].bloch, { x: 1, y: 0, z: 0 })
    expectBloch(a.qubits[1].bloch, { x: 0, y: 0, z: -1 })
    expectBloch(a.qubits[2].bloch, { x: 0, y: 1, z: 0 })
    for (const q of a.qubits) {
      expectClose(q.purity, 1)
      expect(q.entangled).toBe(false)
    }
  })

  it('partial entanglement: Ry(θ) then CX gives |r| = |cos θ|', () => {
    const t = 1.0
    const a = analyze(circuit(2, ['RY', 0, [0], t], ['CX', 1, [0, 1]]))
    for (const q of a.qubits) {
      expectBloch(q.bloch, { x: 0, y: 0, z: Math.cos(t) })
      expectClose(q.purity, (1 + Math.cos(t) ** 2) / 2)
      expect(q.entangled).toBe(true)
    }
  })

  it('CX on a control in |0⟩ creates no entanglement', () => {
    const a = analyze(circuit(2, ['H', 0, [1]], ['CX', 1, [0, 1]]))
    for (const q of a.qubits) expect(q.entangled).toBe(false)
  })

  it('a SWAP moves a qubit state to the other wire', () => {
    const a = analyze(circuit(2, ['H', 0, [0]], ['S', 1, [0]], ['SWAP', 2, [0, 1]]))
    expectBloch(a.qubits[0].bloch, { x: 0, y: 0, z: 1 })
    expectBloch(a.qubits[1].bloch, { x: 0, y: 1, z: 0 })
  })

  it('entangled flag uses ENTANGLEMENT_EPSILON', () => {
    expect(ENTANGLEMENT_EPSILON).toBeGreaterThan(0)
    // Numerically pure states with rounding noise must not be flagged.
    const a = analyze(
      circuit(1, ['H', 0, [0]], ['T', 1, [0]], ['H', 2, [0]], ['RX', 3, [0], 0.123]),
    )
    expect(a.qubits[0].entangled).toBe(false)
  })
})

describe('blochVector and purity on hand-written matrices', () => {
  it('reads (x, y, z) off ρ = (I + xX + yY + zZ)/2', () => {
    const [x, y, z] = [0.3, -0.4, 0.5]
    const rho: ComplexMatrix = [
      [complex((1 + z) / 2), complex(x / 2, -y / 2)],
      [complex(x / 2, y / 2), complex((1 - z) / 2)],
    ]
    expectBloch(blochVector(rho), { x, y, z })
    // purity = (1 + |r|²)/2
    expectClose(purity(rho), (1 + x * x + y * y + z * z) / 2)
  })

  it('maximally mixed I/2 has purity 0.5', () => {
    expectClose(
      purity([
        [complex(0.5), complex(0)],
        [complex(0), complex(0.5)],
      ]),
      0.5,
    )
  })
})

describe('density matrices and the explicit partial trace', () => {
  it('ρ = |ψ⟩⟨ψ| is Hermitian, trace 1, pure (Tr ρ² = 1)', () => {
    const rho = densityMatrix(
      simulate(circuit(3, ['H', 0, [0]], ['RY', 0, [1], 0.7], ['CX', 1, [0, 2]], ['T', 2, [2]])),
    )
    expect(rho).toHaveLength(8)
    expectValidDensityMatrix(rho)
    expectClose(purity(rho), 1)
  })

  it('Bell Φ⁺ full ρ has ½ in the four corners', () => {
    const rho = densityMatrix(simulate(circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]])))
    for (const [i, j] of [
      [0, 0],
      [0, 3],
      [3, 0],
      [3, 3],
    ])
      expectClose(rho[i][j].re, 0.5)
    expectClose(rho[1][1].re, 0)
  })

  it('explicit trace: entries in order 00, 01, 10, 11 with matching other qubits', () => {
    const n = 3
    const k = 1
    const state = simulate(findPreset('w3')!.circuit)
    const r = partialTraceExplicit(state, n, k)
    expect(r.qubit).toBe(k)
    expect(r.numQubits).toBe(n)
    expect(r.fullRho).toHaveLength(8)
    expect(r.entries.map((e) => `${e.a}${e.b}`)).toEqual(['00', '01', '10', '11'])
    const mask = 1 << (n - 1 - k)
    for (const e of r.entries) {
      expect(e.terms).toHaveLength(4) // 2^(n−1) terms
      let re = 0
      let im = 0
      for (const t of e.terms) {
        // qubit k of the row is a, of the column is b; all other bits equal
        expect((t.row & mask) !== 0 ? 1 : 0).toBe(e.a)
        expect((t.col & mask) !== 0 ? 1 : 0).toBe(e.b)
        expect(t.row & ~mask).toBe(t.col & ~mask)
        expect(t.value).toEqual(r.fullRho[t.row][t.col])
        re += t.value.re
        im += t.value.im
      }
      expectClose(e.sum.re, re)
      expectClose(e.sum.im, im)
      expect(r.reduced[e.a][e.b]).toEqual(e.sum)
    }
  })

  it('explicit trace on 2 qubits lists the textbook terms', () => {
    // tracing out q1 from ρ (4×4): ρ₀[0][0] = ρ[00][00] + ρ[01][01] = ρ[0][0] + ρ[1][1]
    const r = partialTraceExplicit(simulate(circuit(2, ['H', 0, [0]])), 2, 0)
    expect(r.entries[0].terms.map((t) => [t.row, t.col])).toEqual([
      [0, 0],
      [1, 1],
    ])
    // ρ₀[0][1] = ρ[0][2] + ρ[1][3]
    expect(r.entries[1].terms.map((t) => [t.row, t.col])).toEqual([
      [0, 2],
      [1, 3],
    ])
  })

  it('single-qubit circuit: reduced ρ equals the full ρ', () => {
    const state = simulate(circuit(1, ['RX', 0, [0], 0.5]))
    const r = partialTraceExplicit(state, 1, 0)
    expectMatrixClose(r.reduced, r.fullRho)
    expect(r.entries.every((e) => e.terms.length === 1)).toBe(true)
  })

  it('rejects bad arguments', () => {
    const state = simulate(circuit(2))
    expect(() => reducedDensityMatrix(state, 2, 2)).toThrow(/out of range/)
    expect(() => reducedDensityMatrix(state, 3, 0)).toThrow(/amplitudes/)
    expect(() => partialTraceExplicit(state, 2, -1)).toThrow(/out of range/)
  })
})

describe('direct (O(2ⁿ)) and explicit (O(4ⁿ)) methods agree to 1e-10', () => {
  it.each(PRESETS.map((p) => [p.id, p.circuit] as const))('preset %s', (_id, c) => {
    expectMethodsAgree(c)
  })

  it('200 random circuits, 1–6 qubits (seeded)', () => {
    const rand = mulberry32(20261006)
    for (let trial = 0; trial < 200; trial++) {
      const n = 1 + (trial % 6)
      const gates = 5 + Math.floor(rand() * 25)
      expectMethodsAgree(randomCircuit(rand, n, gates))
    }
  })

  it('random circuits: purity = (1 + |r|²)/2 and |r| ≤ 1', () => {
    const rand = mulberry32(7)
    for (let trial = 0; trial < 50; trial++) {
      const a = analyze(randomCircuit(rand, 1 + (trial % 6), 20))
      for (const q of a.qubits) {
        expectClose(q.purity, (1 + q.length ** 2) / 2)
        expect(q.length).toBeLessThanOrEqual(1 + 1e-10)
      }
    }
  })

  it('direct method works at 10 qubits (above MAX_QUBITS)', () => {
    const rand = mulberry32(99)
    const c = randomCircuit(rand, 10, 60)
    const a = analyze(c)
    expect(a.qubits).toHaveLength(10)
    for (const q of a.qubits) {
      expectValidDensityMatrix(q.rho)
      expect(q.length).toBeLessThanOrEqual(1 + 1e-10)
    }
    // spot-check against the explicit method on two qubits (1024×1024 ρ)
    for (const k of [0, 9]) {
      expectMatrixClose(partialTraceExplicit(a.state, 10, k).reduced, a.qubits[k].rho)
    }
  })
})

describe('analyze: all presets', () => {
  it.each(PRESETS.map((p) => [p.id, p.circuit] as const))('%s', (_id, c) => {
    const a = analyze(c)
    expect(a.numQubits).toBe(c.numQubits)
    expect(a.state).toHaveLength(2 ** c.numQubits)
    expect(a.qubits.map((q) => q.qubit)).toEqual([...Array(c.numQubits).keys()])
    for (const q of a.qubits) {
      expectValidDensityMatrix(q.rho)
      expectClose(q.length, Math.hypot(q.bloch.x, q.bloch.y, q.bloch.z))
      expect(q.entangled).toBe(q.length < 1 - ENTANGLEMENT_EPSILON)
    }
  })

  it('plus preset is |+⟩', () => {
    expectBloch(analyze(findPreset('plus')!.circuit).qubits[0].bloch, { x: 1, y: 0, z: 0 })
  })

  it('partial preset: both qubits partly mixed, r = (0, 0, 0.5), purity 0.625', () => {
    for (const q of analyze(findPreset('partial')!.circuit).qubits) {
      expectBloch(q.bloch, { x: 0, y: 0, z: 0.5 })
      expect(q.length).toBeCloseTo(0.5, 12)
      expect(q.purity).toBeCloseTo(0.625, 12)
      expect(q.entangled).toBe(true)
    }
  })

  it('result is plain data (survives structuredClone, i.e. postMessage)', () => {
    const a = analyze(findPreset('bell')!.circuit)
    expect(structuredClone(a)).toEqual(a)
  })
})
