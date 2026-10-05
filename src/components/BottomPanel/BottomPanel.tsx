// Bottom panel (like VS Code's terminal area): visualizations and problems.
import { useProblemsStore } from '../../model/store'
import { useUiStore, type BottomTab } from '../../model/uiStore'
import { TabPanel, Tabs, type TabItem } from '../common/Tabs'
import { BlochPanel } from './BlochPanel'
import { DensityMatricesPanel } from './DensityMatricesPanel'
import { ProblemsPanel } from './ProblemsPanel'
import { TraceStepsPanel } from './TraceStepsPanel'

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
        {tab === 'density' && <DensityMatricesPanel />}
        {tab === 'trace' && <TraceStepsPanel />}
        {tab === 'problems' && <ProblemsPanel />}
      </TabPanel>
    </>
  )
}
