import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCircuitStore, useResultsStore } from '../../src/model/store'
import { COMPUTING_DELAY_MS, EngineClient, type WorkerLike } from '../../src/worker/engineClient'
import { handleRequest } from '../../src/worker/handleRequest'
import type { WorkerRequest, WorkerResponse } from '../../src/worker/protocol'
import { startEngineBridge } from '../../src/worker/useEngineBridge'
import { circuit } from '../engine/helpers'

/** A fake Worker: records requests; the test decides when (and whether) to reply. */
class FakeWorker implements WorkerLike {
  requests: WorkerRequest[] = []
  terminated = false
  private messageListeners: ((e: MessageEvent<WorkerResponse>) => void)[] = []
  private errorListeners: ((e: ErrorEvent) => void)[] = []

  postMessage(message: WorkerRequest): void {
    // Like the real thing, the worker gets a structured clone.
    this.requests.push(structuredClone(message))
  }
  addEventListener(type: 'message', listener: (e: MessageEvent<WorkerResponse>) => void): void
  addEventListener(type: 'error', listener: (e: ErrorEvent) => void): void
  addEventListener(
    type: 'message' | 'error',
    listener: ((e: MessageEvent<WorkerResponse>) => void) | ((e: ErrorEvent) => void),
  ): void {
    if (type === 'message')
      this.messageListeners.push(listener as (e: MessageEvent<WorkerResponse>) => void)
    else this.errorListeners.push(listener as (e: ErrorEvent) => void)
  }
  terminate(): void {
    this.terminated = true
  }

  /** Compute and deliver the reply to request #index (0-based). */
  reply(index: number): void {
    const data = handleRequest(this.requests[index])
    for (const l of this.messageListeners) l({ data } as MessageEvent<WorkerResponse>)
  }
  fail(): void {
    const event = { message: 'load failed', preventDefault: () => {} } as ErrorEvent
    for (const l of this.errorListeners) l(event)
  }
}

const bell = circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]])
const plus = circuit(1, ['H', 0, [0]])
const invalid = circuit(1, ['CX', 0, [0, 1]])

function makeClient(worker: FakeWorker | null) {
  const onResult = vi.fn()
  const onError = vi.fn()
  const onComputingChange = vi.fn()
  const client = new EngineClient({
    createWorker: () => worker,
    onResult,
    onError,
    onComputingChange,
  })
  return { client, onResult, onError, onComputingChange }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('EngineClient', () => {
  it('posts requests with increasing ids and delivers the result', () => {
    const worker = new FakeWorker()
    const { client, onResult } = makeClient(worker)
    client.request(bell, 0)
    client.request(plus, null)
    expect(worker.requests.map((r) => r.requestId)).toEqual([1, 2])
    expect(worker.requests[0]).toMatchObject({ type: 'analyze', explicitQubit: 0 })
    worker.reply(1)
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult.mock.calls[0][0].analysis.numQubits).toBe(1)
  })

  it('ignores stale responses', () => {
    const worker = new FakeWorker()
    const { client, onResult } = makeClient(worker)
    client.request(bell, null)
    client.request(plus, null)
    worker.reply(1) // latest first
    worker.reply(0) // older one arrives late: dropped
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult.mock.calls[0][0].requestId).toBe(2)

    // An older reply while the latest is still pending is dropped too.
    client.request(bell, null)
    client.request(plus, null)
    worker.reply(2)
    expect(onResult).toHaveBeenCalledTimes(1)
  })

  it('sets computing only after the request is outstanding for > 150 ms', () => {
    const worker = new FakeWorker()
    const { client, onComputingChange } = makeClient(worker)

    // Fast reply: never flips the flag.
    client.request(bell, null)
    vi.advanceTimersByTime(COMPUTING_DELAY_MS - 1)
    worker.reply(0)
    vi.advanceTimersByTime(1000)
    expect(onComputingChange).not.toHaveBeenCalled()

    // Slow reply: on after the delay, off when the latest reply lands.
    client.request(plus, null)
    vi.advanceTimersByTime(COMPUTING_DELAY_MS - 1)
    expect(onComputingChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onComputingChange).toHaveBeenLastCalledWith(true)
    worker.reply(1)
    expect(onComputingChange).toHaveBeenLastCalledWith(false)
    expect(onComputingChange).toHaveBeenCalledTimes(2)
  })

  it('does not restart the computing timer during a burst of edits', () => {
    const worker = new FakeWorker()
    const { client, onComputingChange } = makeClient(worker)
    client.request(bell, null)
    vi.advanceTimersByTime(100)
    client.request(plus, null)
    worker.reply(0) // stale: results still out of date
    vi.advanceTimersByTime(60)
    expect(onComputingChange).toHaveBeenLastCalledWith(true)
  })

  it('reports engine errors', () => {
    const worker = new FakeWorker()
    const { client, onError, onResult } = makeClient(worker)
    client.request(invalid, null)
    worker.reply(0)
    expect(onResult).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toMatch(/.+/)
  })

  it('computes synchronously when no worker is available', () => {
    const { client, onResult, onComputingChange } = makeClient(null)
    expect(client.usesWorker).toBe(false)
    client.request(bell, 1)
    expect(onResult).toHaveBeenCalledTimes(1)
    expect(onResult.mock.calls[0][0].explicit.qubit).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(onComputingChange).not.toHaveBeenCalled()
  })

  it('falls back to the main thread if the worker fails to load', () => {
    const worker = new FakeWorker()
    const { client, onResult } = makeClient(worker)
    client.request(bell, null)
    worker.fail()
    expect(worker.terminated).toBe(true)
    expect(client.usesWorker).toBe(false)
    expect(onResult).toHaveBeenCalledTimes(1)
    client.request(plus, null)
    expect(onResult).toHaveBeenCalledTimes(2)
  })

  it('dispose terminates the worker and ignores later replies', () => {
    const worker = new FakeWorker()
    const { client, onResult } = makeClient(worker)
    client.request(bell, null)
    client.dispose()
    client.dispose()
    expect(worker.terminated).toBe(true)
    worker.reply(0)
    client.request(plus, null)
    expect(onResult).not.toHaveBeenCalled()
    expect(worker.requests).toHaveLength(1)
  })
})

