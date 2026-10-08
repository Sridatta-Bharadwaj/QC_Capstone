// Autosave of the circuit to localStorage (PLAN.md → V2-4).
//
// Storage is untrusted (another tab, an old version or the user may have written anything)
// and may be unavailable (private mode, blocked site data, quota). So: every access is in
// try/catch, the size is checked before JSON.parse, and the parsed value goes through
// validateCircuit. Invalid data is removed so it cannot break the next start either.
import { useCircuitStore } from '../model/store'
import type { Circuit } from '../model/types'
import { validateCircuit, type ValidationResult } from '../model/validate'

/** Versioned key: a future format change uses a new key instead of misreading old data. */
export const STORAGE_KEY = 'qc-capstone:circuit:v2'
/** Debounce between the last change and the write. */
export const AUTOSAVE_DELAY_MS = 500
/** A valid circuit (≤ 500 gates) is far below this; anything larger is discarded unread. */
export const MAX_SAVED_CHARS = 256 * 1024

/** window.localStorage, or null if it is missing or even reading the property throws. */
function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function removeSaved(storage: Storage): void {
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing more we can do; the next start will discard it again.
  }
}

/**
 * Reads the saved circuit. Returns null when nothing is saved (or storage is unavailable),
 * `{ circuit }` when valid, `{ error }` when the saved data was invalid and has been removed.
 */
export function readSavedCircuit(): ValidationResult | null {
  const storage = getStorage()
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  let result: ValidationResult
  if (raw.length > MAX_SAVED_CHARS) {
    result = { error: 'Saved circuit is too large.' }
  } else {
    try {
      result = validateCircuit(JSON.parse(raw))
    } catch {
      result = { error: 'Saved circuit is not valid JSON.' }
    }
  }
  if ('error' in result) removeSaved(storage)
  return result
}

/** Plain JSON form (no ids: they are regenerated on load). */
export function serializeCircuit(circuit: Circuit): string {
  return JSON.stringify({
    numQubits: circuit.numQubits,
    initialStates: circuit.initialStates,
    operations: circuit.operations.map(({ gate, column, qubits, angle }) =>
      angle === undefined ? { gate, column, qubits } : { gate, column, qubits, angle },
    ),
  })
}

/** Writes the circuit now. Returns false if storage is unavailable or full. */
export function writeSavedCircuit(circuit: Circuit): boolean {
  const storage = getStorage()
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, serializeCircuit(circuit))
    return true
  } catch {
    return false
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
let pending = false

/** Writes a pending save immediately (also run when the page is hidden or closed). */
export function flushAutosave(): void {
  clearTimeout(timer)
  timer = undefined
  if (!pending) return
  pending = false
  writeSavedCircuit(useCircuitStore.getState().circuit)
}

/**
 * Saves the circuit AUTOSAVE_DELAY_MS after the last change. Returns a function that stops
 * autosaving (used by tests).
 */
export function startAutosave(): () => void {
  const stop = useCircuitStore.subscribe((state, prev) => {
    if (state.revision === prev.revision) return
    pending = true
    clearTimeout(timer)
    timer = setTimeout(flushAutosave, AUTOSAVE_DELAY_MS)
  })
  // pagehide also fires on mobile tab switches and bfcache; beforeunload alone would miss them.
  const onHide = () => flushAutosave()
  window.addEventListener('pagehide', onHide)
  return () => {
    stop()
    window.removeEventListener('pagehide', onHide)
    clearTimeout(timer)
    timer = undefined
    pending = false
  }
}
