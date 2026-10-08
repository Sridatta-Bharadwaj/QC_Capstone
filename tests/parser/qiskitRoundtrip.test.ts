// Round trips for the Qiskit tab (PLAN.md → V2-1 → Tests):
//  - parseQiskit(toQiskit(c)) ≡ c (circuitsEqual) for presets and ≥ 200 random circuits;
//  - toQiskit output parses with ZERO problems (warnings included);
//  - cross-format: parseQiskit(toQiskit(c)) ≡ parseQasm(toQasm(c)).
import { describe, expect, it } from 'vitest'
import { toQasm, toQiskit } from '../../src/codegen'
import { simulate } from '../../src/engine'
import {
  circuitsEqual,
  defaultInitialStates,
  earliestFreeColumn,
  isPlacementFree,
  sortedOperations,
} from '../../src/model/circuit'
import { PRESETS } from '../../src/model/presets'
import { GATE_TYPES, GATES, type Circuit, type GateType } from '../../src/model/types'
import { parseQasm } from '../../src/parser/qasm'
import { parseQiskit } from '../../src/parser/qiskit'
import { mulberry32 } from '../engine/helpers'

function parsedQiskit(text: string): Circuit {
  const { circuit, problems } = parseQiskit(text)
  expect(problems).toEqual([])
  expect(circuit).not.toBeNull()
  return circuit as Circuit
}

function parsedQasm(text: string): Circuit {
  const { circuit, problems } = parseQasm(text)
  expect(problems).toEqual([])
  return circuit as Circuit
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

/**
 * An angle that toQiskit writes exactly: a reduced fraction p·π/q (q ≤ 16) or a short decimal.
 * (Arbitrary angles are written with 12 significant digits, so they come back within ~1e-12,
 * not bit-for-bit; those are covered by the cross-format and statevector checks below.)
 */
function exactAngle(rand: () => number): number {
  if (rand() < 0.5) return Number((rand() * 6 - 3).toFixed(6))
  for (;;) {
    const q = 1 + Math.floor(rand() * 16)
    const p = Math.floor(rand() * 33) - 16
    if (p !== 0 && gcd(Math.abs(p), q) === 1) return (p * Math.PI) / q
  }
}

/** Random gates placed the way the parsers place them (each in its earliest column). */
function randomPackedCircuit(
  rand: () => number,
  numQubits: number,
  gates: number,
  angle: (rand: () => number) => number,
): Circuit {
  const circuit: Circuit = {
    numQubits,
    initialStates: defaultInitialStates(numQubits),
    operations: [],
  }
  const usable = GATE_TYPES.filter((g) => GATES[g].arity <= numQubits)
  for (let k = 0; k < gates; k++) {
    const gate: GateType = usable[Math.floor(rand() * usable.length)]
    const qubits: number[] = []
    while (qubits.length < GATES[gate].arity) {
      const q = Math.floor(rand() * numQubits)
      if (!qubits.includes(q)) qubits.push(q)
    }
    circuit.operations.push({
      id: `r${k}`,
      gate,
      qubits,
      column: earliestFreeColumn(circuit, qubits),
      ...(GATES[gate].parametric ? { angle: angle(rand) } : {}),
    })
  }
  return circuit
}

/** Random gates dropped into random free columns, like a user on the canvas (gaps allowed). */
function randomCanvasCircuit(rand: () => number, numQubits: number, gates: number): Circuit {
  const circuit = randomPackedCircuit(rand, numQubits, gates, (r) => (r() * 4 - 2) * Math.PI)
  const spread: Circuit = { ...circuit, operations: [] }
  for (const op of circuit.operations) {
    let column = Math.floor(rand() * (gates + 2))
    while (!isPlacementFree(spread, column, op.qubits)) column += 1
    spread.operations.push({ ...op, column })
  }
  return spread
}

function expectSameState(a: Circuit, b: Circuit) {
  const sa = simulate(a)
  const sb = simulate(b)
  sa.forEach((amp, i) => {
    expect(Math.abs(amp.re - sb[i].re)).toBeLessThan(1e-9)
    expect(Math.abs(amp.im - sb[i].im)).toBeLessThan(1e-9)
  })
}

describe('Qiskit round trip: presets', () => {
  it.each(PRESETS.map((p) => [p.id, p.circuit] as const))('%s', (_id, circuit) => {
    const text = toQiskit(circuit)
    const back = parsedQiskit(text) // zero problems
    // Same circuit as the QASM tab would produce, the same physics, and a text fixed point.
    expect(circuitsEqual(back, parsedQasm(toQasm(circuit)))).toBe(true)
    expectSameState(circuit, back)
    expect(toQiskit(back)).toBe(text)
    // Presets without arbitrary-decimal angles come back identical.
    if (circuit.operations.every((o) => o.angle === undefined)) {
      expect(circuitsEqual(back, circuit)).toBe(true)
    }
  })

  it('presets laid out ASAP with exact angles round-trip to an equal circuit', () => {
    for (const preset of PRESETS) {
      const normalised = parsedQiskit(toQiskit(preset.circuit))
      expect(circuitsEqual(parsedQiskit(toQiskit(normalised)), normalised)).toBe(true)
    }
  })
})

describe('Qiskit round trip: 240 seeded random circuits', () => {
  const rand = mulberry32(20261008)
  const cases = Array.from({ length: 240 }, (_, i) => {
    const n = 1 + (i % 6)
    return [i, randomPackedCircuit(rand, n, 1 + Math.floor(rand() * 30), exactAngle)] as const
  })

  it.each(cases)('#%i parseQiskit(toQiskit(c)) ≡ c', (_i, c) => {
    const back = parsedQiskit(toQiskit(c))
    expect(circuitsEqual(back, c)).toBe(true)
  })
})

describe('cross-format: Qiskit and QASM give the same circuit', () => {
  const rand = mulberry32(8102026)
  const cases = Array.from({ length: 100 }, (_, i) => {
    const n = 1 + (i % 6)
    return [i, randomCanvasCircuit(rand, n, 2 + Math.floor(rand() * 25))] as const
  })

  it.each(cases)('#%i canvas layout with arbitrary angles', (_i, c) => {
    const viaQiskit = parsedQiskit(toQiskit(c))
    const viaQasm = parsedQasm(toQasm(c))
    expect(circuitsEqual(viaQiskit, viaQasm)).toBe(true)
    expectSameState(c, viaQiskit)
    expect(sortedOperations(viaQiskit)).toHaveLength(c.operations.length)
  })

  it('an empty circuit', () => {
    const empty: Circuit = { numQubits: 3, initialStates: defaultInitialStates(3), operations: [] }
    expect(circuitsEqual(parsedQiskit(toQiskit(empty)), empty)).toBe(true)
    const single: Circuit = { numQubits: 1, initialStates: defaultInitialStates(1), operations: [] }
    expect(circuitsEqual(parsedQiskit(toQiskit(single)), single)).toBe(true)
  })
})
