// The circuit diagram: wire labels, wires, droppable cells and the placed gates.
// Positions are computed from fixed cell sizes; all colours come from CSS (Canvas.css).
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { useEffect, useRef, type ReactNode } from 'react'
import { formatAngle, formatAngleShort } from '../../model/angle'
import { occupiedSpan } from '../../model/circuit'
import { GATES, type Circuit, type Operation } from '../../model/types'
import { cellId, partId, type DragData, type DropData } from './dnd'
import { GateGlyph } from './GateGlyph'
import { gateParts, qubitRoles, type DropCell, type DropPlan } from './placement'

export const ROW_H = 44
export const COL_W = 52
export const RULER_H = 20
export const LABEL_W = 72

interface CircuitGridProps {
  circuit: Circuit
  columns: number
  selectedOpId: string | null
  selectedQubit: number | null
  /** Id of the gate currently being dragged (drawn faded at its old place). */
  draggingOpId: string | null
  /**
   * Step-through debugger (V2-5): the step on screen, or null while Live. At step k the
   * column just applied (k − 1) is highlighted and later columns are dimmed.
   */
  activeStep?: number | null
  /** Where the dragged gate would land, for the drop highlight. */
  dropPreview: { plan: DropPlan; cell: DropCell } | null
  onSelectOp: (id: string | null) => void
  onSelectQubit: (qubit: number) => void
}

export function CircuitGrid(props: CircuitGridProps) {
  const { circuit, columns, dropPreview } = props
  const n = circuit.numQubits
  const qubits = Array.from({ length: n }, (_, q) => q)
  const columnIndices = Array.from({ length: columns }, (_, c) => c)
  const activeStep = props.activeStep ?? null
  // Column applied last at this step: step k = after columns 0..k−1. −1 at the start state.
  const appliedColumn = activeStep === null ? null : activeStep - 1

  return (
    <div
      className={`circuit${appliedColumn !== null ? ' circuit--stepping' : ''}`}
      style={{ width: LABEL_W + columns * COL_W, height: RULER_H + n * ROW_H }}
    >
      <div className="circuit__labels" style={{ width: LABEL_W, paddingTop: RULER_H }}>
        {qubits.map((q) => (
          <button
            key={q}
            type="button"
            className="circuit__wire-label"
            style={{ height: ROW_H }}
            aria-pressed={props.selectedQubit === q}
            aria-label={`Select qubit q${q}`}
            title={`Select q${q}`}
            onClick={() => props.onSelectQubit(q)}
          >
            <span className="circuit__wire-name">q{q}</span>
            <span className="circuit__wire-init">|0⟩</span>
          </button>
        ))}
      </div>

      <div className="circuit__body" style={{ width: columns * COL_W }}>
        <div className="circuit__ruler" style={{ height: RULER_H }} aria-hidden="true">
          {columnIndices.map((c) => (
            <span
              key={c}
              style={{ width: COL_W }}
              className={c === appliedColumn ? 'circuit__ruler-current' : undefined}
            >
              {c}
            </span>
          ))}
        </div>

        {appliedColumn !== null && (
          <StepMarker appliedColumn={appliedColumn} height={RULER_H + n * ROW_H} />
        )}

        {qubits.map((q) => (
          <div
            key={q}
            className="circuit__wire"
            style={{ top: RULER_H + q * ROW_H + ROW_H / 2 }}
            aria-hidden="true"
          />
        ))}

        {qubits.map((q) =>
          columnIndices.map((c) => (
            <Cell key={cellId(q, c)} qubit={q} column={c} onClick={() => props.onSelectOp(null)} />
          )),
        )}

        {dropPreview && <DropHighlight {...dropPreview} />}

        {circuit.operations.map((op) => (
          <GateView
            key={op.id}
            op={op}
            selected={op.id === props.selectedOpId}
            dragging={op.id === props.draggingOpId}
            stepState={
              appliedColumn === null
                ? null
                : op.column === appliedColumn
                  ? 'current'
                  : op.column > appliedColumn
                    ? 'future'
                    : 'past'
            }
            onSelect={() => props.onSelectOp(op.id)}
          />
        ))}
      </div>
    </div>
  )
}

function Cell({ qubit, column, onClick }: DropCell & { onClick: () => void }) {
  const data: DropData = { cell: { qubit, column } }
  const { setNodeRef } = useDroppable({ id: cellId(qubit, column), data })
  return (
    <div
      ref={setNodeRef}
      className="circuit__cell"
      style={{ left: column * COL_W, top: RULER_H + qubit * ROW_H, width: COL_W, height: ROW_H }}
      onClick={onClick}
    />
  )
}

