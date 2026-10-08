// Messages between the main thread and the engine Web Worker.
// CONTRACT FILE: change only on `main`.
import type { CircuitAnalysis, PartialTraceResult, StepResult, SubsetTraceResult } from '../engine'
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
  /**
   * Step-through debugger (V2-5): analyse the state after this many columns
   * (0 = start state, k = after columns 0..k−1, same numbering as StepResult.step).
   * Absent or null = the final state (Live).
   */
  step?: number | null
}

/** All per-column results for the timeline (V2-5). */
export interface StepsRequest {
  type: 'steps'
  requestId: number
  circuit: Circuit
}

/** Keep-any-subset partial trace (V2-7). */
export interface SubsetRequest {
  type: 'subset'
  requestId: number
  circuit: Circuit
  /** Qubits to keep (distinct, in range, non-empty). */
  keep: number[]
  /** Also return the textbook steps (full ρ + per-entry sums). */
  explicit: boolean
  /** Same meaning as AnalyzeRequest.step. */
  step?: number | null
}

export type WorkerRequest = AnalyzeRequest | StepsRequest | SubsetRequest

/** A request without its id; the client assigns ids. */
export type WorkerRequestBody =
  | Omit<AnalyzeRequest, 'requestId'>
  | Omit<StepsRequest, 'requestId'>
  | Omit<SubsetRequest, 'requestId'>

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

export interface StepsResult {
  type: 'steps-result'
  requestId: number
  steps: StepResult[]
  elapsedMs: number
}

export interface SubsetResult {
  type: 'subset-result'
  requestId: number
  result: SubsetTraceResult
  elapsedMs: number
}

export interface AnalyzeError {
  type: 'error'
  requestId: number
  message: string
}

export type WorkerResponse = AnalyzeResult | StepsResult | SubsetResult | AnalyzeError
