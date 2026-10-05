// Code panel: QASM (editable, M7) and Qiskit (generated, read-only) tabs. (M6 implements.)
import { useUiStore, type CodeTab } from '../../model/uiStore'
import { TabPanel, Tabs } from '../common/Tabs'

const TABS: { id: CodeTab; label: string }[] = [
  { id: 'qasm', label: 'QASM' },
  { id: 'qiskit', label: 'Qiskit' },
]

export function CodePanel() {
  const tab = useUiStore((s) => s.codeTab)
  const setTab = useUiStore((s) => s.setCodeTab)
  return (
    <>
      <Tabs tabs={TABS} active={tab} onChange={setTab} label="Code" />
      <TabPanel id={tab}>
        <div className="empty-state">{tab === 'qasm' ? 'OpenQASM 2.0' : 'Qiskit (Python)'}</div>
      </TabPanel>
    </>
  )
}
