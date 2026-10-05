// Code panel: the circuit as OpenQASM 2.0 and as Qiskit Python.
// M6: both tabs are generated from the circuit model and read-only.
// M7 will make the QASM tab editable (two-way sync, see PLAN.md → Sync rules).
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { toQasm, toQiskit } from '../../codegen'
import { useCircuitStore } from '../../model/store'
import { useUiStore, type CodeTab } from '../../model/uiStore'
import { SkeletonGroup, SkeletonLines } from '../common/Skeleton'
import { TabPanel, Tabs } from '../common/Tabs'
import './CodePanel.css'

// Monaco is large, so the editor is its own chunk, loaded after the workspace renders.
const CodeEditor = lazy(() => import('./CodeEditor'))

const TABS: { id: CodeTab; label: string }[] = [
  { id: 'qasm', label: 'QASM' },
  { id: 'qiskit', label: 'Qiskit' },
]

const EDITOR_PROPS: Record<CodeTab, { language: string; path: string; ariaLabel: string }> = {
  qasm: { language: 'qasm', path: 'circuit.qasm', ariaLabel: 'OpenQASM 2.0 code' },
  qiskit: { language: 'python', path: 'circuit.py', ariaLabel: 'Qiskit Python code (read-only)' },
}

/** Grey lines shaped like a short program while Monaco loads. */
function EditorSkeleton() {
  return (
    <div className="code-panel__skeleton">
      <SkeletonGroup label="code editor">
        <SkeletonLines
          lines={9}
          widths={['34%', '46%', '0', '28%', '0', '22%', '40%', '36%', '30%']}
        />
      </SkeletonGroup>
    </div>
  )
}

/** Copies the active tab's code; the icon briefly turns into a check mark. */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard blocked (permissions / insecure context). Ctrl+C in the editor still works.
    }
  }

  const label = copied ? 'Copied' : 'Copy code'
  return (
    <button type="button" className="icon-button" onClick={copy} title={label} aria-label={label}>
      <span className={`codicon codicon-${copied ? 'check' : 'copy'}`} aria-hidden="true" />
    </button>
  )
}

export function CodePanel() {
  const tab = useUiStore((s) => s.codeTab)
  const setTab = useUiStore((s) => s.setCodeTab)
  const circuit = useCircuitStore((s) => s.circuit)

  // Regenerated on every circuit change. (M7: skip regenerating QASM for editor-made changes.)
  const qasm = useMemo(() => toQasm(circuit), [circuit])
  const qiskit = useMemo(() => toQiskit(circuit), [circuit])
  const code = tab === 'qasm' ? qasm : qiskit

  return (
    <div className="code-panel">
      <Tabs
        tabs={TABS}
        active={tab}
        onChange={setTab}
        label="Code"
        actions={<CopyButton text={code} />}
      />
      <TabPanel id={tab}>
        <Suspense fallback={<EditorSkeleton />}>
          <CodeEditor value={code} readOnly {...EDITOR_PROPS[tab]} />
        </Suspense>
      </TabPanel>
    </div>
  )
}
