// Undo/redo history of the circuit model (V2-4). CONTRACT FILE: change only on `main`.
//
// The history is a list of circuit SNAPSHOTS, each taken right after a change, plus a
// pointer to the current one:
//
//   entries:  [c0, c1, c2, c3]      undo → current = c1, returned to the caller
//                       ^ current   redo → back to c2
//
// Pushing after an undo drops the "redo" tail (like every editor). The store never
// changes the circuit store itself: callers apply the returned circuit with source
// 'history', which the history wiring must NOT push again.
import { create } from 'zustand'
import type { ChangeSource, Circuit } from './types'

/** Oldest entries are dropped past this many. */
export const HISTORY_LIMIT = 100

export interface HistoryEntry {
  circuit: Circuit
  source: ChangeSource
  /** Consecutive pushes with the same key replace each other (one entry per slider drag). */
  coalesceKey?: string
}

export interface PushOptions {
  /**
   * If the current entry was pushed with the same key, replace it instead of adding a new
   * one. Use one key per gesture (e.g. `slider:<opId>:<dragId>`) so a whole drag is a
   * single undo step.
   */
  coalesceKey?: string
}

export interface HistoryState {
  entries: HistoryEntry[]
  /** Index of the current entry in `entries` (−1 when empty). */
  index: number
  canUndo: boolean
  canRedo: boolean

  /** Record the circuit as it is AFTER a change. */
  push: (circuit: Circuit, source: ChangeSource, options?: PushOptions) => void
  /** Step back; returns the circuit to apply, or null if there is nothing to undo. */
  undo: () => Circuit | null
  /** Step forward; returns the circuit to apply, or null if there is nothing to redo. */
  redo: () => Circuit | null
  /** Forget everything; the given circuit becomes the only (current) entry. */
  reset: (circuit: Circuit) => void
}

function flags(entries: HistoryEntry[], index: number) {
  return { entries, index, canUndo: index > 0, canRedo: index < entries.length - 1 }
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  entries: [],
  index: -1,
  canUndo: false,
  canRedo: false,

  push: (circuit, source, options = {}) => {
    const { entries, index } = get()
    const kept = entries.slice(0, index + 1)
    const current = kept[kept.length - 1]
    const entry: HistoryEntry = { circuit, source, coalesceKey: options.coalesceKey }
    if (
      current &&
      options.coalesceKey !== undefined &&
      current.coalesceKey === options.coalesceKey
    ) {
      kept[kept.length - 1] = entry
    } else {
      kept.push(entry)
    }
    const trimmed = kept.slice(Math.max(0, kept.length - HISTORY_LIMIT))
    set(flags(trimmed, trimmed.length - 1))
  },

  undo: () => {
    const { entries, index } = get()
    if (index <= 0) return null
    set(flags(entries, index - 1))
    return entries[index - 1].circuit
  },

  redo: () => {
    const { entries, index } = get()
    if (index >= entries.length - 1) return null
    set(flags(entries, index + 1))
    return entries[index + 1].circuit
  },

  reset: (circuit) => set(flags([{ circuit, source: 'restore' }], 0)),
}))
