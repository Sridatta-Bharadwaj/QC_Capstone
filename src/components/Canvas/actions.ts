// Canvas actions: glue between placement plans (pure) and the stores.
// Called from drag-and-drop handlers, palette clicks and keyboard shortcuts.
import { useCircuitStore } from '../../model/store'
import { MAX_OPERATIONS, type GateType } from '../../model/types'
import { MAX_COLUMN } from '../../model/validate'
import { useCanvasStore } from './canvasStore'
import {
  planAppend,
  planDrop,
  shiftQubits,
  type DragSource,
  type DropCell,
  type DropPlan,
} from './placement'

/** Applies a plan to the circuit store. Shows the reason as a hint if it cannot be applied. */
function applyPlan(plan: DropPlan): boolean {
  const canvas = useCanvasStore.getState()
  if (!plan.ok) {
    canvas.showHint(plan.reason)
    return false
  }
  const store = useCircuitStore.getState()
  // Same limits as validateCircuit, so anything built here also survives autosave and links.
  if (plan.kind === 'add' && store.circuit.operations.length >= MAX_OPERATIONS) {
    canvas.showHint(`Gate limit reached: a circuit can have at most ${MAX_OPERATIONS} gates.`)
    return false
  }
  const column = plan.kind === 'add' ? plan.op.column : plan.patch.column
  if (column !== undefined && column > MAX_COLUMN) {
    canvas.showHint(`Column limit reached: gates can go up to column ${MAX_COLUMN}.`)
    return false
  }
  if (plan.kind === 'add') {
    const id = store.addOperation(plan.op, 'canvas')
    if (id === null) {
      canvas.showHint('The gate could not be placed there.')
      return false
    }
    canvas.selectOp(id)
  } else {
    if (!store.updateOperation(plan.id, plan.patch, 'canvas')) {
      canvas.showHint('The gate could not be moved there.')
      return false
    }
    canvas.selectOp(plan.id)
  }
  canvas.clearHint()
  return true
}

/** Drop from the palette (new gate) or from the canvas (move). */
export function dropOnCell(source: DragSource, cell: DropCell): boolean {
  return applyPlan(planDrop(useCircuitStore.getState().circuit, source, cell))
}

/** Palette click: append the gate after everything on the selected qubit (or q0). */
export function appendGate(gate: GateType): boolean {
  const { circuit, selectedQubit } = useCircuitStore.getState()
  return applyPlan(planAppend(circuit, gate, selectedQubit ?? 0))
}

/** Keyboard move of the selected gate by whole columns / wires. */
export function nudgeSelected(columnDelta: number, qubitDelta: number): boolean {
  const { selectedOpId } = useCanvasStore.getState()
  const { circuit } = useCircuitStore.getState()
  const op = circuit.operations.find((o) => o.id === selectedOpId)
  if (!op) return false
  // Same as dragging the gate by its first part to a neighbouring cell.
  const target = shiftQubits(op.qubits, qubitDelta)
  return applyPlan(
    planDrop(
      circuit,
      { kind: 'operation', id: op.id, grabbedQubit: op.qubits[0] },
      { qubit: target[0], column: op.column + columnDelta },
    ),
  )
}

export function deleteSelected(): void {
  const canvas = useCanvasStore.getState()
  if (canvas.selectedOpId === null) return
  useCircuitStore.getState().removeOperation(canvas.selectedOpId, 'canvas')
  canvas.selectOp(null)
}
