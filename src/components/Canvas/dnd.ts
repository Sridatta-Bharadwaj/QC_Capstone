// Typed helpers for the data attached to dnd-kit draggables (gates) and droppables (cells).
import type { GateType } from '../../model/types'
import { GATES } from '../../model/types'
import type { DragSource, DropCell } from './placement'

export interface DragData {
  source: DragSource
}

export interface DropData {
  cell: DropCell
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Reads the DragSource from a draggable's `data.current`, or null if it is not one of ours. */
export function readDragSource(data: unknown): DragSource | null {
  if (!isRecord(data) || !isRecord(data.source)) return null
  const s = data.source
  if (s.kind === 'palette' && typeof s.gate === 'string' && s.gate in GATES)
    return { kind: 'palette', gate: s.gate as GateType }
  if (s.kind === 'operation' && typeof s.id === 'string' && typeof s.grabbedQubit === 'number')
    return { kind: 'operation', id: s.id, grabbedQubit: s.grabbedQubit }
  return null
}

/** Reads the DropCell from a droppable's `data.current`, or null. */
export function readDropCell(data: unknown): DropCell | null {
  if (!isRecord(data) || !isRecord(data.cell)) return null
  const { qubit, column } = data.cell
  if (typeof qubit !== 'number' || typeof column !== 'number') return null
  return { qubit, column }
}

export const cellId = (qubit: number, column: number) => `cell:${qubit}:${column}`
export const paletteId = (gate: GateType) => `palette:${gate}`
export const partId = (opId: string, qubit: number) => `op:${opId}:${qubit}`
