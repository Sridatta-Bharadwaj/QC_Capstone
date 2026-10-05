// One Bloch sphere per qubit, from the latest engine results.
// Until the engine (worker, M5) has produced results, a skeleton per qubit is shown:
// that is a genuine loading state, not a fake delay.
import { BlochGrid } from '../Bloch/BlochGrid'
import { useCircuitStore, useResultsStore } from '../../model/store'
import { Skeleton, SkeletonGroup } from '../common/Skeleton'
import '../Bloch/Bloch.css'

function BlochCardSkeleton() {
  return (
    <div className="bloch-card bloch-card--skeleton">
      <Skeleton width={40} height={10} style={{ alignSelf: 'flex-start' }} />
      <Skeleton circle width={144} />
      <div className="skeleton-bars">
        <Skeleton width="90%" height={10} />
        <Skeleton width="50%" height={10} />
        <Skeleton width="60%" height={10} />
      </div>
    </div>
  )
}

export function BlochPanel() {
  const analysis = useResultsStore((s) => s.analysis)
  const numQubits = useCircuitStore((s) => s.circuit.numQubits)

  if (!analysis) {
    return (
      <SkeletonGroup label="Bloch spheres">
        <div className="bloch-grid">
          {Array.from({ length: numQubits }, (_, i) => (
            <BlochCardSkeleton key={i} />
          ))}
        </div>
      </SkeletonGroup>
    )
  }

  return <BlochGrid qubits={analysis.qubits} />
}
