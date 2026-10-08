// Circuit playground: toolbar, the circuit diagram (drop target for gates) and the
// footer with hints and the inspector for the selected gate.
import { useDndContext } from '@dnd-kit/core'
import { useEffect, type KeyboardEvent } from 'react'
import { columnCount, hasNonDefaultInitialStates } from '../../model/circuit'
import { useCircuitStore } from '../../model/store'
import { MAX_QUBITS } from '../../model/types'
import { MathText } from '../common/MathText'
import { deleteSelected, nudgeSelected } from './actions'
import { useCanvasStore } from './canvasStore'
import { CircuitGrid } from './CircuitGrid'
import { readDragSource, readDropCell } from './dnd'
import { GateInspector } from './GateInspector'
import { planDrop, visibleColumnCount } from './placement'
import './Canvas.css'

/** How long a hint stays visible. */
const HINT_MS = 5000

const ARROW_MOVES: Record<string, [columnDelta: number, qubitDelta: number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function CanvasView() {
  const circuit = useCircuitStore((s) => s.circuit)
  const selectedQubit = useCircuitStore((s) => s.selectedQubit)
  const addQubit = useCircuitStore((s) => s.addQubit)
  const removeQubit = useCircuitStore((s) => s.removeQubit)
  const clear = useCircuitStore((s) => s.clear)
  const selectQubit = useCircuitStore((s) => s.selectQubit)
  const selectedOpId = useCanvasStore((s) => s.selectedOpId)
  const selectOp = useCanvasStore((s) => s.selectOp)
  const hint = useCanvasStore((s) => s.hint)
  const clearHint = useCanvasStore((s) => s.clearHint)

  // Live drop preview while something is being dragged over the canvas.
  const { active, over } = useDndContext()
  const dragSource = readDragSource(active?.data.current)
  const overCell = readDropCell(over?.data.current)
  const dropPreview =
    dragSource && overCell
      ? { plan: planDrop(circuit, dragSource, overCell), cell: overCell }
      : null
  const draggingOpId = dragSource?.kind === 'operation' ? dragSource.id : null

  const selectedOp = circuit.operations.find((o) => o.id === selectedOpId) ?? null
  const n = circuit.numQubits
  const atMax = n >= MAX_QUBITS
  const atMin = n <= 1

  useEffect(() => {
    if (!hint) return
    const timer = window.setTimeout(() => clearHint(hint.id), HINT_MS)
    return () => window.clearTimeout(timer)
  }, [hint, clearHint])

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    // Never steal keys from the inspector's inputs and selects.
    const target = e.target as HTMLElement
    if (target.closest('input, select, textarea')) return
    if (!selectedOp) return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      deleteSelected()
    } else if (e.key === 'Escape') {
      selectOp(null)
    } else if (e.key in ARROW_MOVES) {
      e.preventDefault()
      const [dc, dq] = ARROW_MOVES[e.key]
      nudgeSelected(dc, dq)
    }
  }

  const liveReason = dropPreview && !dropPreview.plan.ok ? dropPreview.plan.reason : null
  const message = liveReason ?? hint?.text ?? null

  return (
    <section className="canvas" aria-label="Circuit" onKeyDown={handleKeyDown}>
      <div className="panel-header">
        <span>Circuit</span>
        <span className="spacer" />
        <span className="canvas__count" title="Qubits in use / maximum">
          {n} / {MAX_QUBITS}
        </span>
        <button
          type="button"
          className="icon-button"
          aria-label={atMax ? `Add qubit (maximum of ${MAX_QUBITS} qubits reached)` : 'Add qubit'}
          title={atMax ? `Maximum of ${MAX_QUBITS} qubits reached` : 'Add qubit'}
          disabled={atMax}
          onClick={addQubit}
        >
          <span className="codicon codicon-add" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label={atMin ? 'Remove qubit (at least one qubit is needed)' : 'Remove qubit'}
          title={atMin ? 'At least one qubit is needed' : 'Remove bottom qubit (and its gates)'}
          disabled={atMin}
          onClick={removeQubit}
        >
          <span className="codicon codicon-remove" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Clear"
          title="Clear all gates"
          disabled={circuit.operations.length === 0}
          onClick={() => {
            clear()
            selectOp(null)
          }}
        >
          <span className="codicon codicon-clear-all" aria-hidden="true" />
        </button>
      </div>

      <div className="canvas__scroll">
        <CircuitGrid
          circuit={circuit}
          columns={visibleColumnCount(columnCount(circuit))}
          selectedOpId={selectedOpId}
          selectedQubit={selectedQubit}
          draggingOpId={draggingOpId}
          dropPreview={dropPreview}
          onSelectOp={selectOp}
          onSelectQubit={(q) => selectQubit(selectedQubit === q ? null : q)}
        />
        {circuit.operations.length === 0 && (
          <p className="canvas__empty" data-testid="canvas-empty">
            <MathText
              text={
                hasNonDefaultInitialStates(circuit)
                  ? 'No gates yet: each qubit stays in its start state.'
                  : 'No gates yet: every qubit is in |0⟩.'
              }
            />{' '}
            Drag a gate from the palette onto a wire, click a gate in the palette to append it, or
            pick a preset.
          </p>
        )}
      </div>

      <div className="canvas__footer">
        <div
          className={`canvas__hint${message ? ' canvas__hint--warn' : ''}`}
          role="status"
          aria-live="polite"
        >
          {message ??
            (selectedOp
              ? null
              : 'Drag a gate onto a wire. Click a gate to edit it; arrow keys move it, Delete removes it.')}
        </div>
        {selectedOp && <GateInspector key={selectedOp.id} op={selectedOp} numQubits={n} />}
      </div>
    </section>
  )
}
