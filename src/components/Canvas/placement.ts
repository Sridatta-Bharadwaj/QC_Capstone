// Pure placement logic for the circuit canvas (no React, no store).
//
// Everything that decides *where* a gate goes when it is dropped, moved or appended lives
// here so it can be unit-tested. The components only translate pointer events into a
// `DragSource` + `DropCell` and hand the resulting plan to the store.
import {
  earliestFreeColumn,
  isPlacementFree,
  occupiedSpan,
  validateOperation,
} from '../../model/circuit'
import { GATES, type Circuit, type GateType, type Operation } from '../../model/types'

/** Rotations dropped from the palette start at π/2 (a quarter turn, easy to see on the sphere). */
export const DEFAULT_ROTATION_ANGLE = Math.PI / 2

/** The canvas always shows at least this many columns. */
export const MIN_VISIBLE_COLUMNS = 10
/** Empty columns kept to the right of the last gate, so there is always room to drop. */
export const EXTRA_VISIBLE_COLUMNS = 4

/** What is being dragged: a new gate from the palette, or one already on the canvas. */
export type DragSource =
  | { kind: 'palette'; gate: GateType }
  /** `grabbedQubit` is the wire of the part that was picked up (e.g. the control dot). */
  | { kind: 'operation'; id: string; grabbedQubit: number }

/** A (wire, column) cell on the canvas. */
export interface DropCell {
  qubit: number
  column: number
}

/** Result of planning a drop. `qubits`/`column` describe where the gate would land (for highlighting). */
export type DropPlan =
  | { ok: true; kind: 'add'; op: Omit<Operation, 'id'>; qubits: number[]; column: number }
  | {
      ok: true
      kind: 'move'
      id: string
      patch: { column: number; qubits: number[] }
      qubits: number[]
      column: number
    }
  | { ok: false; reason: string; qubits: number[] | null; column: number }

/**
 * Default wires for a gate dropped on `anchor`.
 * The drop wire is the first qubit (e.g. the CX control); the others go on the following
 * wires. If that runs off the bottom, they go upward instead. Returns null if the circuit
 * has fewer qubits than the gate needs.
 */
export function defaultQubits(gate: GateType, anchor: number, numQubits: number): number[] | null {
  const arity = GATES[gate].arity
  if (arity > numQubits) return null
  const down = Array.from({ length: arity }, (_, i) => anchor + i)
  if (down[down.length - 1] < numQubits) return down
  const up = Array.from({ length: arity }, (_, i) => anchor - i)
  if (up[up.length - 1] >= 0) return up
  // Neither direction fits (e.g. CCX dropped on the middle of 3 wires): use the block
  // of wires that does fit, keeping the drop wire first.
  const start = Math.max(0, Math.min(anchor, numQubits - arity))
  const block = Array.from({ length: arity }, (_, i) => start + i)
  return [anchor, ...block.filter((q) => q !== anchor)]
}

/** Plain-language message for "this gate needs more wires than the circuit has". */
export function notEnoughQubitsMessage(gate: GateType, numQubits: number): string {
  const info = GATES[gate]
  return `${info.label} needs ${info.arity} qubits; the circuit has ${numQubits}. Add a qubit first.`
}

function occupiedMessage(qubits: readonly number[], column: number): string {
  const { min, max } = occupiedSpan(qubits)
  const wires = min === max ? `q${min}` : `q${min}–q${max}`
  return `Column ${column} is already used on ${wires}.`
}

function newOperation(gate: GateType, column: number, qubits: number[]): Omit<Operation, 'id'> {
  return GATES[gate].parametric
    ? { gate, column, qubits, angle: DEFAULT_ROTATION_ANGLE }
    : { gate, column, qubits }
}

