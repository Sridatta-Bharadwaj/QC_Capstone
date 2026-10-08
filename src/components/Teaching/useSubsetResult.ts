// Subset partial trace results for the teaching tabs (V2-7), computed in the engine worker.
//
// This hook owns its own EngineClient (and so its own worker), separate from the main
// analysis bridge: its replies form their own stream, and stale replies (for an older
// circuit or kept set) are dropped by the client's request ids.
import { useEffect, useRef, useState } from 'react'
import type { SubsetTraceResult } from '../../engine/types'
import { requestedStep, useStepStore } from '../../model/stepStore'
import type { Circuit } from '../../model/types'
import { EngineClient } from '../../worker/engineClient'
import { createEngineWorker } from '../../worker/useEngineBridge'

export interface SubsetData {
  /** Latest result whose kept set and qubit count match the request; null until then. */
  result: SubsetTraceResult | null
  /** True when the result has been out of date for more than ~150 ms. */
  computing: boolean
  error: string | null
}

const sameKeep = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((q, i) => q === b[i])

/**
 * Ask the worker for partialTraceSubset(state, keep, explicit = true) whenever the circuit,
 * the kept set or the debugger step (V2-5: the state after that step; Live = final) changes. Does nothing while `enabled` is false (one kept qubit uses the
 * v1 path) or `keep` is empty.
 */
export function useSubsetResult(circuit: Circuit, keep: number[], enabled: boolean): SubsetData {
  const clientRef = useRef<EngineClient | null>(null)
  const [result, setResult] = useState<SubsetTraceResult | null>(null)
  const [computing, setComputing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const step = useStepStore((s) => requestedStep(s))

  // One client per mounted view; terminated on unmount.
  useEffect(() => {
    const client = new EngineClient({
      createWorker: createEngineWorker,
      onResult: () => {}, // this client only sends 'subset' requests
      onOtherResult: (res) => {
        if (res.type !== 'subset-result') return
        setResult(res.result)
        setError(null)
      },
      onError: (message) => setError(message),
      onComputingChange: setComputing,
    })
    clientRef.current = client
    return () => {
      client.dispose()
      clientRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || keep.length === 0) return
    clientRef.current?.send({ type: 'subset', circuit, keep, explicit: true, step })
  }, [circuit, keep, enabled, step])

  // Only show a result that belongs to what is on screen now.
  const fits =
    result !== null && result.numQubits === circuit.numQubits && sameKeep(result.keep, keep)
  return { result: enabled && fits ? result : null, computing, error }
}
