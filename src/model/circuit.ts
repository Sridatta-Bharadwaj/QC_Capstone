// Pure helpers for working with a Circuit (no React, no store).
import {
  DEFAULT_INITIAL_STATE,
  GATES,
  MAX_QUBITS,
  type Circuit,
  type InitialState,
  type Operation,
} from './types'

let idCounter = 0
/** Unique operation id. */
export function newOperationId(): string {
  idCounter += 1
  return `op-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

/** n copies of the default start state |0⟩. */
export function defaultInitialStates(numQubits: number): InitialState[] {
  return Array.from({ length: numQubits }, () => DEFAULT_INITIAL_STATE)
}

export function emptyCircuit(numQubits: number): Circuit {
  return { numQubits, initialStates: defaultInitialStates(numQubits), operations: [] }
}

/**
 * Initial states resized to n wires: existing wires keep their state, new wires start in |0⟩.
 * Used by add/remove qubit and by parsers when the register size changes.
 */
export function resizeInitialStates(
  states: readonly InitialState[],
  numQubits: number,
): InitialState[] {
  return Array.from({ length: numQubits }, (_, q) => states[q] ?? DEFAULT_INITIAL_STATE)
}

/** True if any wire starts somewhere other than |0⟩. */
export function hasNonDefaultInitialStates(circuit: Circuit): boolean {
  return circuit.initialStates.some((s) => s !== DEFAULT_INITIAL_STATE)
}

/** The wires a gate blocks in its column: every qubit from its lowest to its highest. */
export function occupiedSpan(qubits: readonly number[]): { min: number; max: number } {
  return { min: Math.min(...qubits), max: Math.max(...qubits) }
}

function spansOverlap(a: readonly number[], b: readonly number[]): boolean {
  const sa = occupiedSpan(a)
  const sb = occupiedSpan(b)
  return sa.min <= sb.max && sb.min <= sa.max
}

/** True if a gate on `qubits` can sit in `column` without colliding (optionally ignoring one op). */
export function isPlacementFree(
  circuit: Circuit,
  column: number,
  qubits: readonly number[],
  ignoreId?: string,
): boolean {
  return !circuit.operations.some(
    (op) => op.id !== ignoreId && op.column === column && spansOverlap(op.qubits, qubits),
  )
}

/**
 * Auto-placement (used when gates come from code): the first column AFTER the
 * last gate touching any wire in this gate's span. This keeps time order identical
 * to the order the gates were written in, while packing gates on different
 * qubits into the same column.
 */
export function earliestFreeColumn(
  circuit: Pick<Circuit, 'operations'>,
  qubits: readonly number[],
): number {
  let column = 0
  for (const op of circuit.operations) {
    if (spansOverlap(op.qubits, qubits)) column = Math.max(column, op.column + 1)
  }
  return column
}

/** Number of columns in use (last column index + 1). */
export function columnCount(circuit: Circuit): number {
  return circuit.operations.reduce((n, op) => Math.max(n, op.column + 1), 0)
}

/** Operations in time order: by column, then by lowest qubit. */
export function sortedOperations(circuit: Circuit): Operation[] {
  return [...circuit.operations].sort(
    (a, b) => a.column - b.column || Math.min(...a.qubits) - Math.min(...b.qubits),
  )
}

/** Returns a human-readable reason if the operation is invalid for this circuit, else null. */
export function validateOperation(op: Omit<Operation, 'id'>, numQubits: number): string | null {
  // hasOwn: a hostile gate name like "constructor" must not find Object.prototype members.
  const info = Object.hasOwn(GATES, op.gate) ? GATES[op.gate] : undefined
  if (!info) return `Unknown gate "${String(op.gate)}"`
  if (op.qubits.length !== info.arity)
    return `${info.label} needs ${info.arity} qubit(s), got ${op.qubits.length}`
  if (new Set(op.qubits).size !== op.qubits.length) return `${info.label}: qubits must be distinct`
  for (const q of op.qubits) {
    if (!Number.isInteger(q) || q < 0 || q >= numQubits) return `Qubit ${q} is out of range`
  }
  if (!Number.isInteger(op.column) || op.column < 0) return `Invalid column ${op.column}`
  if (info.parametric && (op.angle === undefined || !Number.isFinite(op.angle)))
    return `${info.label} needs a finite angle`
  return null
}

export function isValidQubitCount(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= MAX_QUBITS
}

/** Identity of a gate for id reuse and comparison: what it does, not where it sits. */
export function operationKey(op: Omit<Operation, 'id'>): string {
  return `${op.gate}|${op.qubits.join(',')}|${op.angle ?? ''}`
}

/**
 * Gives every parsed op an id. Ops matching an op of `previous` (same gate, qubits and angle;
 * matched in time order) reuse its id, everything else gets a fresh one. Parsers use this so
 * an editor edit keeps the canvas selection on unchanged gates.
 */
export function assignOperationIds(
  ops: readonly Omit<Operation, 'id'>[],
  previous: Circuit | undefined,
): Operation[] {
  const pool = new Map<string, string[]>()
  if (previous) {
    for (const op of sortedOperations(previous)) {
      const key = operationKey(op)
      pool.set(key, [...(pool.get(key) ?? []), op.id])
    }
  }
  return ops.map((op) => ({ ...op, id: pool.get(operationKey(op))?.shift() ?? newOperationId() }))
}

/**
 * True if both circuits have the same qubits, the same initial states and the same gates in
 * the same places (ids ignored).
 */
export function circuitsEqual(a: Circuit, b: Circuit): boolean {
  if (a.numQubits !== b.numQubits || a.operations.length !== b.operations.length) return false
  if (a.initialStates.length !== b.initialStates.length) return false
  if (a.initialStates.some((s, q) => s !== b.initialStates[q])) return false
  const canon = (c: Circuit) =>
    c.operations.map((op) => `${op.column}|${operationKey(op)}`).sort((x, y) => (x < y ? -1 : 1))
  const ca = canon(a)
  const cb = canon(b)
  return ca.every((key, i) => key === cb[i])
}
