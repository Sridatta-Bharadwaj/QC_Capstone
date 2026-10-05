// Left sidebar: gate palette (drag sources) and preset circuits.
import { useDraggable } from '@dnd-kit/core'
import { appendGate } from '../Canvas/actions'
import { useCanvasStore } from '../Canvas/canvasStore'
import { paletteId, type DragData } from '../Canvas/dnd'
import { PRESETS } from '../../model/presets'
import { useCircuitStore } from '../../model/store'
import { GATES, type GateType } from '../../model/types'
import './Sidebar.css'

const GROUPS: { title: string; gates: GateType[] }[] = [
  { title: 'Single-qubit', gates: ['I', 'H', 'X', 'Y', 'Z', 'S', 'Sdg', 'T', 'Tdg'] },
  { title: 'Rotations', gates: ['RX', 'RY', 'RZ'] },
  { title: 'Multi-qubit', gates: ['CX', 'CZ', 'SWAP', 'CCX'] },
]

export function Sidebar() {
  return (
    <div className="sidebar">
      <div className="panel-header">Gates</div>
      <div className="palette">
        {GROUPS.map((group) => (
          <div key={group.title} className="palette__group" role="group" aria-label={group.title}>
            <div className="palette__title">{group.title}</div>
            <div className="palette__grid">
              {group.gates.map((gate) => (
                <PaletteGate key={gate} gate={gate} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="panel-header sidebar__section">Presets</div>
      <Presets />
    </div>
  )
}

function PaletteGate({ gate }: { gate: GateType }) {
  const info = GATES[gate]
  const data: DragData = { source: { kind: 'palette', gate } }
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: paletteId(gate), data })
  return (
    <button
      ref={setNodeRef}
      {...listeners}
      type="button"
      className={`palette__gate${isDragging ? ' palette__gate--dragging' : ''}${
        info.label.length > 2 ? ' palette__gate--wide' : ''
      }`}
      title={`${info.description}. Drag onto a wire, or click to append.`}
      aria-label={`${info.label}: ${info.description}`}
      onClick={() => appendGate(gate)}
    >
      {info.label}
    </button>
  )
}

function Presets() {
  const loadPreset = useCircuitStore((s) => s.loadPreset)
  const selectOp = useCanvasStore((s) => s.selectOp)
  return (
    <ul className="presets">
      {PRESETS.map((preset) => (
        <li key={preset.id}>
          <button
            type="button"
            className="presets__item"
            onClick={() => {
              loadPreset(preset.id)
              selectOp(null)
            }}
          >
            <span className="presets__name">{preset.name}</span>
            <span className="presets__description">{preset.description}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
