// V2-7: keep-any-subset partial trace and von Neumann entropy.
import { describe, expect, it } from 'vitest'
import {
  analyze,
  complex,
  densityMatrix,
  partialTraceSubset,
  reducedDensityMatrix,
  reducedDensityMatrixSubset,
  simulate,
  vonNeumannEntropy,
  type ComplexMatrix,
} from '../../src/engine'
import { MAX_EXPLICIT_KEEP } from '../../src/engine/subset'
import { PRESETS } from '../../src/model/presets'
import { circuit, expectClose, expectMatrixClose, mulberry32, randomCircuit } from './helpers'

const bell = circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]])
const ghz3 = circuit(3, ['H', 0, [0]], ['CX', 1, [0, 1]], ['CX', 2, [1, 2]])

/** All non-empty subsets of {0 … n−1}, each sorted ascending. */
function subsets(n: number): number[][] {
  const out: number[][] = []
  for (let mask = 1; mask < 1 << n; mask++) {
    out.push(Array.from({ length: n }, (_, q) => q).filter((q) => (mask >> (n - 1 - q)) & 1))
  }
  return out
}

/** Matrix built from the explicit entries' sums. */
function fromEntries(
  size: number,
  entries: { row: number; col: number; sum: { re: number; im: number } }[],
): ComplexMatrix {
  const m: ComplexMatrix = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => complex(0)),
  )
  for (const e of entries) m[e.row][e.col] = e.sum
  return m
}

const diag = (values: number[]): ComplexMatrix =>
  values.map((v, i) => values.map((_, j) => complex(i === j ? v : 0)))

