// Pure helpers for working with a Circuit (no React, no store).
import { GATES, MAX_QUBITS, type Circuit, type Operation } from './types'

let idCounter = 0
/** Unique operation id. */
export function newOperationId(): string {
  idCounter += 1
  return `op-${Date.now().toString(36)}-${idCounter.toString(36)}`
}

export function emptyCircuit(numQubits: number): Circuit {
  return { numQubits, operations: [] }
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
export function earliestFreeColumn(circuit: Circuit, qubits: readonly number[]): number {
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
  const info = GATES[op.gate]
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
