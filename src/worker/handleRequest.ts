// Pure request handler for the engine worker. No Worker / DOM APIs here, so it
// runs the same in the real worker, in the main-thread fallback and in Node tests.
import { analyze, partialTraceExplicit, type PartialTraceResult } from '../engine'
import type { WorkerRequest, WorkerResponse } from './protocol'

/**
 * Run the math pipeline for one request.
 *
 * 1. analyze(circuit): simulate the statevector |ψ⟩, then for every qubit k the
 *    reduced ρₖ via the DIRECT method (O(2ⁿ) per qubit), its Bloch vector and purity.
 * 2. If a qubit is selected, also run the textbook partial trace for it:
 *    build ρ = |ψ⟩⟨ψ| (2ⁿ×2ⁿ, O(4ⁿ)) and sum out every other qubit. We reuse the
 *    statevector from step 1 instead of simulating the circuit a second time.
 *
 * Never throws: an engine error becomes an `error` response with the message.
 */
export function handleRequest(
  req: WorkerRequest,
  now: () => number = () => performance.now(),
): WorkerResponse {
  const start = now()
  try {
    const analysis = analyze(req.circuit)
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
  } catch (err) {
    return {
      type: 'error',
      requestId: req.requestId,
      message: err instanceof Error ? err.message : String(err),
    }
  }
}
