// Wires the stores to the engine: circuit store → worker → results store.
import { useEffect } from 'react'
import { useCircuitStore, useResultsStore } from '../model/store'
import { requestedStep, useStepStore } from '../model/stepStore'
import { EngineClient, type WorkerLike } from './engineClient'

/** Spawn the real module worker, or null if Web Workers are unavailable. */
export function createEngineWorker(): WorkerLike | null {
  if (typeof Worker === 'undefined') return null
  try {
    // This exact `new Worker(new URL(...), …)` form is what Vite looks for to
    // bundle the worker as its own chunk.
    return new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return null
  }
}

/**
 * Start the bridge: send the current circuit right away, then a new request
 * whenever the circuit, the selected qubit or the debugger step (V2-5) changes.
 * The step goes in the request, so every view fed by useResultsStore (spheres,
 * status bar, single-qubit teaching tabs) shows the state at that step. Results, errors and the
 * `computing` flag go to useResultsStore.
 *
 * `computing` semantic: true only when the latest results have been out of date
 * for more than ~150 ms (see COMPUTING_DELAY_MS). Views should show skeletons
 * while it is true and keep showing the previous results otherwise.
 *
 * Returns a cleanup function that unsubscribes and terminates the worker.
 */
export function startEngineBridge(
  createWorker: () => WorkerLike | null = createEngineWorker,
): () => void {
  const results = useResultsStore.getState()
  const client = new EngineClient({
    createWorker,
    onResult: (res) => results.setResults(res.analysis, res.explicit),
    // Keep the last good results on screen; just report the error.
    onError: (message) => results.setError(message),
    onComputingChange: (computing) => results.setComputing(computing),
  })

  // Always send the latest circuit, selection and step together.
  const sendCurrent = () => {
    const { circuit, selectedQubit } = useCircuitStore.getState()
    const step = requestedStep(useStepStore.getState())
    client.send({ type: 'analyze', circuit, explicitQubit: selectedQubit, step })
  }
  sendCurrent()

  // A selection change re-runs the whole analysis too. That keeps one simple
  // code path; at ≤ 6 qubits the extra direct-method work is negligible.
  const unsubscribeCircuit = useCircuitStore.subscribe((state, prev) => {
    if (state.circuit !== prev.circuit || state.selectedQubit !== prev.selectedQubit) {
      sendCurrent()
    }
  })
  const unsubscribeStep = useStepStore.subscribe((state, prev) => {
    if (requestedStep(state) !== requestedStep(prev)) sendCurrent()
  })
  const unsubscribe = () => {
    unsubscribeCircuit()
    unsubscribeStep()
  }

  return () => {
    unsubscribe()
    client.dispose()
  }
}

/** Mount once near the app root. StrictMode's mount → unmount → mount is safe. */
export function useEngineBridge(): void {
  useEffect(() => startEngineBridge(), [])
}
