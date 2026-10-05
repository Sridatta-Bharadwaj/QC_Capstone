// zustand stores. The circuit store is the single source of truth (PLAN.md → Sync rules).
import { create } from 'zustand'
import type { CircuitAnalysis, PartialTraceResult } from '../engine'
import {
  emptyCircuit,
  isPlacementFree,
  isValidQubitCount,
  newOperationId,
  validateOperation,
} from './circuit'
import { findPreset } from './presets'
import {
  DEFAULT_QUBITS,
  MAX_QUBITS,
  type ChangeSource,
  type Circuit,
  type Operation,
  type Problem,
} from './types'

// ---------------------------------------------------------------------------
// Circuit store
// ---------------------------------------------------------------------------

export interface CircuitState {
  circuit: Circuit
  /** Who made the most recent change (see ChangeSource). */
  lastSource: ChangeSource
  /** Increments on every change; lets subscribers detect updates cheaply. */
  revision: number
  /** Qubit selected by clicking a Bloch sphere (drives the teaching tabs). */
  selectedQubit: number | null

  /** Replace the whole circuit (editor parse results, presets, …). */
  setCircuit: (circuit: Circuit, source: ChangeSource) => void
  /** Add a gate. Returns the new id, or null if invalid or the slot is taken. */
  addOperation: (op: Omit<Operation, 'id'>, source?: ChangeSource) => string | null
  /** Move / re-target / change angle. Returns false (no change) if the result is invalid or collides. */
  updateOperation: (
    id: string,
    patch: Partial<Omit<Operation, 'id' | 'gate'>>,
    source?: ChangeSource,
  ) => boolean
  removeOperation: (id: string, source?: ChangeSource) => void
  /** Adds a wire at the bottom (no-op at MAX_QUBITS). */
  addQubit: () => void
  /** Removes the bottom wire and any gate touching it (no-op at 1 qubit). */
  removeQubit: () => void
  /** Removes all gates, keeps the qubit count. */
  clear: () => void
  loadPreset: (presetId: string) => void
  selectQubit: (qubit: number | null) => void
}

function commit(
  state: CircuitState,
  circuit: Circuit,
  source: ChangeSource,
): Partial<CircuitState> {
  const selectedQubit =
    state.selectedQubit !== null && state.selectedQubit < circuit.numQubits
      ? state.selectedQubit
      : null
  return { circuit, lastSource: source, revision: state.revision + 1, selectedQubit }
}

export const useCircuitStore = create<CircuitState>((set, get) => ({
  circuit: emptyCircuit(DEFAULT_QUBITS),
  lastSource: 'canvas',
  revision: 0,
  selectedQubit: null,

  setCircuit: (circuit, source) => set((s) => commit(s, circuit, source)),

  addOperation: (op, source = 'canvas') => {
    const { circuit } = get()
    if (validateOperation(op, circuit.numQubits) !== null) return null
    if (!isPlacementFree(circuit, op.column, op.qubits)) return null
    const id = newOperationId()
    const next: Circuit = { ...circuit, operations: [...circuit.operations, { ...op, id }] }
    set((s) => commit(s, next, source))
    return id
  },

  updateOperation: (id, patch, source = 'canvas') => {
    const { circuit } = get()
    const current = circuit.operations.find((o) => o.id === id)
    if (!current) return false
    const updated: Operation = { ...current, ...patch, id }
    if (validateOperation(updated, circuit.numQubits) !== null) return false
    if (!isPlacementFree(circuit, updated.column, updated.qubits, id)) return false
    const next: Circuit = {
      ...circuit,
      operations: circuit.operations.map((o) => (o.id === id ? updated : o)),
    }
    set((s) => commit(s, next, source))
    return true
  },

  removeOperation: (id, source = 'canvas') =>
    set((s) =>
      commit(
        s,
        { ...s.circuit, operations: s.circuit.operations.filter((o) => o.id !== id) },
        source,
      ),
    ),

  addQubit: () =>
    set((s) => {
      const n = s.circuit.numQubits + 1
      if (n > MAX_QUBITS) return {}
      return commit(s, { ...s.circuit, numQubits: n }, 'canvas')
    }),

  removeQubit: () =>
    set((s) => {
      const n = s.circuit.numQubits - 1
      if (!isValidQubitCount(n)) return {}
      const operations = s.circuit.operations.filter((o) => o.qubits.every((q) => q < n))
      return commit(s, { numQubits: n, operations }, 'canvas')
    }),

  clear: () => set((s) => commit(s, { ...s.circuit, operations: [] }, 'canvas')),

  loadPreset: (presetId) => {
    const preset = findPreset(presetId)
    if (!preset) return
    // Fresh ids so later edits never collide with the preset's static ids.
    const circuit: Circuit = {
      numQubits: preset.circuit.numQubits,
      operations: preset.circuit.operations.map((o) => ({ ...o, id: newOperationId() })),
    }
    set((s) => commit(s, circuit, 'preset'))
  },

  selectQubit: (qubit) => set({ selectedQubit: qubit }),
}))

// ---------------------------------------------------------------------------
// Results store (filled by the worker bridge, M5)
// ---------------------------------------------------------------------------

export interface ResultsState {
  analysis: CircuitAnalysis | null
  /** Explicit partial trace for the selected qubit (teaching views). */
  explicit: PartialTraceResult | null
  /** True while a worker request is in flight. */
  computing: boolean
  error: string | null
  setResults: (analysis: CircuitAnalysis, explicit: PartialTraceResult | null) => void
  setComputing: (computing: boolean) => void
  setError: (error: string | null) => void
}

export const useResultsStore = create<ResultsState>((set) => ({
  analysis: null,
  explicit: null,
  computing: false,
  error: null,
  setResults: (analysis, explicit) => set({ analysis, explicit, error: null }),
  setComputing: (computing) => set({ computing }),
  setError: (error) => set({ error }),
}))

// ---------------------------------------------------------------------------
// Problems store (filled by the QASM parser, M7)
// ---------------------------------------------------------------------------

export interface ProblemsState {
  problems: Problem[]
  setProblems: (problems: Problem[]) => void
}

export const useProblemsStore = create<ProblemsState>((set) => ({
  problems: [],
  setProblems: (problems) => set({ problems }),
}))