/** Plans dropping `source` onto `cell`. Never mutates the circuit. */
export function planDrop(circuit: Circuit, source: DragSource, cell: DropCell): DropPlan {
  const { column } = cell
  if (!Number.isInteger(column) || column < 0)
    return { ok: false, reason: 'Gates cannot go before column 0.', qubits: null, column }

  if (source.kind === 'palette') {
    const qubits = defaultQubits(source.gate, cell.qubit, circuit.numQubits)
    if (qubits === null)
      return {
        ok: false,
        reason: notEnoughQubitsMessage(source.gate, circuit.numQubits),
        qubits: null,
        column,
      }
    const op = newOperation(source.gate, column, qubits)
    const invalid = validateOperation(op, circuit.numQubits)
    if (invalid !== null) return { ok: false, reason: invalid, qubits, column }
    if (!isPlacementFree(circuit, column, qubits))
      return { ok: false, reason: occupiedMessage(qubits, column), qubits, column }
    return { ok: true, kind: 'add', op, qubits, column }
  }

  const op = circuit.operations.find((o) => o.id === source.id)
  if (!op) return { ok: false, reason: 'That gate no longer exists.', qubits: null, column }

  // Moving keeps the gate's shape: every qubit shifts by the same offset as the grabbed part.
  const qubits = shiftQubits(op.qubits, cell.qubit - source.grabbedQubit)
  if (qubits.some((q) => q < 0 || q >= circuit.numQubits))
    return {
      ok: false,
      reason: `${GATES[op.gate].label} does not fit there.`,
      qubits: null,
      column,
    }
  if (!isPlacementFree(circuit, column, qubits, op.id))
    return { ok: false, reason: occupiedMessage(qubits, column), qubits, column }
  return { ok: true, kind: 'move', id: op.id, patch: { column, qubits }, qubits, column }
}

/**
 * Plans adding `gate` without a drop target (palette click / keyboard): the gate goes on
 * `anchor` (and the wires after it) in the first column after everything already on those wires.
 */
export function planAppend(circuit: Circuit, gate: GateType, anchor: number): DropPlan {
  const qubits = defaultQubits(gate, anchor, circuit.numQubits)
  if (qubits === null)
    return {
      ok: false,
      reason: notEnoughQubitsMessage(gate, circuit.numQubits),
      qubits: null,
      column: 0,
    }
  const column = earliestFreeColumn(circuit, qubits)
  return planDrop(circuit, { kind: 'palette', gate }, { qubit: anchor, column })
}

/** Adds `offset` to every qubit index. */
export function shiftQubits(qubits: readonly number[], offset: number): number[] {
  return qubits.map((q) => q + offset)
}

/**
 * Sets role `index` (e.g. the target) to `qubit`. If another role already uses that wire,
 * the two roles swap wires, so the result stays a valid set of distinct qubits.
 */
export function retargetQubits(qubits: readonly number[], index: number, qubit: number): number[] {
  const next = [...qubits]
  const other = next.indexOf(qubit)
  if (other !== -1 && other !== index) next[other] = next[index]
  next[index] = qubit
  return next
}

/** Names of each entry in `Operation.qubits` for a gate (used by the inspector). */
export function qubitRoles(gate: GateType): string[] {
  switch (gate) {
    case 'CX':
    case 'CZ':
      return ['Control', 'Target']
    case 'CCX':
      return ['Control 1', 'Control 2', 'Target']
    case 'SWAP':
      return ['Qubit A', 'Qubit B']
    default:
      return ['Qubit']
  }
}

/** How each wire of a gate is drawn, in `Operation.qubits` order. */
export type GatePartKind = 'box' | 'control' | 'target' | 'swap'

export function gateParts(gate: GateType): GatePartKind[] {
  switch (gate) {
    case 'CX':
      return ['control', 'target']
    case 'CZ':
      return ['control', 'control']
    case 'SWAP':
      return ['swap', 'swap']
    case 'CCX':
      return ['control', 'control', 'target']
    default:
      return ['box']
  }
}

/** Number of columns to draw: everything in use plus some empty room, at least MIN_VISIBLE_COLUMNS. */
export function visibleColumnCount(usedColumns: number): number {
  return Math.max(MIN_VISIBLE_COLUMNS, usedColumns + EXTRA_VISIBLE_COLUMNS)
}
