// @vitest-environment jsdom
// Two-tab sync (PLAN.md → V2-1): QASM ↔ circuit ↔ Qiskit, with Monaco replaced by a <textarea>.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProblemsPanel } from '../../src/components/BottomPanel/ProblemsPanel'
import type { CodeEditorProps } from '../../src/components/CodePanel/CodeEditor'
import { CodePanel } from '../../src/components/CodePanel/CodePanel'
import {
  PARSE_DEBOUNCE_MS,
  codeTextStores,
  editCode,
  hasPendingParse,
} from '../../src/components/CodePanel/codeSync'
import { useRevealStore } from '../../src/components/CodePanel/revealStore'
import { StatusBar } from '../../src/components/StatusBar/StatusBar'
import { toQasm, toQiskit } from '../../src/codegen'
import { defaultInitialStates } from '../../src/model/circuit'
import { useCircuitStore, useProblemsStore, useResultsStore } from '../../src/model/store'
import type { ChangeSource } from '../../src/model/types'
import { useUiStore } from '../../src/model/uiStore'

vi.mock('../../src/components/CodePanel/CodeEditor', () => ({
  default: (props: CodeEditorProps) => (
    <textarea
      data-testid="editor"
      data-language={props.language}
      data-path={props.path}
      data-readonly={String(Boolean(props.readOnly))}
      data-markers={props.markers?.length ?? 0}
      data-reveal={props.reveal ? `${props.reveal.line}:${props.reveal.column}` : ''}
      value={props.value}
      readOnly={props.readOnly}
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  ),
}))

const QISKIT = [
  '# my Bell state',
  'from qiskit import QuantumCircuit',
  '',
  'qc = QuantumCircuit(2)',
  'qc.h(0)      # superposition',
  'qc.cx(0, 1)',
  'print(qc)',
].join('\n')

const QISKIT_INVALID = 'qc = QuantumCircuit(2)\nqc.hh(0)\nqc.cx(0, 5)\n'

const QASM_VALID = 'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[3];\nx q[2];\n'
const QASM_INVALID = 'OPENQASM 2.0;\nqreg q[2];\nfoo q[0];\n'

const editor = () => screen.getByTestId('editor') as HTMLTextAreaElement
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } })
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const openTab = (label: 'QASM' | 'Qiskit') =>
  fireEvent.click(screen.getByRole('tab', { name: label }))
const qasmText = () => codeTextStores.qasm.getState().text
const qiskitText = () => codeTextStores.qiskit.getState().text
const gates = () =>
  useCircuitStore.getState().circuit.operations.map((o) => [o.gate, o.column, o.qubits])

/** Records the source of every circuit store change while the test runs. */
let changes: ChangeSource[] = []
let unsubscribe = () => {}

beforeAll(async () => {
  // Load the lazy editor once with real timers; later renders are synchronous.
  render(<CodePanel />)
  await screen.findByTestId('editor')
  cleanup()
})

beforeEach(() => {
  act(() => {
    useUiStore.setState({ codeTab: 'qiskit', bottomTab: 'bloch' })
    useRevealStore.getState().clear()
    useResultsStore.getState().setError(null)
    useCircuitStore
      .getState()
      .setCircuit(
        { numQubits: 2, initialStates: defaultInitialStates(2), operations: [] },
        'canvas',
      )
    codeTextStores.qasm.setState({ replacedBy: null })
    codeTextStores.qiskit.setState({ replacedBy: null })
  })
  changes = []
  unsubscribe = useCircuitStore.subscribe((s, prev) => {
    if (s.revision !== prev.revision) changes.push(s.lastSource)
  })
  vi.useFakeTimers()
})

afterEach(() => {
  unsubscribe()
  vi.useRealTimers()
  cleanup()
})

