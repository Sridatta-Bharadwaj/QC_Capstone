// Undo/redo wiring for the circuit model (PLAN.md → V2-4).
//
// The history store (model/historyStore.ts) only keeps snapshots. This module connects it
// to the circuit store:
//   - every circuit change is pushed as a snapshot, EXCEPT changes made by undo/redo
//     themselves (source 'history') and the startup load (source 'restore', which resets
//     the history instead — see persistence/startup.ts);
//   - undo/redo take the snapshot the history store returns and apply it with source
//     'history', so the code tabs regenerate and the subscriber does not push it again.
//
// Editor parses arrive as one setCircuit(c, 'qasm' | 'qiskit') per debounced, committed
// parse (CodePanel guarantees it), so each one becomes exactly one undo step.
//
// Coalescing (for continuous gestures such as the V2-6 rotation slider):
//
//   const key = `slider:${opId}:${dragId}`          // one key per drag
//   runWithHistoryKey(key, () => updateOperation(opId, { angle }))   // on every frame
//
// Consecutive pushes with the same key replace each other, so the whole drag is one undo
// step that goes back to the circuit from before the drag started.
import { circuitsEqual, emptyCircuit } from '../model/circuit'
import { useHistoryStore } from '../model/historyStore'
import { useCircuitStore } from '../model/store'
import { DEFAULT_QUBITS, type Circuit } from '../model/types'

/** Coalesce key for changes made inside runWithHistoryKey (read by the subscriber). */
let activeCoalesceKey: string | undefined

/**
 * Runs `fn`; every circuit change it makes is pushed with `key` as its coalesceKey.
 * zustand notifies subscribers synchronously, so the key is in place when they run.
 */
export function runWithHistoryKey<T>(key: string, fn: () => T): T {
  const outer = activeCoalesceKey
  activeCoalesceKey = key
  try {
    return fn()
  } finally {
    activeCoalesceKey = outer
  }
}

let unsubscribe: (() => void) | null = null

/**
 * Starts recording circuit changes into the history (idempotent). Seeds the history with
 * the current circuit. Returns a function that stops recording (used by tests).
 */
export function startHistoryTracking(): () => void {
  if (unsubscribe) return unsubscribe
  useHistoryStore.getState().reset(useCircuitStore.getState().circuit)
  const stop = useCircuitStore.subscribe((state, prev) => {
    if (state.revision === prev.revision) return
    if (state.lastSource === 'history' || state.lastSource === 'restore') return
    const history = useHistoryStore.getState()
    const current = history.entries[history.index]
    // A change that ends where we already are (e.g. a gate dragged back to its own cell)
    // is not worth an undo step. A coalesced gesture always records its latest state.
    if (
      activeCoalesceKey === undefined &&
      current &&
      circuitsEqual(current.circuit, state.circuit)
    ) {
      return
    }
    history.push(state.circuit, state.lastSource, { coalesceKey: activeCoalesceKey })
  })
  unsubscribe = () => {
    stop()
    unsubscribe = null
  }
  return unsubscribe
}

/** Undo the last circuit change. Returns false when there is nothing to undo. */
export function undoCircuit(): boolean {
  const circuit = useHistoryStore.getState().undo()
  if (!circuit) return false
  useCircuitStore.getState().setCircuit(circuit, 'history')
  return true
}

/** Redo the last undone change. Returns false when there is nothing to redo. */
export function redoCircuit(): boolean {
  const circuit = useHistoryStore.getState().redo()
  if (!circuit) return false
  useCircuitStore.getState().setCircuit(circuit, 'history')
  return true
}

/** True if the circuit is already a fresh workspace (2 qubits, all |0⟩, no gates). */
export function isNewCircuit(circuit: Circuit): boolean {
  return circuitsEqual(circuit, emptyCircuit(DEFAULT_QUBITS))
}

/** Clears to a fresh workspace: 2 qubits, all |0⟩, no gates. A normal (undoable) change. */
export function newCircuit(): void {
  useCircuitStore.getState().setCircuit(emptyCircuit(DEFAULT_QUBITS), 'canvas')
}