describe('reducedDensityMatrixSubset', () => {
  it('Bell pair kept together is the pure |Φ⁺⟩⟨Φ⁺|', () => {
    const res = partialTraceSubset(simulate(bell), [0, 1], false)
    expectMatrixClose(res.reduced, densityMatrix(simulate(bell)))
    expectClose(res.purity, 1)
    expectClose(res.entropy, 0)
  })

  it('one qubit of a Bell pair: purity 0.5, entropy 1 bit', () => {
    for (const k of [0, 1]) {
      const res = partialTraceSubset(simulate(bell), [k], false)
      expectMatrixClose(res.reduced, diag([0.5, 0.5]))
      expectClose(res.purity, 0.5)
      expectClose(res.entropy, 1)
    }
  })

  it('GHZ(3) keep two qubits: mixed, purity 0.5, entropy 1, ρ = ½(|00⟩⟨00| + |11⟩⟨11|)', () => {
    for (const keep of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      const res = partialTraceSubset(simulate(ghz3), keep, false)
      expectMatrixClose(res.reduced, diag([0.5, 0, 0, 0.5]))
      expectClose(res.purity, 0.5)
      expectClose(res.entropy, 1)
    }
  })

  it('basis is big-endian over the kept qubits in ascending order', () => {
    // q0 = 1, q1 = 0, q2 = 0 → keep {0, 2} gives |q0 q2⟩ = |10⟩ = index 2.
    const state = simulate(circuit(3, ['X', 0, [0]]))
    const rho = reducedDensityMatrixSubset(state, [2, 0]) // order of `keep` does not matter
    expectMatrixClose(rho, diag([0, 0, 1, 0]))
  })

  it('keeping one qubit equals reducedDensityMatrix (presets + random circuits)', () => {
    const circuits = [...PRESETS.map((p) => p.circuit)]
    const rand = mulberry32(11)
    for (let i = 0; i < 60; i++) circuits.push(randomCircuit(rand, 1 + (i % 6), 14))
    for (const c of circuits) {
      const state = simulate(c)
      for (let k = 0; k < c.numQubits; k++) {
        expectMatrixClose(
          reducedDensityMatrixSubset(state, [k]),
          reducedDensityMatrix(state, c.numQubits, k),
        )
      }
    }
  })

  it('keeping every qubit gives ρ = |ψ⟩⟨ψ|', () => {
    const rand = mulberry32(5)
    for (let i = 0; i < 20; i++) {
      const c = randomCircuit(rand, 1 + (i % 4), 10)
      const state = simulate(c)
      const all = Array.from({ length: c.numQubits }, (_, q) => q)
      const res = partialTraceSubset(state, all, false)
      expectMatrixClose(res.reduced, densityMatrix(state))
      expectClose(res.purity, 1)
      expectClose(res.entropy, 0, 1e-9)
    }
  })

  it('product states have zero entropy for every subset', () => {
    const c = circuit(
      3,
      ['H', 0, [0]],
      ['RY', 0, [1], 0.7],
      ['RX', 0, [2], 1.9],
      ['S', 1, [0]],
      ['T', 1, [2]],
    )
    const state = simulate(c)
    for (const keep of subsets(3)) {
      const res = partialTraceSubset(state, keep, false)
      expectClose(res.purity, 1)
      expectClose(res.entropy, 0, 1e-9)
    }
  })

  it('k Bell pairs kept on one side: maximally mixed, entropy k bits', () => {
    // q0–q3, q1–q4, q2–q5 are Bell pairs; keeping q0, q1, q2 keeps one half of each.
    const c = circuit(
      6,
      ['H', 0, [0]],
      ['H', 0, [1]],
      ['H', 0, [2]],
      ['CX', 1, [0, 3]],
      ['CX', 2, [1, 4]],
      ['CX', 3, [2, 5]],
    )
    const state = simulate(c)
    for (const [keep, k] of [
      [[0], 1],
      [[0, 1], 2],
      [[0, 1, 2], 3],
      [[3, 4, 5], 3],
    ] as const) {
      const res = partialTraceSubset(state, [...keep], false)
      expectMatrixClose(res.reduced, diag(Array(2 ** k).fill(1 / 2 ** k)))
      expectClose(res.purity, 1 / 2 ** k)
      expectClose(res.entropy, k)
    }
    // Keeping a whole pair (q0 and its partner q3) is pure again: entropy 0.
    expectClose(partialTraceSubset(state, [0, 3], false).entropy, 0, 1e-9)
  })

  it('pure global state: S(ρ_K) = S(ρ_rest) (random circuits)', () => {
    const rand = mulberry32(99)
    for (let i = 0; i < 25; i++) {
      const n = 2 + (i % 5)
      const state = simulate(randomCircuit(rand, n, 16))
      for (const keep of subsets(n).slice(0, 12)) {
        const rest = Array.from({ length: n }, (_, q) => q).filter((q) => !keep.includes(q))
        if (rest.length === 0) continue
        expectClose(
          partialTraceSubset(state, keep, false).entropy,
          partialTraceSubset(state, rest, false).entropy,
          1e-8,
        )
      }
    }
  })

  it('rejects invalid keep sets with clear errors', () => {
    const state = simulate(bell)
    expect(() => reducedDensityMatrixSubset(state, [])).toThrow(/at least one qubit/)
    expect(() => reducedDensityMatrixSubset(state, [2])).toThrow(/out of range/)
    expect(() => reducedDensityMatrixSubset(state, [-1])).toThrow(/out of range/)
    expect(() => reducedDensityMatrixSubset(state, [0.5])).toThrow(/out of range/)
    expect(() => reducedDensityMatrixSubset(state, [1, 1])).toThrow(/listed twice/)
    expect(() => partialTraceSubset([complex(1), complex(0), complex(0)], [0], false)).toThrow(
      /2\^n/,
    )
  })
})

