// Schema validation for circuits that come from OUTSIDE the app: localStorage, the
// shareable URL and uploaded files (PLAN.md → v2 → Security rules).
//
// Everything here treats its input as hostile: it never trusts types, never indexes
// objects with untrusted keys without an own-property check, never throws, and builds
// a brand-new Circuit (fresh ids, no extra keys) instead of passing the input through.
import { collapseEmptyColumns, isPlacementFree, newOperationId, validateOperation } from './circuit'
import {
  GATES,
  INITIAL_STATES,
  MAX_OPERATIONS,
  MAX_QUBITS,
  type Circuit,
  type GateType,
  type InitialState,
  type Operation,
} from './types'

/** Highest column index accepted from outside (the canvas never needs more than this). */
export const MAX_COLUMN = 2 * MAX_OPERATIONS

export type ValidationResult = { circuit: Circuit } | { error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto: unknown = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function own(obj: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(obj, key) ? obj[key] : undefined
}

function isInitialState(value: unknown): value is InitialState {
  return typeof value === 'string' && (INITIAL_STATES as readonly string[]).includes(value)
}

function isGateType(value: unknown): value is GateType {
  return typeof value === 'string' && Object.hasOwn(GATES, value)
}

/** Validates one operation; returns it with a fresh id, or an error message. */
function validateOp(raw: unknown, numQubits: number): Operation | string {
  if (!isPlainObject(raw)) return 'not an object'
  const gate = own(raw, 'gate')
  if (!isGateType(gate)) return 'unknown gate'
  const info = GATES[gate]

  const qubits = own(raw, 'qubits')
  if (!Array.isArray(qubits) || qubits.length !== info.arity) {
    return `${info.label} needs ${info.arity} qubit(s)`
  }
  if (!qubits.every((q): q is number => typeof q === 'number' && Number.isInteger(q))) {
    return 'qubit indices must be integers'
  }

  const column = own(raw, 'column')
  if (
    typeof column !== 'number' ||
    !Number.isInteger(column) ||
    column < 0 ||
    column > MAX_COLUMN
  ) {
    return `column must be an integer from 0 to ${MAX_COLUMN}`
  }

  const op: Operation = { id: newOperationId(), gate, column, qubits: [...qubits] }
  if (info.parametric) {
    const angle = own(raw, 'angle')
    if (typeof angle !== 'number' || !Number.isFinite(angle)) {
      return `${info.label} needs a finite angle`
    }
    op.angle = angle
  }
  // Range, distinctness and the rest of the per-gate rules are shared with the canvas.
  return validateOperation(op, numQubits) ?? op
}

/**
 * Validate an untrusted value (already JSON-parsed) as a Circuit.
 *
 * Accepts `{ numQubits, initialStates?, operations }`. A missing `initialStates` means all
 * |0⟩ (circuits saved before v2). Returns a fresh, safe Circuit or a one-line error message.
 * Empty columns before the first gate are removed and longer empty runs shortened to one.
 * Never throws and never returns a partial circuit.
 */
export function validateCircuit(input: unknown): ValidationResult {
  try {
    if (!isPlainObject(input)) return { error: 'Not a circuit: expected an object.' }

    const numQubits = own(input, 'numQubits')
    if (
      typeof numQubits !== 'number' ||
      !Number.isInteger(numQubits) ||
      numQubits < 1 ||
      numQubits > MAX_QUBITS
    ) {
      return { error: `The qubit count must be a whole number from 1 to ${MAX_QUBITS}.` }
    }

    const rawStates = own(input, 'initialStates')
    let initialStates: InitialState[]
    if (rawStates === undefined) {
      initialStates = Array.from({ length: numQubits }, () => '0' as const)
    } else if (
      !Array.isArray(rawStates) ||
      rawStates.length !== numQubits ||
      !rawStates.every(isInitialState)
    ) {
      return { error: 'Initial states must list one of |0⟩ |1⟩ |+⟩ |−⟩ |i⟩ |−i⟩ per qubit.' }
    } else {
      initialStates = [...rawStates]
    }

    const rawOps = own(input, 'operations')
    if (!Array.isArray(rawOps)) return { error: 'Not a circuit: missing the list of gates.' }
    if (rawOps.length > MAX_OPERATIONS) {
      return { error: `Too many gates (${rawOps.length}); the limit is ${MAX_OPERATIONS}.` }
    }

    const circuit: Circuit = { numQubits, initialStates, operations: [] }
    for (let i = 0; i < rawOps.length; i++) {
      const op = validateOp(rawOps[i], numQubits)
      if (typeof op === 'string') return { error: `Gate ${i + 1}: ${op}.` }
      if (!isPlacementFree(circuit, op.column, op.qubits)) {
        return { error: `Gate ${i + 1}: overlaps another gate in column ${op.column}.` }
      }
      circuit.operations.push(op)
    }
    // Long runs of empty columns (e.g. one gate at column 999) are shortened to one empty
    // column; the physics is unchanged (see collapseEmptyColumns).
    return { circuit: collapseEmptyColumns(circuit) }
  } catch {
    return { error: 'Not a valid circuit.' }
  }
}