describe('Qiskit tab → circuit → QASM tab', () => {
  it('the Qiskit tab is editable Python', () => {
    render(<CodePanel />)
    expect(editor().dataset.language).toBe('python')
    expect(editor().dataset.readonly).toBe('false')
    expect(editor().dataset.path).toBe('circuit.py')
  })

  it('parses after the debounce, tags the change "qiskit", keeps the typed text, regenerates QASM', () => {
    render(<CodePanel />)
    type(QISKIT)
    advance(PARSE_DEBOUNCE_MS - 1)
    expect(changes).toEqual([])
    expect(hasPendingParse('qiskit')).toBe(true)

    advance(1)
    expect(changes).toEqual(['qiskit'])
    expect(gates()).toEqual([
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ])
    // The Qiskit text is not regenerated: comments, spacing and print(qc) survive.
    expect(editor().value).toBe(QISKIT)
    expect(qiskitText()).toBe(QISKIT)
    // The QASM tab follows.
    expect(qasmText()).toBe(toQasm(useCircuitStore.getState().circuit))
    expect(qasmText()).toContain('cx q[0],q[1];')
    openTab('QASM')
    expect(editor().value).toContain('h q[0];\ncx q[0],q[1];')
    expect(useProblemsStore.getState().problems).toEqual([])
  })

  it('one setCircuit per committed parse; none for an unchanged circuit', () => {
    render(<CodePanel />)
    type('qc = QuantumCircuit(2)\nqc.h(0)\n')
    advance(100)
    type('qc = QuantumCircuit(2)\nqc.h(0)\nqc.x(1)\n')
    advance(100)
    type(QISKIT)
    advance(PARSE_DEBOUNCE_MS)
    expect(changes).toEqual(['qiskit'])

    type(QISKIT + '\n# only a comment\n')
    advance(PARSE_DEBOUNCE_MS)
    expect(changes).toEqual(['qiskit'])
  })

  it('invalid code keeps the last valid circuit and shows Qiskit problems + markers', () => {
    render(<CodePanel />)
    type(QISKIT)
    advance(PARSE_DEBOUNCE_MS)
    const before = useCircuitStore.getState().circuit
    const qasmBefore = qasmText()

    type(QISKIT_INVALID)
    advance(PARSE_DEBOUNCE_MS)
    expect(useCircuitStore.getState().circuit).toBe(before)
    expect(qasmText()).toBe(qasmBefore)
    const { byTab, problems } = useProblemsStore.getState()
    expect(byTab.qasm).toEqual([])
    expect(problems.map((p) => [p.tab, p.line])).toEqual([
      ['qiskit', 2],
      ['qiskit', 3],
    ])
    expect(editor().dataset.markers).toBe('2')

    // Markers belong to the Qiskit tab only.
    openTab('QASM')
    expect(editor().dataset.markers).toBe('0')
    openTab('Qiskit')
    expect(editor().value).toBe(QISKIT_INVALID)

    type(QISKIT)
    advance(PARSE_DEBOUNCE_MS)
    expect(useProblemsStore.getState().problems).toEqual([])
  })
})

describe('QASM tab → circuit → Qiskit tab', () => {
  it('regenerates the Qiskit text, never the QASM text', () => {
    render(<CodePanel />)
    openTab('QASM')
    const typed = '// keep me\n' + QASM_VALID
    type(typed)
    advance(PARSE_DEBOUNCE_MS)
    expect(changes).toEqual(['qasm'])
    expect(editor().value).toBe(typed)
    expect(qiskitText()).toBe(toQiskit(useCircuitStore.getState().circuit))
    expect(qiskitText()).toContain('qc = QuantumCircuit(3)\nqc.x(2)\n')
    openTab('Qiskit')
    expect(editor().value).toContain('qc.x(2)')
  })
})

describe('other sources regenerate both tabs', () => {
  it.each<ChangeSource>(['canvas', 'preset', 'file', 'url', 'history', 'restore'])(
    '%s',
    (source) => {
      act(() => editCode('qiskit', QISKIT))
      act(() => editCode('qasm', QASM_VALID))
      act(() =>
        useCircuitStore
          .getState()
          .setCircuit(
            { numQubits: 1, initialStates: defaultInitialStates(1), operations: [] },
            source,
          ),
      )
      expect(hasPendingParse()).toBe(false)
      const circuit = useCircuitStore.getState().circuit
      expect(qasmText()).toBe(toQasm(circuit))
      expect(qiskitText()).toBe(toQiskit(circuit))
    },
  )

  it('a canvas edit after typing replaces both texts', () => {
    render(<CodePanel />)
    type(QISKIT)
    advance(PARSE_DEBOUNCE_MS)
    act(() => {
      useCircuitStore.getState().addOperation({ gate: 'Z', column: 2, qubits: [1] })
    })
    expect(editor().value).toContain('qc.z(1)')
    expect(editor().value).not.toContain('my Bell state')
    expect(qasmText()).toContain('z q[1];')
  })

  it('each tab keeps its own text across tab switches', () => {
    render(<CodePanel />)
    type('qc = QuantumCircuit(2)\nqc.hh(0)\n') // invalid: not applied
    advance(PARSE_DEBOUNCE_MS)
    openTab('QASM')
    expect(editor().value).toBe(qasmText())
    openTab('Qiskit')
    expect(editor().value).toBe('qc = QuantumCircuit(2)\nqc.hh(0)\n')
  })
})

