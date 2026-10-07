// Presentational grid of Bloch cards, one per qubit. Wraps to the panel width.
import type { QubitAnalysis } from '../../engine/types'
import { BlochCard } from './BlochCard'
import { cardWidthStyle, computeBlochLayout, type BlochLayout } from './layout'
import './Bloch.css'

interface BlochGridProps {
  qubits: QubitAnalysis[]
  /** Card and sphere size, normally computed from the panel size by BlochPanel. */
  layout?: BlochLayout
}

export function BlochGrid({ qubits, layout }: BlochGridProps) {
  const size = layout ?? computeBlochLayout(qubits.length, 0, 0)
  return (
    <div className="bloch-grid" style={cardWidthStyle(size)}>
      {qubits.map((q) => (
        <BlochCard key={q.qubit} data={q} sphereSize={size.sphere} />
      ))}
    </div>
  )
}
