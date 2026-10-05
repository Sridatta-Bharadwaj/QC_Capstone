// Presentational grid of Bloch cards, one per qubit. Wraps to the panel width.
import type { QubitAnalysis } from '../../engine/types'
import { BlochCard } from './BlochCard'
import './Bloch.css'

export function BlochGrid({ qubits }: { qubits: QubitAnalysis[] }) {
  return (
    <div className="bloch-grid">
      {qubits.map((q) => (
        <BlochCard key={q.qubit} data={q} />
      ))}
    </div>
  )
}
