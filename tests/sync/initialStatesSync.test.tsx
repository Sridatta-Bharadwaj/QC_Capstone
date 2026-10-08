// @vitest-environment jsdom
// Initial states through the two-tab sync (PLAN.md → V2-2): the block in one tab sets
// `initialStates` (one setCircuit per committed parse, the edited tab is not regenerated), the
// other tab regenerates with the block, and a picker change regenerates both tabs.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodeEditorProps } from '../../src/components/CodePanel/CodeEditor'
import { CodePanel } from '../../src/components/CodePanel/CodePanel'
import { PARSE_DEBOUNCE_MS, codeTextStores } from '../../src/components/CodePanel/codeSync'
import { defaultInitialStates } from '../../src/model/circuit'
import { useCircuitStore } from '../../src/model/store'
import type { ChangeSource } from '../../src/model/types'
import { useUiStore } from '../../src/model/uiStore'

vi.mock('../../src/components/CodePanel/CodeEditor', () => ({
  default: (props: CodeEditorProps) => (
    <textarea
      data-testid="editor"
      value={props.value}
      readOnly={props.readOnly}
      onChange={(e) => props.onChange?.(e.target.value)}
    />
  ),
}))

const editor = () => screen.getByTestId('editor') as HTMLTextAreaElement
const type = (text: string) => fireEvent.change(editor(), { target: { value: text } })
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const qasmText = () => codeTextStores.qasm.getState().text
const qiskitText = () => codeTextStores.qiskit.getState().text
const circuit = () => useCircuitStore.getState().circuit

let changes: ChangeSource[] = []
let unsubscribe = () => {}

beforeAll(async () => {
  render(<CodePanel />)
  await screen.findByTestId('editor')
  cleanup()
})

beforeEach(() => {
  act(() => {
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

describe('initial states through the code tabs', () => {
  it('QASM block → initialStates; the Qiskit tab regenerates with the block; QASM text kept', () => {
    act(() => useUiStore.setState({ codeTab: 'qasm' }))
    render(<CodePanel />)
    const text =
      'OPENQASM 2.0;\ninclude "qelib1.inc";\nqreg q[2];\n// initial states\nh q[1];\nsdg q[1];\n' +
      '// end initial states\ncx q[0],q[1];\n'
    type(text)
    advance(PARSE_DEBOUNCE_MS)
    expect(changes).toEqual(['qasm'])
    expect(circuit().initialStates).toEqual(['0', '-i'])
    expect(circuit().operations.map((o) => o.gate)).toEqual(['CX'])
    expect(qasmText()).toBe(text)
    expect(qiskitText()).toContain('# initial states\nqc.h(1)\nqc.sdg(1)\n# end initial states\n')
  })

  it('Qiskit block → initialStates; the QASM tab regenerates with the block', () => {
    act(() => useUiStore.setState({ codeTab: 'qiskit' }))
    render(<CodePanel />)
    const text = 'qc = QuantumCircuit(2)\n# initial states\nqc.x(0)\n# end initial states\n'
    type(text)
    advance(PARSE_DEBOUNCE_MS)
    expect(changes).toEqual(['qiskit'])
    expect(circuit().initialStates).toEqual(['1', '0'])
    expect(qiskitText()).toBe(text)
    expect(qasmText()).toContain('// initial states\nx q[0];\n// end initial states\n')
  })

  it('removing the markers turns the prep gates into ordinary gates (and resets the states)', () => {
    act(() => {
      useUiStore.setState({ codeTab: 'qiskit' })
      useCircuitStore.getState().setInitialState(0, '1')
    })
    render(<CodePanel />)
    type('qc = QuantumCircuit(2)\nqc.x(0)\n')
    advance(PARSE_DEBOUNCE_MS)
    expect(circuit().initialStates).toEqual(['0', '0'])
    expect(circuit().operations.map((o) => o.gate)).toEqual(['X'])
  })

  it('a picker change (source canvas) regenerates both tabs', () => {
    act(() => useUiStore.setState({ codeTab: 'qasm' }))
    render(<CodePanel />)
    act(() => useCircuitStore.getState().setInitialState(1, '+', 'canvas'))
    expect(qasmText()).toContain('// initial states\nh q[1];\n// end initial states\n')
    expect(qiskitText()).toContain('# initial states\nqc.h(1)\n# end initial states\n')
    expect(editor().value).toBe(qasmText())
  })

  it('an invalid block keeps the last valid circuit', () => {
    act(() => useUiStore.setState({ codeTab: 'qasm' }))
    render(<CodePanel />)
    type('OPENQASM 2.0;\nqreg q[1];\n// initial states\ns q[0];\nh q[0];\n// end initial states\n')
    advance(PARSE_DEBOUNCE_MS)
    expect(changes).toEqual([])
    expect(circuit().initialStates).toEqual(['0', '0'])
  })
})
