// One Bloch sphere per qubit, from the latest engine results.
//
// Skeletons here are genuine loading states, never fake delays (PLAN.md → Skeleton loaders):
//  - no results yet (worker still starting), or results that belong to a different qubit
//    count (right after Add / Remove qubit, before the worker has replied): skeleton cards.
//  - a worker request outstanding for > 150 ms (`computing`, the delay lives in the bridge):
//    the cards stay mounted but hidden under a skeleton overlay, so no stale vectors are
//    shown and the WebGL canvases are not torn down and rebuilt for every slow update.
// An empty circuit is still meaningful (every qubit is |0⟩), so it shows real spheres.
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

function BlochSkeletonGrid({ numQubits }: { numQubits: number }) {
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

export function BlochPanel() {
  const analysis = useResultsStore((s) => s.analysis)
  const computing = useResultsStore((s) => s.computing)
  const numQubits = useCircuitStore((s) => s.circuit.numQubits)

  // Results can lag one worker reply behind the circuit; never draw the wrong qubit count.
  if (!analysis || analysis.numQubits !== numQubits) {
    return <BlochSkeletonGrid numQubits={numQubits} />
  }

  return (
    <div className="bloch-panel">
      <div className={computing ? 'bloch-panel__stale' : undefined} aria-hidden={computing}>
        <BlochGrid qubits={analysis.qubits} />
      </div>
      {computing && (
        <div className="bloch-panel__overlay">
          <BlochSkeletonGrid numQubits={numQubits} />
        </div>
      )}
    </div>
  )
}