/** Outline over the cells the dropped gate would occupy (accent = OK, red dashed = refused). */
function DropHighlight({ plan, cell }: { plan: DropPlan; cell: DropCell }) {
  const span = plan.qubits ? occupiedSpan(plan.qubits) : { min: cell.qubit, max: cell.qubit }
  const top = Math.max(0, span.min)
  const bottom = span.max
  return (
    <div
      className={`circuit__drop ${plan.ok ? 'circuit__drop--ok' : 'circuit__drop--invalid'}`}
      style={{
        left: plan.column * COL_W,
        top: RULER_H + top * ROW_H,
        width: COL_W,
        height: (bottom - top + 1) * ROW_H,
      }}
      aria-hidden="true"
    />
  )
}

/**
 * Debugger playhead: a tinted band over the column just applied and a line after it, so
 * everything left of the line has happened. At step 0 only the line is drawn, at the left edge.
 */
function StepMarker({ appliedColumn, height }: { appliedColumn: number; height: number }) {
  return (
    <>
      {appliedColumn >= 0 && (
        <div
          className="circuit__step-band"
          data-testid="step-band"
          style={{
            left: appliedColumn * COL_W,
            top: RULER_H,
            width: COL_W,
            height: height - RULER_H,
          }}
          aria-hidden="true"
        />
      )}
      <div
        className="circuit__step-line"
        data-testid="step-line"
        style={{ left: (appliedColumn + 1) * COL_W, height }}
        aria-hidden="true"
      />
    </>
  )
}

interface GateViewProps {
  op: Operation
  selected: boolean
  dragging: boolean
  /** Debugger: applied before this step, the one just applied, or not yet applied. */
  stepState: 'past' | 'current' | 'future' | null
  onSelect: () => void
}

function GateView({ op, selected, dragging, stepState, onSelect }: GateViewProps) {
  const info = GATES[op.gate]
  const { min, max } = occupiedSpan(op.qubits)
  const parts = gateParts(op.gate)
  const roles = qubitRoles(op.gate)
  // Full angle (aria-label, tooltip) and a short form that fits inside the gate box.
  const angle = info.parametric && op.angle !== undefined ? formatAngle(op.angle, 'π') : undefined
  const shortAngle =
    info.parametric && op.angle !== undefined ? formatAngleShort(op.angle) : undefined

  const className = [
    'gate',
    selected ? 'gate--selected' : '',
    dragging ? 'gate--dragging' : '',
    stepState === 'current' ? 'gate--step-current' : '',
    stepState === 'future' ? 'gate--step-future' : '',
    op.qubits.length > 1 ? 'gate--multi' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // A gate that becomes selected (placed by a palette click, dropped, or moved with the arrow
  // keys) may sit outside the scrolled canvas: bring it into view. 'nearest' does nothing when
  // it is already visible, so ordinary clicks never make the canvas jump.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    // jsdom (tests) has no scrollIntoView.
    if (selected && el && typeof el.scrollIntoView === 'function')
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected, op.column, min, max])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        left: op.column * COL_W,
        top: RULER_H + min * ROW_H,
        width: COL_W,
        height: (max - min + 1) * ROW_H,
      }}
    >
      {op.qubits.length > 1 && (
        <div className="gate__line" style={{ top: ROW_H / 2, height: (max - min) * ROW_H }} />
      )}
      {op.qubits.map((q, i) => (
        <GatePart
          key={i}
          opId={op.id}
          qubit={q}
          top={(q - min) * ROW_H}
          focusable={i === 0}
          selected={selected}
          ariaLabel={
            op.qubits.length > 1
              ? `${info.label} ${roles[i].toLowerCase()} on q${q}, column ${op.column}`
              : `${info.label}${angle ? `(${angle})` : ''} on q${q}, column ${op.column}`
          }
          onSelect={onSelect}
        >
          <GateGlyph kind={parts[i]} label={info.label} angle={shortAngle} angleTitle={angle} />
        </GatePart>
      ))}
    </div>
  )
}

interface GatePartProps {
  opId: string
  qubit: number
  top: number
  focusable: boolean
  selected: boolean
  ariaLabel: string
  onSelect: () => void
  children: ReactNode
}

/** One wire of a gate. Each part is a drag handle; the grabbed wire anchors the move. */
function GatePart({
  opId,
  qubit,
  top,
  focusable,
  selected,
  ariaLabel,
  onSelect,
  children,
}: GatePartProps) {
  const data: DragData = { source: { kind: 'operation', id: opId, grabbedQubit: qubit } }
  const { setNodeRef, listeners } = useDraggable({ id: partId(opId, qubit), data })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      className="gate__part"
      style={{ top, height: ROW_H }}
      role="button"
      tabIndex={focusable ? 0 : -1}
      aria-label={ariaLabel}
      aria-pressed={selected}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
    >
      {children}
    </div>
  )
}
