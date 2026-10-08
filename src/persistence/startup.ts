// Startup load + persistence wiring (PLAN.md → V2-4). Called from main.tsx BEFORE the first
// render, so the app never flashes the default circuit.
//
// Load order: shared link in the URL hash (if present and valid) > autosaved circuit >
// default. A bad link or bad saved data shows a notice and falls through to the next one.
//
// Hash decision: after a link is read (valid or not) the hash is removed with
// history.replaceState. Otherwise the stale `#c=…` would win over the user's later
// (autosaved) edits on every reload. A circuit opened from a link is saved right away for
// the same reason. replaceState does not fire `hashchange`, so this cannot loop.
import { showNotice } from '../components/Notices/noticeStore'
import { startHistoryTracking } from '../history/history'
import { useHistoryStore } from '../model/historyStore'
import { useCircuitStore } from '../model/store'
import type { Circuit } from '../model/types'
import { readSavedCircuit, startAutosave, writeSavedCircuit } from './autosave'
import { decodeCircuitHash, isCircuitHash } from './shareLink'

export const SAVED_INVALID_MESSAGE =
  'Saved circuit was invalid and was set aside; starting with a new circuit.'

function clearHash(): void {
  try {
    const { pathname, search } = window.location
    window.history.replaceState(window.history.state, '', pathname + search)
  } catch {
    // Some embedded contexts forbid replaceState; the hash then just stays.
  }
}

/**
 * Reads a `#c=…` hash, if there is one. Returns the circuit, or null (no link / bad link;
 * a bad link shows a notice ending with `fallback`). Clears the hash either way.
 */
function readLinkFromHash(fallback: string): Circuit | null {
  const hash = window.location.hash
  if (!isCircuitHash(hash)) return null
  const result = decodeCircuitHash(hash)
  clearHash()
  if ('error' in result) {
    showNotice(`${result.error} ${fallback}`, { kind: 'warning' })
    return null
  }
  return result.circuit
}

/** Picks the start circuit (hash > saved > default) and applies it. Synchronous. */
export function loadInitialCircuit(): void {
  const { setCircuit } = useCircuitStore.getState()
  const fromLink = readLinkFromHash('Showing the saved circuit instead.')
  if (fromLink) {
    setCircuit(fromLink, 'url')
    writeSavedCircuit(fromLink)
  } else {
    const saved = readSavedCircuit()
    if (saved && 'circuit' in saved) setCircuit(saved.circuit, 'restore')
    else if (saved) showNotice(SAVED_INVALID_MESSAGE, { kind: 'warning' })
  }
  // Whatever we start with is the bottom of the undo stack.
  useHistoryStore.getState().reset(useCircuitStore.getState().circuit)
}

/** A link pasted into the address bar of an open tab: load it as an undoable change. */
function onHashChange(): void {
  const circuit = readLinkFromHash('Keeping the current circuit.')
  if (circuit) {
    useCircuitStore.getState().setCircuit(circuit, 'url')
    showNotice('Opened the circuit from the link.')
  }
}

/**
 * Loads the start circuit and starts history tracking, autosave and the hashchange
 * listener. Returns a function that stops all of them (used by tests).
 */
export function initPersistence(): () => void {
  const stopHistory = startHistoryTracking()
  loadInitialCircuit()
  const stopAutosave = startAutosave()
  window.addEventListener('hashchange', onHashChange)
  return () => {
    stopHistory()
    stopAutosave()
    window.removeEventListener('hashchange', onHashChange)
  }
}
