// @vitest-environment jsdom
// Two-way QASM ↔ circuit sync (PLAN.md → Sync rules), with Monaco replaced by a <textarea>.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProblemsPanel } from '../../src/components/BottomPanel/ProblemsPanel'
import type { CodeEditorProps } from '../../src/components/CodePanel/CodeEditor'
import { CodePanel } from '../../src/components/CodePanel/CodePanel'
import {
  PARSE_DEBOUNCE_MS,
  hasPendingParse,
  useQasmText,
} from '../../src/components/CodePanel/qasmSync'
import { StatusBar } from '../../src/components/StatusBar/StatusBar'
import { useRevealStore } from '../../src/components/CodePanel/revealStore'
import { useCircuitStore, useProblemsStore, useResultsStore } from '../../src/model/store'
import { useUiStore } from '../../src/model/uiStore'
import { defaultInitialStates } from '../../src/model/circuit'

vi.mock('../../src/components/CodePanel/CodeEditor', () => ({
  default: (props: CodeEditorProps) => (
    <textarea
      data-testid="editor"
      data-language={props.language}
      data-readonly={String(Boolean(props.readOnly))}
      data-markers={props.markers?.length ?? 0}
      data-reveal={props.reveal ? `${props.reveal.line}:${props.reveal.column}` : ''}
      value={props.value}
      readOnly={props.readOnly}
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  ),
}))

const VALID = [
  '// my Bell state',
  'OPENQASM 2.0;',
  'include "qelib1.inc";',
  'qreg q[2];',
  'h q[0];   // superposition',
  'cx q[0],q[1];',
].join('\n')

const INVALID = 'OPENQASM 2.0;\nqreg q[2];\nhh q[0];\ncx q[0],q[5];\n'

const editor = () => screen.getByTestId('editor') as HTMLTextAreaElement
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } })
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const gates = () =>
  useCircuitStore.getState().circuit.operations.map((o) => [o.gate, o.column, o.qubits])

beforeAll(async () => {
  // Load the lazy editor once with real timers; later renders are synchronous.
  render(<CodePanel />)
  await screen.findByTestId('editor')
  cleanup()
})