describe('startEngineBridge', () => {
  const initialCircuit = useCircuitStore.getState()
  const initialResults = useResultsStore.getState()

  beforeEach(() => {
    useCircuitStore.setState(initialCircuit, true)
    useResultsStore.setState(initialResults, true)
  })

  it('sends the initial circuit and every change, and writes results', () => {
    const worker = new FakeWorker()
    const stop = startEngineBridge(() => worker)
    expect(worker.requests).toHaveLength(1)
    expect(worker.requests[0].circuit.numQubits).toBe(2)

    useCircuitStore.getState().addOperation({ gate: 'H', column: 0, qubits: [0] })
    useCircuitStore.getState().selectQubit(1)
    expect(worker.requests).toHaveLength(3)
    expect(worker.requests[2]).toMatchObject({ explicitQubit: 1 })

    worker.reply(2)
    const results = useResultsStore.getState()
    expect(results.analysis?.qubits[0].bloch.x).toBeCloseTo(1)
    expect(results.explicit?.qubit).toBe(1)
    expect(results.error).toBeNull()

    stop()
    expect(worker.terminated).toBe(true)
    useCircuitStore.getState().addQubit()
    expect(worker.requests).toHaveLength(3)
  })

  it('reports errors and drives the computing flag', () => {
    const worker = new FakeWorker()
    const stop = startEngineBridge(() => worker)
    vi.advanceTimersByTime(COMPUTING_DELAY_MS)
    expect(useResultsStore.getState().computing).toBe(true)

    useCircuitStore.getState().setCircuit(invalid, 'qasm')
    worker.reply(1)
    expect(useResultsStore.getState().computing).toBe(false)
    expect(useResultsStore.getState().error).toMatch(/.+/)
    stop()
  })

  it('works without a worker (synchronous fallback)', () => {
    const stop = startEngineBridge(() => null)
    expect(useResultsStore.getState().analysis?.numQubits).toBe(2)
    stop()
  })

  it('is safe to start, stop and start again (StrictMode)', () => {
    const first = new FakeWorker()
    const second = new FakeWorker()
    startEngineBridge(() => first)()
    const stop = startEngineBridge(() => second)
    expect(first.terminated).toBe(true)
    useCircuitStore.getState().addQubit()
    expect(first.requests).toHaveLength(1)
    expect(second.requests).toHaveLength(2)
    second.reply(1)
    expect(useResultsStore.getState().analysis?.numQubits).toBe(3)
    stop()
  })
})
