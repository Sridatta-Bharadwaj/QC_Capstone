// "Grid of grey cells" placeholder for the teaching tabs (PLAN.md → Skeleton loaders).
// Shown only while something really loads: the lazy tab chunk, or worker results that are
// not available yet / have been outstanding > 150 ms (that delay lives in the worker bridge).
import { Skeleton, SkeletonGroup } from '../common/Skeleton'

export function MatrixSkeleton({ label, size = 4 }: { label: string; size?: number }) {
  return (
    <SkeletonGroup label={label}>
      <div className="matrix-skeleton" data-testid="matrix-skeleton">
        <Skeleton width={180} height={12} />
        <div
          className="matrix-skeleton__grid"
          style={{ gridTemplateColumns: `repeat(${size}, 56px)` }}
        >
          {Array.from({ length: size * size }, (_, i) => (
            <Skeleton key={i} height={18} />
          ))}
        </div>
      </div>
    </SkeletonGroup>
  )
}