describe('notices, Problems tab and status bar', () => {
  const notice = () => screen.queryAllByTestId('replaced-notice')

  it('a QASM edit that replaces Qiskit code with errors shows a Qiskit notice', () => {
    render(
      <>
        <CodePanel />
        <ProblemsPanel />
      </>,
    )
    type(QISKIT_INVALID)
    advance(PARSE_DEBOUNCE_MS)
    expect(notice()).toHaveLength(0)

    act(() => editCode('qasm', QASM_VALID))
    advance(PARSE_DEBOUNCE_MS)
    expect(qiskitText()).toContain('qc.x(2)')
    expect(notice()).toHaveLength(2) // code panel (Qiskit tab open) + Problems tab
    expect(notice()[0]).toHaveTextContent(
      'Qiskit code with errors was replaced by an edit in the QASM tab. Press Ctrl+Z in the Qiskit editor to get it back.',
    )
    // The QASM tab shows no notice of its own.
    openTab('QASM')
    expect(notice()).toHaveLength(1)
    openTab('Qiskit')

    type(editor().value + '# edit\n')
    expect(notice()).toHaveLength(0)
  })

  it('a canvas edit over pending invalid Qiskit text shows a notice', () => {
    render(<CodePanel />)
    type(QISKIT_INVALID)
    advance(100)
    act(() => {
      useCircuitStore.getState().addOperation({ gate: 'X', column: 0, qubits: [0] })
    })
    expect(notice()).toHaveLength(1)
    expect(notice()[0]).toHaveTextContent('Qiskit code with errors was replaced by a canvas edit.')
  })

  it('Problems rows show the source tab; clicking opens that tab at the position', () => {
    act(() => useUiStore.setState({ codeTab: 'qasm' }))
    render(
      <>
        <CodePanel />
        <ProblemsPanel />
      </>,
    )
    act(() => editCode('qiskit', QISKIT_INVALID))
    advance(PARSE_DEBOUNCE_MS)
    expect(editor().dataset.language).toBe('qasm')

    const rows = screen.getAllByRole('button', { name: /circuit\.py/ })
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Qiskit')
    expect(rows[0]).toHaveTextContent("Unknown method 'qc.hh'. Did you mean 'qc.h'?")
    expect(rows[0]).toHaveTextContent('[Ln 2, Col 1]')
    expect(rows[1]).toHaveTextContent('[Ln 3, Col 10]')

    fireEvent.click(rows[1])
    expect(useUiStore.getState().codeTab).toBe('qiskit')
    expect(editor().dataset.language).toBe('python')
    expect(editor().dataset.reveal).toBe('3:10')
  })

  it('QASM rows come first and say QASM', () => {
    render(<ProblemsPanel />)
    act(() => editCode('qiskit', QISKIT_INVALID))
    act(() => editCode('qasm', QASM_INVALID))
    advance(PARSE_DEBOUNCE_MS)
    const rows = screen.getAllByRole('button', { name: /circuit\.(qasm|py)/ })
    expect(rows[0]).toHaveTextContent('QASM')
    expect(rows[0]).toHaveTextContent('circuit.qasm')
    expect(rows[rows.length - 1]).toHaveTextContent('circuit.py')
  })

  it('status bar names the tab(s) with errors', () => {
    render(<StatusBar />)
    const stale = () => screen.queryByTestId('status-stale')
    act(() => editCode('qiskit', QISKIT_INVALID))
    advance(PARSE_DEBOUNCE_MS)
    expect(stale()).toHaveTextContent('Qiskit has errors — showing last valid circuit')

    act(() => editCode('qasm', QASM_INVALID))
    advance(PARSE_DEBOUNCE_MS)
    expect(stale()).toHaveTextContent('QASM and Qiskit have errors — showing last valid circuit')

    act(() => editCode('qiskit', QISKIT))
    advance(PARSE_DEBOUNCE_MS)
    // The valid Qiskit edit was applied and regenerated the QASM tab, clearing its errors too.
    expect(stale()).not.toBeInTheDocument()
  })
})
