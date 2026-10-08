// V2-0 engine contracts: initial states and per-column steps.
import { describe, expect, it } from 'vitest'
import { analyze, productState, simulate, simulateSteps } from '../../src/engine'
import { handleRequest } from '../../src/worker/handleRequest'
import type { InitialState } from '../../src/model/types'
import {
  circuit,
  expectBloch,
  expectClose,
  expectState,
  randomCircuit,
  mulberry32,
} from './helpers'

const R = Math.SQRT1_2

describe('initial states', () => {
  it('all |0⟩ is the v1 start state', () => {
    expectState(productState(['0', '0']), [1, 0, 0, 0])
  })

  it('each single-qubit start state has the expected Bloch vector', () => {
    const expected: Record<InitialState, { x: number; y: number; z: number }> = {
      '0': { x: 0, y: 0, z: 1 },
      '1': { x: 0, y: 0, z: -1 },
      '+': { x: 1, y: 0, z: 0 },
      '-': { x: -1, y: 0, z: 0 },
      i: { x: 0, y: 1, z: 0 },
      '-i': { x: 0, y: -1, z: 0 },
    }
    for (const [s, r] of Object.entries(expected) as [InitialState, (typeof expected)['0']][]) {
      const c = { ...circuit(1), initialStates: [s] }
      expectBloch(analyze(c).qubits[0].bloch, r)
    }
  })

  it('product state |1⟩|+⟩ = (|10⟩ + |11⟩)/√2 (q0 is the most significant bit)', () => {
    expectState(productState(['1', '+']), [0, 0, R, R])
  })

  it('|−⟩ through H gives |1⟩', () => {
    const c = { ...circuit(1, ['H', 0, [0]]), initialStates: ['-' as const] }
    expectState(simulate(c), [0, 1])
  })

  it('rejects a wrong number of initial states', () => {
    expect(() => simulate({ ...circuit(2), initialStates: ['0'] })).toThrow()
  })
})

describe('simulateSteps', () => {
  it('has one step per column plus the start state', () => {
    const steps = simulateSteps(circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]]))
    expect(steps.map((s) => s.afterColumn)).toEqual([-1, 0, 1])
  })

  it('Bell circuit: step 1 is pure, step 2 is maximally mixed', () => {
    const steps = simulateSteps(circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]]))
    expectClose(steps[0].qubits[0].purity, 1)
    expectClose(steps[1].qubits[0].purity, 1)
    expect(steps[1].qubits[0].entangled).toBe(false)
    expectClose(steps[2].qubits[0].purity, 0.5)
    expect(steps[2].qubits[0].entangled).toBe(true)
  })

  it('the last step equals the full simulation (random circuits)', () => {
    const rand = mulberry32(7)
    for (let i = 0; i < 30; i++) {
      const c = randomCircuit(rand, 1 + (i % 5), 12)
      const steps = simulateSteps(c)
      const full = analyze(c)
      const last = steps[steps.length - 1]
      last.state.forEach((a, k) => {
        expectClose(a.re, full.state[k].re)
        expectClose(a.im, full.state[k].im)
      })
    }
  })

  it('empty circuit: a single step (the start state)', () => {
    expect(simulateSteps(circuit(3))).toHaveLength(1)
  })
})

describe('worker requests (v2)', () => {
  const bell = circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]])

  it("'steps' returns every step", () => {
    const res = handleRequest({ type: 'steps', requestId: 3, circuit: bell }, () => 0)
    expect(res.type).toBe('steps-result')
    if (res.type === 'steps-result') expect(res.steps).toHaveLength(3)
  })

  it("'analyze' with a step analyses that step", () => {
    const res = handleRequest(
      { type: 'analyze', requestId: 1, circuit: bell, explicitQubit: 0, step: 1 },
      () => 0,
    )
    expect(res.type).toBe('result')
    if (res.type === 'result') {
      expectClose(res.analysis.qubits[0].purity, 1)
      expect(res.explicit?.qubit).toBe(0)
    }
  })

  it("'analyze' rejects a negative step with an error response", () => {
    const res = handleRequest(
      { type: 'analyze', requestId: 2, circuit: bell, explicitQubit: null, step: -1 },
      () => 0,
    )
    expect(res).toMatchObject({ type: 'error', requestId: 2 })
  })
})
