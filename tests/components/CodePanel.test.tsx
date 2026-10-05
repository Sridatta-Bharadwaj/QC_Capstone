// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodeEditorProps } from '../../src/components/CodePanel/CodeEditor'
import { CodePanel } from '../../src/components/CodePanel/CodePanel'
import { useCircuitStore } from '../../src/model/store'
import { useUiStore } from '../../src/model/uiStore'

// The real editor pulls in Monaco (needs a real browser). Replace the lazy module with a stub
// whose import we resolve by hand, so the test can see the Suspense fallback first.
let resolveEditor: () => void = () => {}
const editorLoaded = new Promise<void>((resolve) => {
  resolveEditor = resolve
})

vi.mock('../../src/components/CodePanel/CodeEditor', async () => {
  await editorLoaded
  return {
    default: (props: CodeEditorProps) => (
      <pre data-testid="editor" data-language={props.language} data-readonly={props.readOnly}>
        {props.value}
      </pre>
    ),
  }
})

describe('CodePanel', () => {
  beforeEach(() => {
    useUiStore.setState({ codeTab: 'qasm' })
    useCircuitStore.getState().loadPreset('bell')
  })
  afterEach(() => {
    useCircuitStore.getState().setCircuit({ numQubits: 2, operations: [] }, 'canvas')
  })

  it('shows a code skeleton until the lazy editor loads, then generated code', async () => {
    render(<CodePanel />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading code editor')
    expect(document.querySelectorAll('.skeleton').length).toBeGreaterThan(0)
    expect(screen.queryByTestId('editor')).not.toBeInTheDocument()

    await act(async () => resolveEditor())

    const editor = await screen.findByTestId('editor')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(editor).toHaveAttribute('data-language', 'qasm')
    expect(editor).toHaveAttribute('data-readonly', 'true')
    expect(editor.textContent).toContain('h q[0];\ncx q[0],q[1];')

    fireEvent.click(screen.getByRole('tab', { name: 'Qiskit' }))
    expect(screen.getByTestId('editor')).toHaveAttribute('data-language', 'python')
    expect(screen.getByTestId('editor').textContent).toContain('qc.cx(0, 1)')

    // Text follows the circuit model.
    act(() => useCircuitStore.getState().loadPreset('ghz3'))
    expect(screen.getByTestId('editor').textContent).toContain('qc.cx(1, 2)')
  })
})
