// Main-thread side of the engine worker: sends requests, drops stale replies,
// and decides when the UI should show a "computing" state.
import type { Circuit } from '../model/types'
import { handleRequest } from './handleRequest'
import type { AnalyzeResult, WorkerRequest, WorkerResponse } from './protocol'

/** The subset of the DOM `Worker` API the client uses (lets tests pass a fake). */
export interface WorkerLike {
  postMessage(message: WorkerRequest): void
  addEventListener(type: 'message', listener: (event: MessageEvent<WorkerResponse>) => void): void
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void
  terminate(): void
}

/**
 * `computing` only turns on when results have been out of date for longer than
 * this. At the qubit counts we allow (≤ 6) a request takes well under 1 ms, so
 * the skeleton never flickers; it only appears for genuinely slow computes.
 */
export const COMPUTING_DELAY_MS = 150

export interface EngineClientOptions {
  /** Returns a worker, or null to compute synchronously on the main thread. */
  createWorker: () => WorkerLike | null
  onResult: (result: AnalyzeResult) => void
  onError: (message: string) => void
  onComputingChange: (computing: boolean) => void
  computingDelayMs?: number
}

/**
 * Talks to the engine worker.
 *
 * Bursts: every change is posted right away with a new, increasing requestId.
 * Replies whose requestId is older than the latest request are ignored. This is
 * simpler than a "keep only the latest pending" queue and just as correct: the
 * worker handles messages in order, so the newest reply always arrives last,
 * and the extra stale computations are cheap at ≤ 6 qubits.
 *
 * Fallback: if no worker can be created (old browser, jsdom/Node tests) or the
 * worker fails to load, requests run synchronously through the same
 * `handleRequest`, so the app keeps working, just on the main thread.
 */
export class EngineClient {
  private worker: WorkerLike | null
  private readonly options: EngineClientOptions
  private readonly delayMs: number
  private latestId = 0
  private latestRequest: WorkerRequest | null = null
  /** True while the latest request has no reply yet. */
  private outstanding = false
  private computing = false
  private computingTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(options: EngineClientOptions) {
    this.options = options
    this.delayMs = options.computingDelayMs ?? COMPUTING_DELAY_MS
    this.worker = options.createWorker()
    if (this.worker) {
      this.worker.addEventListener('message', (event) => this.receive(event.data))
      this.worker.addEventListener('error', (event) => this.workerFailed(event))
    }
  }

  /** True when requests go to a Web Worker, false in the synchronous fallback. */
  get usesWorker(): boolean {
    return this.worker !== null
  }

  /** Ask for a fresh analysis. explicitQubit = qubit for the teaching views, or null. */
  request(circuit: Circuit, explicitQubit: number | null): void {
    if (this.disposed) return
    this.latestId += 1
    const req: WorkerRequest = {
      type: 'analyze',
      requestId: this.latestId,
      circuit,
      explicitQubit,
    }
    this.latestRequest = req
    this.outstanding = true

    if (!this.worker) {
      this.receive(handleRequest(req))
      return
    }
    // Start the timer when results first go out of date; later requests in the
    // same burst don't restart it, so a fast stream of edits still shows the
    // indicator if the screen has been stale for > delayMs overall.
    if (this.computingTimer === null) {
      this.computingTimer = setTimeout(() => {
        this.computingTimer = null
        if (this.outstanding) this.setComputing(true)
      }, this.delayMs)
    }
    this.worker.postMessage(req)
  }

  /** Stop the worker and timers. Safe to call more than once. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.clearTimer()
    this.worker?.terminate()
    this.worker = null
    this.setComputing(false)
  }

  private receive(res: WorkerResponse): void {
    if (this.disposed || res.requestId !== this.latestId) return // stale reply
    this.outstanding = false
    this.clearTimer()
    this.setComputing(false)
    if (res.type === 'result') this.options.onResult(res)
    else this.options.onError(res.message)
  }

  /** The worker script failed (e.g. could not load): switch to the main thread. */
  private workerFailed(event: ErrorEvent): void {
    if (this.disposed) return
    event.preventDefault()
    this.worker?.terminate()
    this.worker = null
    this.clearTimer()
    this.setComputing(false)
    if (this.outstanding && this.latestRequest) this.receive(handleRequest(this.latestRequest))
  }

  private clearTimer(): void {
    if (this.computingTimer !== null) {
      clearTimeout(this.computingTimer)
      this.computingTimer = null
    }
  }

  private setComputing(computing: boolean): void {
    if (this.computing === computing) return
    this.computing = computing
    this.options.onComputingChange(computing)
  }
}
