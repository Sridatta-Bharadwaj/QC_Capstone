import { describe, expect, it } from 'vitest'
import { simulate } from '../../src/engine'
import { composeIndex } from '../../src/engine/partialTrace'
import { bitOf } from '../../src/engine/simulator'
import { circuit, expectClose, expectState, mulberry32, norm2, randomCircuit } from './helpers'

const R = Math.SQRT1_2

describe('simulate: basics and qubit ordering (big-endian)', () => {
  it('empty circuit is |0…0⟩', () => {
    expectState(simulate(circuit(1)), [1, 0])
    expectState(simulate(circuit(3)), [1, 0, 0, 0, 0, 0, 0, 0])
  })

  it('X on q1 of 2 qubits → |01⟩ = index 1', () => {
    expectState(simulate(circuit(2, ['X', 0, [1]])), [0, 1, 0, 0])
  })

  it('X on q0 of 2 qubits → |10⟩ = index 2 (q0 is the most significant bit)', () => {
    expectState(simulate(circuit(2, ['X', 0, [0]])), [0, 0, 1, 0])
  })

  it('X on q0 and q2 of 3 qubits → |101⟩ = index 5', () => {
    const s = simulate(circuit(3, ['X', 0, [0]], ['X', 0, [2]]))
    expectClose(s[5].re, 1)
    expect(bitOf(5, 3, 0)).toBe(1)
    expect(bitOf(5, 3, 1)).toBe(0)
    expect(bitOf(5, 3, 2)).toBe(1)
  })

  it('composeIndex places the bit of the traced qubit correctly', () => {
    // n = 3, k = 1, bit = 1, rest = 0b10 (q0 = 1, q2 = 0) → |110⟩ = 6
    expect(composeIndex(3, 1, 1, 0b10)).toBe(6)
    expect(composeIndex(3, 0, 1, 0b00)).toBe(4)
    expect(composeIndex(3, 2, 1, 0b11)).toBe(7)
    expect(composeIndex(3, 2, 0, 0b11)).toBe(6)
  })
})

describe('simulate: single-qubit gates', () => {
  it('H|0⟩ = |+⟩', () => expectState(simulate(circuit(1, ['H', 0, [0]])), [R, R]))
  it('H|1⟩ = |−⟩', () => expectState(simulate(circuit(1, ['X', 0, [0]], ['H', 1, [0]])), [R, -R]))
  it('Y|0⟩ = i|1⟩', () => expectState(simulate(circuit(1, ['Y', 0, [0]])), [0, [0, 1]]))
  it('Z|1⟩ = −|1⟩', () => expectState(simulate(circuit(1, ['X', 0, [0]], ['Z', 1, [0]])), [0, -1]))
  it('I does nothing', () => expectState(simulate(circuit(1, ['I', 0, [0]])), [1, 0]))

  it('S, T, S†, T† put the expected phase on |1⟩', () => {
    const phase = (g: 'S' | 'T' | 'Sdg' | 'Tdg') =>
      simulate(circuit(1, ['X', 0, [0]], [g, 1, [0]]))[1]
    const p = Math.PI
    for (const [g, phi] of [
      ['S', p / 2],
      ['Sdg', -p / 2],
      ['T', p / 4],
      ['Tdg', -p / 4],
    ] as const) {
      const a = phase(g)
      expectClose(a.re, Math.cos(phi))
      expectClose(a.im, Math.sin(phi))
    }
  })

  it('phase gates leave |0⟩ alone', () => {
    for (const g of ['S', 'T', 'Sdg', 'Tdg', 'Z'] as const) {
      expectState(simulate(circuit(1, [g, 0, [0]])), [1, 0])
    }
  })

  it('Ry(θ)|0⟩ = cos(θ/2)|0⟩ + sin(θ/2)|1⟩', () => {
    const t = 1.234
    expectState(simulate(circuit(1, ['RY', 0, [0], t])), [Math.cos(t / 2), Math.sin(t / 2)])
  })

  it('Rx(θ)|0⟩ = cos(θ/2)|0⟩ − i sin(θ/2)|1⟩', () => {
    const t = 0.7
    expectState(simulate(circuit(1, ['RX', 0, [0], t])), [Math.cos(t / 2), [0, -Math.sin(t / 2)]])
  })

  it('Rz(θ)|0⟩ = e^{−iθ/2}|0⟩', () => {
    const t = 0.9
    expectState(simulate(circuit(1, ['RZ', 0, [0], t])), [[Math.cos(t / 2), -Math.sin(t / 2)], 0])
  })

  it('a single-qubit gate acts only on its wire', () => {
    // H on q1 of 3 qubits: (|000⟩ + |010⟩)/√2 → indices 0 and 2
    expectState(simulate(circuit(3, ['H', 0, [1]])), [R, 0, R, 0, 0, 0, 0, 0])
  })
})

