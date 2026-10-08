// One Bloch sphere per qubit, from the latest engine results.
//
// Skeletons here are genuine loading states, never fake delays (PLAN.md → Skeleton loaders):
//  - no results yet (worker still starting), or results that belong to a different qubit
//    count (right after Add / Remove qubit, before the worker has replied): skeleton cards.
//  - a worker request outstanding for > 150 ms (`computing`, the delay lives in the bridge):
//    the cards stay mounted but hidden under a skeleton overlay, so no stale vectors are
//    shown and the WebGL canvases are not torn down and rebuilt for every slow update.
// An empty circuit is still meaningful (every qubit is |0⟩), so it shows real spheres.
//
// Card and sphere sizes follow the panel size (layout.ts), so on a small screen every card
// still fits the panel without scrolling; skeleton cards use the same sizes.
import { useRef } from 'react'
import { BlochGrid } from '../Bloch/BlochGrid'
import { cardWidthStyle, computeBlochLayout, type BlochLayout } from '../Bloch/layout'
import { useElementSize } from '../Bloch/useElementSize'
import { useCircuitStore, useResultsStore } from '../../model/store'
import { Skeleton, SkeletonGroup } from '../common/Skeleton'
import '../Bloch/Bloch.css'

/** Same footprint as a real card: the bars sit where the numbers go (below or beside). */
function BlochCardSkeleton({ layout }: { layout: BlochLayout }) {
  return (
    <div className={`bloch-card bloch-card--skeleton bloch-card--skeleton-${layout.stats}`}>
      <Skeleton width={40} height={10} style={{ alignSelf: 'flex-start' }} />
      <div className="skeleton-body">
        <Skeleton circle width={layout.sphere - 16} />
        <div className="skeleton-bars">
          <Skeleton width="90%" height={10} />
          <Skeleton width="50%" height={10} />
          <Skeleton width="60%" height={10} />
        </div>
      </div>
    </div>
  )
}

function BlochSkeletonGrid({ numQubits, layout }: { numQubits: number; layout: BlochLayout }) {
  return (
    <SkeletonGroup label="Bloch spheres">
      <div className="bloch-grid" style={cardWidthStyle(layout)}>
        {Array.from({ length: numQubits }, (_, i) => (
          <BlochCardSkeleton key={i} layout={layout} />
        ))}
      </div>
    </SkeletonGroup>
  )
}

export function BlochPanel() {
  const analysis = useResultsStore((s) => s.analysis)
  const computing = useResultsStore((s) => s.computing)
  const numQubits = useCircuitStore((s) => s.circuit.numQubits)
  const panelRef = useRef<HTMLDivElement>(null)
  const { width, height } = useElementSize(panelRef)
  const layout = computeBlochLayout(numQubits, width, height)

  // Results can lag one worker reply behind the circuit; never draw the wrong qubit count.
  const ready = analysis !== null && analysis.numQubits === numQubits

  return (
    <div className="bloch-panel" ref={panelRef}>
      {ready ? (
        <>
          <div className={computing ? 'bloch-panel__stale' : undefined} aria-hidden={computing}>
            <BlochGrid qubits={analysis.qubits} layout={layout} />
          </div>
          {computing && (
            <div className="bloch-panel__overlay">
              <BlochSkeletonGrid numQubits={numQubits} layout={layout} />
            </div>
          )}
        </>
      ) : (
        <BlochSkeletonGrid numQubits={numQubits} layout={layout} />
      )}
    </div>
  )
}
