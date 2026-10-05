// Round trip: circuit → toQasm → parseQasm → circuit must describe the same computation.
import { describe, expect, it } from 'vitest'
import { toQasm } from '../../src/codegen'
import { simulate } from '../../src/engine'
import { earliestFreeColumn, isPlacementFree, sortedOperations } from '../../src/model/circuit'
import { PRESETS } from '../../src/model/presets'
import { GATE_TYPES, GATES, type Circuit, type Operation } from '../../src/model/types'
import { parseQasm } from '../../src/parser/qasm'
import { mulberry32 } from '../engine/helpers'

function parsed(text: string): Circuit {
  const { circuit, problems } = parseQasm(text)
  expect(problems).toEqual([])
  expect(circuit).not.toBeNull()
  return circuit as Circuit
}

/** What each gate does, in time order (ids and exact columns left out). */
function timeline(circuit: Circuit) {
  return sortedOperations(circuit).map((o) => ({ gate: o.gate, qubits: o.qubits, angle: o.angle }))
}

/**
 * Same gates on the same qubits in the same time order. Angles are compared to 1e-9 because
 * toQasm writes non-π angles with 12 significant digits.
 */
function expectSameTimeline(actual: Circuit, expected: Circuit) {
  const a = timeline(actual)
  const e = timeline(expected)
  expect(a.map(({ gate, qubits }) => ({ gate, qubits }))).toEqual(
    e.map(({ gate, qubits }) => ({ gate, qubits })),
  )
  a.forEach((op, i) => {
    if (e[i].angle === undefined) expect(op.angle).toBeUndefined()
    else expect(Math.abs((op.angle as number) - (e[i].angle as number))).toBeLessThan(1e-9)
  })
}

/**
 * For every pair of gates that share a wire, which one comes first. Gates on disjoint wires
 * commute, so their relative order may legitimately change; overlapping ones must not.
 */
function dependencyOrder(circuit: Circuit): string[] {
  const ops = sortedOperations(circuit)
  const key = (o: Operation) => `${o.gate}:${o.qubits.join(',')}`
  const out: string[] = []
  ops.forEach((a, i) => {
    for (const b of ops.slice(i + 1)) {
      const lo = Math.max(Math.min(...a.qubits), Math.min(...b.qubits))
      const hi = Math.min(Math.max(...a.qubits), Math.max(...b.qubits))
      if (lo <= hi) out.push(`${key(a)} < ${key(b)}`)
    }
  })
  return out.sort()
}

function expectSameState(a: Circuit, b: Circuit) {
  const sa = simulate(a)
  const sb = simulate(b)
  expect(sb).toHaveLength(sa.length)
  sa.forEach((amp, i) => {
    expect(Math.abs(amp.re - sb[i].re)).toBeLessThan(1e-9)
    expect(Math.abs(amp.im - sb[i].im)).toBeLessThan(1e-9)
  })
}

/**
 * Random circuit the way a user builds one on the canvas: gates dropped into random free
 * columns, so there can be gaps and gates that could have gone earlier.
 */
function randomCanvasCircuit(rand: () => number, numQubits: number, gates: number): Circuit {
  const circuit: Circuit = { numQubits, operations: [] }
  const usable = GATE_TYPES.filter((g) => GATES[g].arity <= numQubits)
  let id = 0
  for (let k = 0; k < gates; k++) {
    const gate = usable[Math.floor(rand() * usable.length)]
    const qubits: number[] = []
    while (qubits.length < GATES[gate].arity) {
      const q = Math.floor(rand() * numQubits)
      if (!qubits.includes(q)) qubits.push(q)
    }
    let column = Math.floor(rand() * (gates + 2))
    while (!isPlacementFree(circuit, column, qubits)) column += 1
    // Mix of nice multiples of π and arbitrary decimals.
    const angle = GATES[gate].parametric
      ? rand() < 0.5
        ? (Math.round(rand() * 16 - 8) * Math.PI) / 4
        : (rand() * 4 - 2) * Math.PI
      : undefined
    circuit.operations.push({
      id: `r${(id += 1)}`,
      gate,
      column,
      qubits,
      ...(angle === undefined ? {} : { angle }),
    })
  }
  return circuit
}

/** Same gates, but packed the way the parser places them (written order = time order). */
function packed(circuit: Circuit): Circuit {
  const out: Circuit = { numQubits: circuit.numQubits, operations: [] }
  for (const op of sortedOperations(circuit))
    out.operations.push({ ...op, column: earliestFreeColumn(out, op.qubits) })
  return out
}

describe('round trip: presets', () => {
  it.each(PRESETS.map((p) => [p.id, p.circuit] as const))('%s', (_id, circuit) => {
    const text = toQasm(circuit)
    const back = parsed(text)
    expect(back.numQubits).toBe(circuit.numQubits)
    expectSameTimeline(back, circuit)
    expectSameState(circuit, back)
    // Generated text is a fixed point: parse → generate gives the same text again.
    expect(toQasm(back)).toBe(text)
  })
})

describe('round trip: 60 seeded random circuits', () => {
  const rand = mulberry32(20261006)
  const cases = Array.from({ length: 60 }, (_, i) => {
    const n = 1 + (i % 6)
    return [i, randomCanvasCircuit(rand, n, 4 + Math.floor(rand() * 20))] as const
  })

  it.each(cases)('#%i canvas layout: same gates, dependency order and statevector', (_i, c) => {
    const text = toQasm(c)
    const back = parsed(text)
    expect(back.numQubits).toBe(c.numQubits)
    expect(back.operations).toHaveLength(c.operations.length)
    expect(dependencyOrder(back)).toEqual(dependencyOrder(c))
    expectSameState(c, back)
    // One normalisation pass reaches a fixed point.
    const text2 = toQasm(back)
    expect(toQasm(parsed(text2))).toBe(text2)
  })

  it.each(cases)('#%i packed layout: identical time order and text fixed point', (_i, c) => {
    const p = packed(c)
    const text = toQasm(p)
    const back = parsed(text)
    expectSameTimeline(back, p)
    expect(back.operations.map((o) => o.column).sort()).toEqual(
      p.operations.map((o) => o.column).sort(),
    )
    expectSameState(p, back)
    expect(toQasm(back)).toBe(text)
  })
})
