// Drag-and-drop context shared by the gate palette (sidebar) and the circuit canvas.
// It must wrap both, so it sits above the app layout (see App.tsx).
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useState, type ReactNode } from 'react'
import { useCircuitStore } from '../../model/store'
import { GATES, type GateType } from '../../model/types'
import { dropOnCell } from './actions'
import { readDragSource, readDropCell } from './dnd'
import { GateGlyph } from './GateGlyph'
import { useCanvasStore } from './canvasStore'

export function CircuitDndProvider({ children }: { children: ReactNode }) {
  // A 4px threshold keeps plain clicks (select a gate, append from the palette) working.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [dragGate, setDragGate] = useState<GateType | null>(null)

  function handleDragStart(event: DragStartEvent) {
    const source = readDragSource(event.active.data.current)
    if (!source) return
    if (source.kind === 'palette') {
      setDragGate(source.gate)
    } else {
      const op = useCircuitStore.getState().circuit.operations.find((o) => o.id === source.id)
      setDragGate(op?.gate ?? null)
      useCanvasStore.getState().selectOp(source.id)
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragGate(null)
    const source = readDragSource(event.active.data.current)
    const cell = readDropCell(event.over?.data.current)
    if (source && cell) dropOnCell(source, cell)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      // Only scroll the canvas when the pointer is really close to its edge.
      autoScroll={{ threshold: { x: 0.08, y: 0.08 } }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragGate(null)}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {dragGate ? (
          <div className="gate-drag-overlay">
            <GateGlyph kind="box" label={GATES[dragGate].label} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
