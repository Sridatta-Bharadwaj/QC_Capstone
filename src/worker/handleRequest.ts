// Pure request handler for the engine worker. No Worker / DOM APIs here, so it
// runs the same in the real worker, in the main-thread fallback and in Node tests.
import {
  analyze,
  partialTraceExplicit,
  partialTraceSubset,
  simulate,
  simulateSteps,
  type CircuitAnalysis,
  type PartialTraceResult,
} from '../engine'
import { analyzeState } from '../engine/bloch'
import { simulateColumns } from '../engine/simulator'
import type { Circuit } from '../model/types'
import type { WorkerRequest, WorkerResponse } from './protocol'

/**
 * The analysis at a step (V2-5): step null/undefined = final state, step k = after k columns.
 * Steps past the end clamp to the final state.
 */
function analyzeAt(circuit: Circuit, step: number | null | undefined): CircuitAnalysis {
  if (step === null || step === undefined) return analyze(circuit)
  if (!Number.isInteger(step) || step < 0) throw new Error(`Invalid step ${step}`)
  const states = simulateColumns(circuit)
  return analyzeState(states[Math.min(step, states.length - 1)], circuit.numQubits)
}

/**
 * Run the math pipeline for one request.
 *
 * 'analyze':
 * 1. analyze(circuit): simulate the statevector |ψ⟩, then for every qubit k the
 *    reduced ρₖ via the DIRECT method (O(2ⁿ) per qubit), its Bloch vector and purity.
 * 2. If a qubit is selected, also run the textbook partial trace for it:
 *    build ρ = |ψ⟩⟨ψ| (2ⁿ×2ⁿ, O(4ⁿ)) and sum out every other qubit. We reuse the
 *    statevector from step 1 instead of simulating the circuit a second time.
 * 'steps':  per-column analysis for the step-through timeline.
 * 'subset': keep-any-subset partial trace for the teaching views.
 *
 * Never throws: an engine error becomes an `error` response with the message.
 */
export function handleRequest(
  req: WorkerRequest,
  now: () => number = () => performance.now(),
): WorkerResponse {
  const start = now()
  try {
    switch (req.type) {
      case 'analyze': {
        const analysis = analyzeAt(req.circuit, req.step)
        let explicit: PartialTraceResult | null = null
        if (req.explicitQubit !== null) {
          explicit = partialTraceExplicit(analysis.state, analysis.numQubits, req.explicitQubit)
        }
        return {
          type: 'result',
          requestId: req.requestId,
          analysis,
          explicit,
          elapsedMs: now() - start,
        }
      }
      case 'steps':
        return {
          type: 'steps-result',
          requestId: req.requestId,
          steps: simulateSteps(req.circuit),
          elapsedMs: now() - start,
        }
      case 'subset': {
        const state =
          req.step === null || req.step === undefined
            ? simulate(req.circuit)
            : analyzeAt(req.circuit, req.step).state
        return {
          type: 'subset-result',
          requestId: req.requestId,
          result: partialTraceSubset(state, req.keep, req.explicit),
          elapsedMs: now() - start,
        }
      }
      default:
        throw new Error('Unknown request type')
    }
  } catch (err) {
    return {
      type: 'error',
      requestId: (req as { requestId?: number }).requestId ?? -1,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
