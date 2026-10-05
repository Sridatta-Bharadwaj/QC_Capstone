// Messages between the main thread and the engine Web Worker.
// CONTRACT FILE: change only on `main`.
import type { CircuitAnalysis, PartialTraceResult } from '../engine'
import type { Circuit } from '../model/types'

/** Main thread → worker. */
export interface AnalyzeRequest {
  type: 'analyze'
  /** Monotonic id. The main thread ignores responses older than the latest request. */
  requestId: number
  circuit: Circuit
  /**
   * When set, the worker also runs the explicit O(4ⁿ) partial trace for this
   * qubit (Density Matrices / Partial Trace Steps tabs). null = skip it.
   */
  explicitQubit: number | null
}

export type WorkerRequest = AnalyzeRequest

/** Worker → main thread. */
export interface AnalyzeResult {
  type: 'result'
  requestId: number
  analysis: CircuitAnalysis
  /** Present when the request had `explicitQubit` set. */
  explicit: PartialTraceResult | null
  /** Compute time inside the worker, for diagnostics. */
  elapsedMs: number
}

export interface AnalyzeError {
  type: 'error'
  requestId: number
  message: string
}

export type WorkerResponse = AnalyzeResult | AnalyzeError
