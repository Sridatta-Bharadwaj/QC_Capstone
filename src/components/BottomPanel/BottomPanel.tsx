// Bottom panel (like VS Code's terminal area): visualizations and problems.
import { Suspense, lazy } from 'react'
import { useProblemsStore } from '../../model/store'
import { useUiStore, type BottomTab } from '../../model/uiStore'
import { TabPanel, Tabs, type TabItem } from '../common/Tabs'
import { MatrixSkeleton } from '../Teaching/MatrixSkeleton'
import { BlochPanel } from './BlochPanel'
import { ProblemsPanel } from './ProblemsPanel'

// The teaching tabs are lazy-loaded (their own chunk); a grid-of-cells skeleton shows while
// the chunk downloads (PLAN.md → Skeleton loaders).
const DensityMatricesPanel = lazy(() =>
  import('./DensityMatricesPanel').then((m) => ({ default: m.DensityMatricesPanel })),
)
const TraceStepsPanel = lazy(() =>
  import('./TraceStepsPanel').then((m) => ({ default: m.TraceStepsPanel })),
)

export function BottomPanel() {
  const tab = useUiStore((s) => s.bottomTab)
  const setTab = useUiStore((s) => s.setBottomTab)
  const problemCount = useProblemsStore((s) => s.problems.length)

  const tabs: TabItem<BottomTab>[] = [
    { id: 'bloch', label: 'Bloch Spheres' },
    { id: 'density', label: 'Density Matrices' },
    { id: 'trace', label: 'Partial Trace Steps' },
    { id: 'problems', label: 'Problems', badge: problemCount > 0 ? problemCount : undefined },
  ]

  return (
    <>
      <Tabs tabs={tabs} active={tab} onChange={setTab} label="Output" />
      <TabPanel id={tab}>
        {tab === 'bloch' && <BlochPanel />}
        {tab === 'density' && (
          <Suspense fallback={<MatrixSkeleton label="density matrices" />}>
            <DensityMatricesPanel />
          </Suspense>
        )}
        {tab === 'trace' && (
          <Suspense fallback={<MatrixSkeleton label="partial trace steps" />}>
            <TraceStepsPanel />
          </Suspense>
        )}
        {tab === 'problems' && <ProblemsPanel />}
      </TabPanel>
    </>
  )
}