describe('simulate: multi-qubit gates', () => {
  it('CX flips the target only when the control is 1', () => {
    // control q0 = 1, target q1: |10⟩ → |11⟩
    expectState(simulate(circuit(2, ['X', 0, [0]], ['CX', 1, [0, 1]])), [0, 0, 0, 1])
    // control q0 = 0: nothing happens
    expectState(simulate(circuit(2, ['CX', 0, [0, 1]])), [1, 0, 0, 0])
    // reversed roles: control q1 = 1, target q0: |01⟩ → |11⟩
    expectState(simulate(circuit(2, ['X', 0, [1]], ['CX', 1, [1, 0]])), [0, 0, 0, 1])
  })

  it('CX on non-adjacent qubits', () => {
    // |100⟩ → CX(0→2) → |101⟩ = 5
    const s = simulate(circuit(3, ['X', 0, [0]], ['CX', 1, [0, 2]]))
    expectClose(s[5].re, 1)
  })

  it('CZ puts −1 only on |11⟩ and is symmetric', () => {
    const prep: Parameters<typeof circuit>[1][] = [
      ['H', 0, [0]],
      ['H', 0, [1]],
    ]
    const h = 0.5
    expectState(simulate(circuit(2, ...prep, ['CZ', 1, [0, 1]])), [h, h, h, -h])
    expectState(simulate(circuit(2, ...prep, ['CZ', 1, [1, 0]])), [h, h, h, -h])
  })

  it('SWAP exchanges two qubits', () => {
    // |10⟩ → |01⟩
    expectState(simulate(circuit(2, ['X', 0, [0]], ['SWAP', 1, [0, 1]])), [0, 1, 0, 0])
    // |100⟩ swap(0,2) → |001⟩ = 1
    const s = simulate(circuit(3, ['X', 0, [0]], ['SWAP', 1, [0, 2]]))
    expectClose(s[1].re, 1)
    // swaps a superposition with phases intact: (|0⟩ + i|1⟩)/√2 on q0 moves to q1
    const s2 = simulate(circuit(2, ['H', 0, [0]], ['S', 1, [0]], ['SWAP', 2, [0, 1]]))
    expectState(s2, [R, [0, R], 0, 0])
  })

  it('Toffoli truth table (all 8 inputs, all target positions)', () => {
    for (let input = 0; input < 8; input++) {
      const prep: Parameters<typeof circuit>[1][] = []
      for (let q = 0; q < 3; q++) if ((input >> (2 - q)) & 1) prep.push(['X', 0, [q]])
      // controls q0, q1; target q2
      const out = simulate(circuit(3, ...prep, ['CCX', 1, [0, 1, 2]]))
      const expected = (input & 0b110) === 0b110 ? input ^ 0b001 : input
      expectClose(out[expected].re, 1)
      // controls q2, q0; target q1
      const out2 = simulate(circuit(3, ...prep, ['CCX', 1, [2, 0, 1]]))
      const expected2 = (input & 0b101) === 0b101 ? input ^ 0b010 : input
      expectClose(out2[expected2].re, 1)
    }
  })
})

describe('simulate: ordering, validation, scale', () => {
  it('applies gates by column, not by array order', () => {
    // H then Z (column order) gives |−⟩; Z then H would give |+⟩.
    const c = circuit(1, ['Z', 1, [0]], ['H', 0, [0]])
    expectState(simulate(c), [R, -R])
  })

  it('preserves normalization on random circuits', () => {
    const rand = mulberry32(42)
    for (let trial = 0; trial < 50; trial++) {
      const n = 1 + Math.floor(rand() * 6)
      const s = simulate(randomCircuit(rand, n, 30))
      expectClose(norm2(s), 1, 1e-10)
    }
  })

  it('throws on invalid operations', () => {
    expect(() => simulate(circuit(2, ['X', 0, [2]]))).toThrow(/out of range/)
    expect(() => simulate(circuit(2, ['CX', 0, [1, 1]]))).toThrow(/distinct/)
    expect(() => simulate(circuit(1, ['RX', 0, [0]]))).toThrow(/angle/)
    expect(() => simulate(circuit(0))).toThrow()
  })

  it('is n-agnostic: works with 10 qubits (above MAX_QUBITS)', () => {
    // GHZ on 10 qubits: (|0…0⟩ + |1…1⟩)/√2
    const steps: Parameters<typeof circuit>[1][] = [['H', 0, [0]]]
    for (let q = 1; q < 10; q++) steps.push(['CX', q, [q - 1, q]])
    const s = simulate(circuit(10, ...steps))
    expect(s.length).toBe(1024)
    expectClose(s[0].re, R)
    expectClose(s[1023].re, R)
    expectClose(norm2(s), 1)
  })
})