beforeEach(() => {
  act(() => {
    useUiStore.setState({ codeTab: 'qasm' })
    useRevealStore.getState().clear()
    useResultsStore.getState().setError(null)
    useCircuitStore
      .getState()
      .setCircuit(
        { numQubits: 2, initialStates: defaultInitialStates(2), operations: [] },
        'canvas',
      )
  })
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('editor → circuit', () => {
  it('parses after the debounce, tags the change as editor, keeps the typed text', () => {
    render(<CodePanel />)
    const revision = useCircuitStore.getState().revision
    type(VALID)

    advance(PARSE_DEBOUNCE_MS - 1)
    expect(useCircuitStore.getState().revision).toBe(revision)
    expect(hasPendingParse()).toBe(true)

    advance(1)
    expect(useCircuitStore.getState().lastSource).toBe('qasm')
    expect(gates()).toEqual([
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ])
    // The text is not regenerated: comments and spacing survive.
    expect(editor().value).toBe(VALID)
    expect(useProblemsStore.getState().problems).toEqual([])
  })

  it('only the last edit within the debounce window is parsed', () => {
    render(<CodePanel />)
    const revision = useCircuitStore.getState().revision
    type(VALID)
    advance(200)
    type(VALID.replace('h q[0];', 'x q[1];'))
    advance(200)
    expect(useCircuitStore.getState().revision).toBe(revision)
    advance(100)
    expect(useCircuitStore.getState().revision).toBe(revision + 1)
    expect(gates()).toEqual([
      ['X', 0, [1]],
      ['CX', 1, [0, 1]],
    ])
  })

  it('does not touch the store when the parsed circuit is unchanged', () => {
    render(<CodePanel />)
    type(VALID)
    advance(PARSE_DEBOUNCE_MS)
    const revision = useCircuitStore.getState().revision
    type(VALID + '\n// just a comment\n')
    advance(PARSE_DEBOUNCE_MS)
    expect(useCircuitStore.getState().revision).toBe(revision)
  })

  it('invalid QASM keeps the last valid circuit and shows problems + markers', () => {
    render(<CodePanel />)
    type(VALID)
    advance(PARSE_DEBOUNCE_MS)
    const before = useCircuitStore.getState().circuit

    type(INVALID)
    advance(PARSE_DEBOUNCE_MS)
    expect(useCircuitStore.getState().circuit).toBe(before)
    const problems = useProblemsStore.getState().problems
    expect(problems.map((p) => p.line)).toEqual([3, 4])
    expect(editor().dataset.markers).toBe('2')
    expect(editor().value).toBe(INVALID)

    // Fixing the text clears the problems and applies the new circuit.
    type(VALID)
    advance(PARSE_DEBOUNCE_MS)
    expect(useProblemsStore.getState().problems).toEqual([])
    expect(editor().dataset.markers).toBe('0')
  })
})

describe('canvas / preset → editor', () => {
  it('regenerates the text and clears problems', () => {
    render(<CodePanel />)
    type(INVALID)
    advance(PARSE_DEBOUNCE_MS)
    expect(useProblemsStore.getState().problems.length).toBeGreaterThan(0)

    act(() => useCircuitStore.getState().loadPreset('ghz3'))
    expect(editor().value).toContain('qreg q[3];')
    expect(editor().value).toContain('cx q[1],q[2];')
    expect(useProblemsStore.getState().problems).toEqual([])

    act(() => {
      useCircuitStore.getState().addOperation({ gate: 'X', column: 3, qubits: [2] })
    })
    expect(editor().value).toContain('x q[2];')
  })

  it('a canvas change cancels a pending editor parse', () => {
    render(<CodePanel />)
    type(VALID)
    advance(100)
    act(() => {
      useCircuitStore.getState().addOperation({ gate: 'Z', column: 0, qubits: [1] })
    })
    expect(hasPendingParse()).toBe(false)
    advance(PARSE_DEBOUNCE_MS)
    expect(useCircuitStore.getState().lastSource).toBe('canvas')
    expect(gates()).toEqual([['Z', 0, [1]]])
    expect(editor().value).toContain('z q[1];')
    expect(editor().value).not.toContain('my Bell state')
  })

  it('the editor follows canvas edits made after typing', () => {
    render(<CodePanel />)
    type(VALID)
    advance(PARSE_DEBOUNCE_MS)
    const cx = useCircuitStore.getState().circuit.operations.find((o) => o.gate === 'CX')
    act(() => useCircuitStore.getState().removeOperation(cx?.id ?? ''))
    expect(editor().value).toBe('OPENQASM 2.0;\ninclude "qelib1.inc";\n\nqreg q[2];\n\nh q[0];\n')
  })
})

describe('Problems tab', () => {
  it('shows the empty state', () => {
    render(<ProblemsPanel />)
    expect(screen.getByText('No problems have been detected in the workspace.')).toBeVisible()
  })

  it('lists problems with severity and position; clicking one reveals it in the QASM tab', () => {
    render(
      <>
        <CodePanel />
        <ProblemsPanel />
      </>,
    )
    type('OPENQASM 2.0;\ninclude "other.inc";\nqreg q[2];\nhh q[0];\n')
    advance(PARSE_DEBOUNCE_MS)
    act(() => useUiStore.getState().setCodeTab('qiskit'))
    expect(editor().dataset.language).toBe('python')

    const items = screen.getAllByRole('button', { name: /circuit\.qasm/ })
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Only "qelib1.inc" is supported')
    expect(items[0]).toHaveTextContent('[Ln 2, Col 1]')
    expect(items[0].querySelector('[aria-label="Warning"]')).not.toBeNull()
    expect(items[1]).toHaveTextContent("Unknown gate 'hh'. Did you mean 'h'?")
    expect(items[1]).toHaveTextContent('[Ln 4, Col 1]')
    expect(items[1].querySelector('[aria-label="Error"]')).not.toBeNull()

    fireEvent.click(items[1])
    expect(useUiStore.getState().codeTab).toBe('qasm')
    expect(editor().dataset.language).toBe('qasm')
    expect(editor().dataset.reveal).toBe('4:1')
  })

  it('also lists an engine error', () => {
    act(() => useResultsStore.getState().setError('Invalid qubit count 0'))
    render(<ProblemsPanel />)
    expect(screen.getByText('Simulation failed: Invalid qubit count 0')).toBeVisible()
  })
})

describe('canvas edit over code with errors', () => {
  const notice = () => screen.queryAllByTestId('replaced-notice')
  const addX = () =>
    act(() => {
      useCircuitStore.getState().addOperation({ gate: 'X', column: 0, qubits: [0] }, 'canvas')
    })

  beforeEach(() => act(() => useQasmText.setState({ replacedByCanvas: false })))

  it('shows a notice in the code panel and the Problems tab, cleared by the next edit', () => {
    render(
      <>
        <CodePanel />
        <ProblemsPanel />
      </>,
    )
    type('OPENQASM 2.0;\nqreg q[2];\nfoo q[0]; // half-typed\n')
    advance(PARSE_DEBOUNCE_MS)
    expect(notice()).toHaveLength(0)

    addX()
    expect(editor().value).toContain('x q[0];')
    expect(notice()).toHaveLength(2)
    expect(notice()[0]).toHaveTextContent(
      'Code with errors was replaced by a canvas edit. Press Ctrl+Z in the editor to get it back.',
    )

    type(editor().value + '// edit\n')
    expect(notice()).toHaveLength(0)
  })

  it('also when the invalid text was still waiting for its parse', () => {
    render(<CodePanel />)
    type('OPENQASM 2.0;\nqreg q[2];\nfoo q[0];\n')
    advance(100)
    addX()
    expect(notice()).toHaveLength(1)
  })

  it('no notice when the replaced code was valid, and it can be dismissed', () => {
    render(<CodePanel />)
    type(VALID)
    advance(PARSE_DEBOUNCE_MS)
    addX()
    expect(notice()).toHaveLength(0)

    act(() => useQasmText.setState({ replacedByCanvas: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }))
    expect(notice()).toHaveLength(0)
  })
})

describe('status bar while the QASM has errors', () => {
  it('says the circuit is the last valid one and opens the Problems tab', () => {
    act(() => useUiStore.setState({ bottomTab: 'bloch' }))
    render(
      <>
        <CodePanel />
        <StatusBar />
      </>,
    )
    expect(screen.queryByTestId('status-stale')).not.toBeInTheDocument()
    type(INVALID)
    advance(PARSE_DEBOUNCE_MS)
    const item = screen.getByTestId('status-stale')
    expect(item).toHaveTextContent('QASM has errors — showing last valid circuit')
    fireEvent.click(item)
    expect(useUiStore.getState().bottomTab).toBe('problems')

    type(VALID)
    advance(PARSE_DEBOUNCE_MS)
    expect(screen.queryByTestId('status-stale')).not.toBeInTheDocument()
  })

  it('ignores warnings', () => {
    render(<StatusBar />)
    act(() =>
      useProblemsStore
        .getState()
        .setProblems([{ severity: 'warning', message: 'barrier ignored', line: 1, column: 1 }]),
    )
    expect(screen.queryByTestId('status-stale')).not.toBeInTheDocument()
  })
})
