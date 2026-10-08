// V2-5: step store logic, Live reset on circuit edits, and the bridge sending the step.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { analyze, simulateSteps } from '../../src/engine'
import { currentStep, requestedStep, useStepStore } from '../../src/model/stepStore'
import { useCircuitStore, useResultsStore } from '../../src/model/store'
import type { WorkerLike } from '../../src/worker/engineClient'
import type { WorkerRequest } from '../../src/worker/protocol'
import { startEngineBridge } from '../../src/worker/useEngineBridge'
import { circuit, expectClose } from '../engine/helpers'

const initialCircuit = useCircuitStore.getState()
const initialResults = useResultsStore.getState()
const initialSteps = useStepStore.getState()

beforeEach(() => {
  useCircuitStore.setState(initialCircuit, true)
  useResultsStore.setState(initialResults, true)
  useStepStore.setState(initialSteps, true)
})
afterEach(() => useStepStore.setState(initialSteps, true))

const bell = circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]])
const steps = () => useStepStore.getState()

describe('step store', () => {
  it('starts Live, showing the last step', () => {
    expect(steps().live).toBe(true)
    expect(currentStep(steps(), 5)).toBe(5)
    expect(requestedStep(steps())).toBeNull()
  })

  it('goTo clamps, turns Live off and stops playing', () => {
    useStepStore.setState({ playing: true })
    steps().goTo(9, 3)
    expect(steps()).toMatchObject({ live: false, step: 3, playing: false })
    steps().goTo(-2, 3)
    expect(steps().step).toBe(0)
    expect(requestedStep(steps())).toBe(0)
  })

  it('stepBy moves from the step on screen (N while Live) and clamps', () => {
    steps().stepBy(-1, 4)
    expect(steps()).toMatchObject({ live: false, step: 3 })
    steps().stepBy(1, 4)
    steps().stepBy(1, 4)
    expect(steps().step).toBe(4)
    for (let i = 0; i < 6; i++) steps().stepBy(-1, 4)
    expect(steps().step).toBe(0)
  })

  it('stepBy does nothing without gates', () => {
    steps().stepBy(-1, 0)
    expect(steps().live).toBe(true)
  })

  it('goLive returns to the final state and stops playing', () => {
    useStepStore.setState({ live: false, step: 1, playing: true })
    steps().goLive()
    expect(steps()).toMatchObject({ live: true, playing: false })
  })

  it('any circuit edit returns to Live and stops playing', () => {
    useCircuitStore.getState().setCircuit(bell, 'preset')
    steps().goTo(1, 2)
    useStepStore.setState({ playing: true })
    useCircuitStore.getState().addOperation({ gate: 'X', column: 2, qubits: [1] })
    expect(steps()).toMatchObject({ live: true, playing: false })

    steps().goTo(0, 3)
    useCircuitStore.getState().addQubit()
    expect(steps().live).toBe(true)
  })

  it('selecting a qubit is not an edit: the step stays', () => {
    useCircuitStore.getState().setCircuit(bell, 'preset')
    steps().goTo(1, 2)
    useCircuitStore.getState().selectQubit(1)
    expect(steps()).toMatchObject({ live: false, step: 1 })
  })
})

/** Records requests and answers nothing (we only check what is sent). */
class RecordingWorker implements WorkerLike {
  requests: WorkerRequest[] = []
  postMessage(message: WorkerRequest): void {
    this.requests.push(structuredClone(message))
  }
  addEventListener(): void {}
  terminate(): void {}
}

describe('engine bridge with the step', () => {
  it('sends step null while Live and the chosen step otherwise', () => {
    const worker = new RecordingWorker()
    const stop = startEngineBridge(() => worker)
    useCircuitStore.getState().setCircuit(bell, 'preset')
    expect(worker.requests.at(-1)).toMatchObject({ type: 'analyze', step: null })

    steps().goTo(1, 2)
    expect(worker.requests.at(-1)).toMatchObject({ type: 'analyze', step: 1 })
    const count = worker.requests.length
    steps().goTo(1, 2) // same step: no new request
    expect(worker.requests).toHaveLength(count)

    steps().goLive()
    expect(worker.requests.at(-1)).toMatchObject({ step: null })
    stop()
  })

  it('a circuit edit while stepping ends with a Live request for the new circuit', () => {
    const worker = new RecordingWorker()
    const stop = startEngineBridge(() => worker)
    useCircuitStore.getState().setCircuit(bell, 'preset')
    steps().goTo(0, 2)
    useCircuitStore.getState().addOperation({ gate: 'X', column: 2, qubits: [1] })
    const last = worker.requests.at(-1)
    expect(last).toMatchObject({ type: 'analyze', step: null })
    expect(last?.circuit.operations).toHaveLength(3)
    stop()
  })

  it('Bell: step 1 leaves q0 pure on +x, step 2 makes both qubits maximally mixed', () => {
    const stop = startEngineBridge(() => null) // synchronous fallback = real engine
    useCircuitStore.getState().setCircuit(bell, 'preset')
    useCircuitStore.getState().selectQubit(0)

    steps().goTo(0, 2)
    let q = useResultsStore.getState().analysis!.qubits
    expectClose(q[0].bloch.z, 1)
    expectClose(q[0].purity, 1)

    steps().goTo(1, 2)
    q = useResultsStore.getState().analysis!.qubits
    expectClose(q[0].bloch.x, 1)
    expectClose(q[0].purity, 1)
    expect(q[0].entangled).toBe(false)
    expect(q[1].entangled).toBe(false)
    // The explicit (teaching) trace follows the step too.
    const explicit = useResultsStore.getState().explicit!
    expectClose(explicit.reduced[0][1].re, 0.5)

    steps().goTo(2, 2)
    q = useResultsStore.getState().analysis!.qubits
    for (const k of [0, 1]) {
      expectClose(q[k].length, 0)
      expectClose(q[k].purity, 0.5)
      expect(q[k].entangled).toBe(true)
    }
    stop()
  })

  it('the last step equals the full simulation (Live)', () => {
    const ghz3 = circuit(3, ['H', 0, [0]], ['CX', 1, [0, 1]], ['T', 1, [2]], ['CX', 2, [1, 2]])
    const stop = startEngineBridge(() => null)
    useCircuitStore.getState().setCircuit(ghz3, 'preset')
    const live = useResultsStore.getState().analysis!
    steps().goTo(3, 3)
    const last = useResultsStore.getState().analysis!
    expect(last.state).toEqual(live.state)
    expect(last).toEqual(analyze(ghz3))
    // And matches the engine's per-step list.
    const all = simulateSteps(ghz3)
    expect(all).toHaveLength(4)
    expect(all[3].qubits.map((x) => x.purity)).toEqual(last.qubits.map((x) => x.purity))
    stop()
  })
})