describe('partialTraceSubset explicit steps', () => {
  it('explicit sums agree with the direct method to 1e-10 (presets + random)', () => {
    const circuits = [...PRESETS.map((p) => p.circuit), ghz3]
    const rand = mulberry32(2026)
    for (let i = 0; i < 40; i++) circuits.push(randomCircuit(rand, 2 + (i % 5), 14))
    for (const c of circuits) {
      const state = simulate(c)
      for (const keep of subsets(c.numQubits)) {
        if (keep.length > MAX_EXPLICIT_KEEP) continue
        const res = partialTraceSubset(state, keep, true)
        expect(res.entries).not.toBeNull()
        expect(res.fullRho).not.toBeNull()
        const size = 2 ** keep.length
        expect(res.entries).toHaveLength(size * size)
        expectMatrixClose(fromEntries(size, res.entries!), res.reduced)
        // Each entry sums 2^(n−k) terms, one per value of the traced-out qubits.
        expect(res.entries![0].terms).toHaveLength(2 ** (c.numQubits - keep.length))
      }
    }
  })

  it('terms have equal traced-out bits in row and column', () => {
    const res = partialTraceSubset(simulate(ghz3), [0, 2], true)
    // Entry (row 0b01 = |q0 q2⟩ = |01⟩, col 0b10 = |10⟩): row index has q0=0, q2=1,
    // column q0=1, q2=0, and q1 equal on both sides.
    const entry = res.entries!.find((e) => e.row === 1 && e.col === 2)!
    expect(entry.terms.map((t) => [t.row, t.col])).toEqual([
      [0b001, 0b100],
      [0b011, 0b110],
    ])
  })

  it('no steps when not requested or more than MAX_EXPLICIT_KEEP qubits are kept', () => {
    const state = simulate(circuit(4, ['H', 0, [0]]))
    expect(partialTraceSubset(state, [0, 1], false).entries).toBeNull()
    const big = partialTraceSubset(state, [0, 1, 2, 3], true)
    expect(big.entries).toBeNull()
    expect(big.fullRho).toBeNull()
    expect(big.reduced).toHaveLength(16)
  })
})

describe('vonNeumannEntropy', () => {
  it('maximally mixed k qubits have entropy k (k = 1 … 6)', () => {
    for (let k = 1; k <= 6; k++) {
      const d = 2 ** k
      expectClose(vonNeumannEntropy(diag(Array(d).fill(1 / d))), k, 1e-9)
    }
  })

  it('pure states (including complex off-diagonals) have entropy 0', () => {
    // |i⟩ = (|0⟩ + i|1⟩)/√2 → ρ = ½[[1, −i], [i, 1]]
    const rho: ComplexMatrix = [
      [complex(0.5), complex(0, -0.5)],
      [complex(0, 0.5), complex(0.5)],
    ]
    expectClose(vonNeumannEntropy(rho), 0, 1e-12)
  })

  it('matches the binary entropy for a single-qubit mixed state', () => {
    // Eigenvalues (1 ± |r|)/2 with r = (0.3, −0.4, 0) (|r| = 0.5) → 0.75, 0.25.
    const rho: ComplexMatrix = [
      [complex(0.5), complex(0.15, 0.2)],
      [complex(0.15, -0.2), complex(0.5)],
    ]
    const h = -(0.75 * Math.log2(0.75) + 0.25 * Math.log2(0.25))
    expectClose(vonNeumannEntropy(rho), h, 1e-12)
  })

  it('handles a 64×64 ρ (6 random qubits) without trouble', () => {
    const state = simulate(randomCircuit(mulberry32(64), 6, 30))
    expectClose(vonNeumannEntropy(densityMatrix(state)), 0, 1e-9)
  })

  it('agrees with the Bloch-vector formula for every qubit of random circuits', () => {
    const rand = mulberry32(3)
    for (let i = 0; i < 20; i++) {
      for (const q of analyze(randomCircuit(rand, 3, 12)).qubits) {
        const p = (1 + q.length) / 2
        const h = p >= 1 - 1e-12 ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p))
        expectClose(vonNeumannEntropy(q.rho), h, 1e-8)
      }
    }
  })

  it('rejects a non-square matrix', () => {
    expect(() => vonNeumannEntropy([])).toThrow()
    expect(() => vonNeumannEntropy([[complex(1), complex(0)]])).toThrow()
  })
})
