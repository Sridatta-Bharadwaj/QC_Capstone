// @vitest-environment jsdom
// Opening files (V2-3): routing by extension, .txt sniffing, limits checked before reading,
// binary rejection, the sync with source 'file', the toolbar input and drag-and-drop.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodeEditorProps } from '../../src/components/CodePanel/CodeEditor'
import { CodePanel } from '../../src/components/CodePanel/CodePanel'
import { applyCode, codeTextStores, editCode } from '../../src/components/CodePanel/codeSync'
import { clearNotices, useNoticeStore } from '../../src/components/Notices/noticeStore'
import { toQiskit } from '../../src/codegen'
import {
  displayName,
  looksBinary,
  openCircuitFile,
  readCircuitFile,
  sniffTab,
  tabForName,
  type TextFile,
} from '../../src/files/openFile'
import { startHistoryTracking } from '../../src/history/history'
import { useHistoryStore } from '../../src/model/historyStore'
import { useCircuitStore, useProblemsStore } from '../../src/model/store'
import { MAX_UPLOAD_BYTES } from '../../src/model/types'
import { useUiStore } from '../../src/model/uiStore'
import { QASM3_MESSAGE } from '../../src/parser/qasm'
import { FIXTURE_FILES } from '../fixtures/files'

vi.mock('../../src/components/CodePanel/CodeEditor', () => ({
  default: (props: CodeEditorProps) => (
    <textarea data-testid="editor" value={props.value} readOnly data-path={props.path} />
  ),
}))

/** A file-like object whose text() records whether it was read. */
function textFile(name: string, text: string, size = text.length) {
  const file = { name, size, read: false, text: async () => ((file.read = true), text) }
  return file as TextFile & { read: boolean }
}

const initialCircuit = useCircuitStore.getState()
const initialUi = useUiStore.getState()
let stopHistory: () => void = () => {}

beforeEach(() => {
  useCircuitStore.setState(initialCircuit, true)
  useUiStore.setState(initialUi, true)
  for (const tab of ['qasm', 'qiskit'] as const) {
    applyCode(tab, codeTextStores[tab].getState().text)
    useProblemsStore.getState().setProblems(tab, [])
  }
  clearNotices()
  stopHistory = startHistoryTracking()
})

afterEach(() => {
  stopHistory()
  cleanup()
  clearNotices()
})

const notices = () => useNoticeStore.getState().notices
const circuit = () => useCircuitStore.getState().circuit

describe('routing', () => {
  it.each([
    ['bell.qasm', 'qasm'],
    ['BELL.QASM', 'qasm'],
    ['circuit.py', 'qiskit'],
    ['notes.txt', 'sniff'],
    ['image.png', null],
    ['circuit.qasm.exe', null],
    ['qasm', null],
    ['.qasm', null],
  ])('%s → %s', (name, tab) => {
    expect(tabForName(name)).toBe(tab)
  })

  it('.txt is QASM when it has an OPENQASM line, otherwise Qiskit', () => {
    expect(sniffTab(FIXTURE_FILES['bell_qasm.txt'])).toBe('qasm')
    expect(sniffTab(FIXTURE_FILES['bell_qiskit.txt'])).toBe('qiskit')
    expect(sniffTab('')).toBe('qiskit')
  })

  it('names in messages lose control characters and are shortened', () => {
    expect(displayName('a\u0000b\nc.qasm')).toBe('abc.qasm')
    expect(displayName('x'.repeat(100) + '.qasm')).toHaveLength(58)
  })

  it('binary detection: NUL and other control characters, but not tabs or newlines', () => {
    expect(looksBinary('h q[0];\r\n\tx q[1];\f')).toBe(false)
    expect(looksBinary('OPENQASM\u0000')).toBe(true)
    expect(looksBinary('\u0007')).toBe(true)
  })
})

describe('readCircuitFile: checks before reading', () => {
  it('an unsupported extension is rejected without reading the file', async () => {
    const file = textFile('photo.jpg', 'x')
    expect(await readCircuitFile(file)).toEqual({
      error: 'Can\'t open "photo.jpg": only .qasm, .py and .txt files are supported.',
    })
    expect(file.read).toBe(false)
  })

  it('a file over 100 KB is rejected without reading it', async () => {
    const file = textFile('big.qasm', '', MAX_UPLOAD_BYTES + 1)
    const result = await readCircuitFile(file)
    expect(result).toEqual({ error: expect.stringContaining('the limit is 100 KB') })
    expect(file.read).toBe(false)
    const atLimit = textFile('ok.qasm', 'OPENQASM 2.0;', MAX_UPLOAD_BYTES)
    expect(await readCircuitFile(atLimit)).toMatchObject({ tab: 'qasm' })
  })

  it('binary content is rejected', async () => {
    expect(await readCircuitFile(textFile('x.qasm', 'OPENQASM 2.0;\u0000\u0001'))).toEqual({
      error: '"x.qasm" is not a text file.',
    })
  })

  it('a read failure is a message, not a crash', async () => {
    const file: TextFile = { name: 'x.py', size: 3, text: () => Promise.reject(new Error('io')) }
    expect(await readCircuitFile(file)).toEqual({ error: 'Could not read "x.py".' })
  })

  it('a byte-order mark is dropped; .txt is sniffed', async () => {
    const result = await readCircuitFile(
      textFile('a.txt', String.fromCharCode(0xfeff) + 'OPENQASM 2.0;\nqreg q[1];'),
    )
    expect(result).toEqual({ tab: 'qasm', text: 'OPENQASM 2.0;\nqreg q[1];' })
  })
})

describe('openCircuitFile', () => {
  it('a .qasm file goes into the QASM tab as is; the Qiskit tab follows; one history entry', async () => {
    useUiStore.getState().setCodeTab('qiskit')
    const text = FIXTURE_FILES['bell_measure_all.qasm']
    const entries = useHistoryStore.getState().entries.length
    await openCircuitFile(textFile('bell.qasm', text))

    expect(useUiStore.getState().codeTab).toBe('qasm')
    expect(codeTextStores.qasm.getState().text).toBe(text)
    expect(circuit().operations.map((o) => o.gate)).toEqual(['H', 'CX'])
    expect(useCircuitStore.getState().lastSource).toBe('file')
    expect(codeTextStores.qiskit.getState().text).toBe(toQiskit(circuit()))
    expect(useHistoryStore.getState().entries).toHaveLength(entries + 1)
    // Warnings (creg, barrier, measurements) are listed in the Problems tab.
    expect(useProblemsStore.getState().byTab.qasm.length).toBeGreaterThan(0)
    expect(notices()[0].message).toMatch(/^Opened "bell.qasm" in the QASM tab with 4 warnings/)
  })

  it('a .py file goes into the Qiskit tab', async () => {
    const text = FIXTURE_FILES['bell.py']
    await openCircuitFile(textFile('bell.py', text))
    expect(useUiStore.getState().codeTab).toBe('qiskit')
    expect(codeTextStores.qiskit.getState().text).toBe(text)
    expect(circuit().operations.map((o) => o.gate)).toEqual(['H', 'CX'])
  })

  it('a .txt with Qiskit code goes into the Qiskit tab, a clean file says just "Opened"', async () => {
    await openCircuitFile(textFile('bell.txt', FIXTURE_FILES['bell_qiskit.txt']))
    expect(useUiStore.getState().codeTab).toBe('qiskit')
    expect(notices()[0]).toMatchObject({
      kind: 'info',
      message: 'Opened "bell.txt" in the Qiskit tab.',
    })
  })

  it('a file with errors leaves the circuit alone and says so', async () => {
    const before = circuit()
    const entries = useHistoryStore.getState().entries.length
    await openCircuitFile(textFile('new.qasm', FIXTURE_FILES['qasm3.qasm']))
    expect(circuit()).toBe(before)
    expect(useHistoryStore.getState().entries).toHaveLength(entries)
    expect(codeTextStores.qasm.getState().text).toBe(FIXTURE_FILES['qasm3.qasm'])
    expect(useProblemsStore.getState().byTab.qasm[0].message).toBe(QASM3_MESSAGE)
    expect(notices()[0]).toMatchObject({
      kind: 'warning',
      message:
        '"new.qasm" has 1 error (see the Problems tab). It is in the QASM tab; the circuit was not changed.',
    })
  })

  it('rejected files only show a notice', async () => {
    const before = circuit()
    const qasmText = codeTextStores.qasm.getState().text
    await openCircuitFile(textFile('big.qasm', '', MAX_UPLOAD_BYTES * 2))
    await openCircuitFile(textFile('x.exe', 'MZ'))
    expect(circuit()).toBe(before)
    expect(codeTextStores.qasm.getState().text).toBe(qasmText)
    expect(notices().map((n) => n.kind)).toEqual(['warning', 'warning'])
  })

  it('a later canvas edit regenerates the file tab as usual', async () => {
    await openCircuitFile(textFile('bell.qasm', FIXTURE_FILES['bell_measure_all.qasm']))
    act(() => useCircuitStore.getState().addOperation({ gate: 'X', column: 5, qubits: [0] }))
    expect(codeTextStores.qasm.getState().text).not.toContain('measure')
  })
})

describe('editor path limit', () => {
  it('typing more than 100 KB into a tab is an error, not a parse', () => {
    vi.useFakeTimers()
    try {
      const before = circuit()
      editCode('qasm', 'OPENQASM 2.0;\n' + '// x\n'.repeat(MAX_UPLOAD_BYTES / 4))
      vi.runAllTimers()
      expect(circuit()).toBe(before)
      expect(useProblemsStore.getState().byTab.qasm[0].message).toMatch(/too long/)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('toolbar and drag-and-drop', () => {
  /** A real File (jsdom's File has text()). */
  const file = (name: string, text: string) => new File([text], name, { type: 'text/plain' })
  /** Waits for the async read + parse started by an event handler. */
  const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

  it('Open file: the hidden input accepts .qasm/.py/.txt and opens the chosen file', async () => {
    render(<CodePanel />)
    const input = screen.getByTestId('open-file-input') as HTMLInputElement
    expect(input.accept).toBe('.qasm,.py,.txt')
    fireEvent.change(input, {
      target: { files: [file('ghz.qasm', FIXTURE_FILES['ghz_barrier.qasm'])] },
    })
    await settle()
    expect(circuit().numQubits).toBe(3)
    expect(useCircuitStore.getState().lastSource).toBe('file')
  })

  it('dragging a file over the panel shows the drop hint; dropping opens it', async () => {
    const { container } = render(<CodePanel />)
    const panel = container.querySelector('.code-panel') as HTMLElement
    const dataTransfer = {
      types: ['Files'],
      files: [file('bell.py', FIXTURE_FILES['bell.py'])],
      dropEffect: 'none',
    }
    fireEvent.dragEnter(panel, { dataTransfer })
    expect(screen.getByTestId('drop-overlay').textContent).toContain('Drop a .qasm, .py or .txt')
    fireEvent.dragOver(panel, { dataTransfer })
    expect(dataTransfer.dropEffect).toBe('copy')
    fireEvent.drop(panel, { dataTransfer })
    expect(screen.queryByTestId('drop-overlay')).toBeNull()
    await settle()
    expect(useUiStore.getState().codeTab).toBe('qiskit')
    expect(circuit().operations.map((o) => o.gate)).toEqual(['H', 'CX'])
  })

  it('leaving the panel hides the hint; text drags are left to the editor', () => {
    const { container } = render(<CodePanel />)
    const panel = container.querySelector('.code-panel') as HTMLElement
    fireEvent.dragEnter(panel, { dataTransfer: { types: ['Files'], files: [] } })
    fireEvent.dragLeave(panel, { dataTransfer: { types: ['Files'], files: [] } })
    expect(screen.queryByTestId('drop-overlay')).toBeNull()
    fireEvent.dragEnter(panel, { dataTransfer: { types: ['text/plain'], files: [] } })
    expect(screen.queryByTestId('drop-overlay')).toBeNull()
  })

  it('dropping two files asks for one', () => {
    const { container } = render(<CodePanel />)
    const panel = container.querySelector('.code-panel') as HTMLElement
    const files = [file('a.qasm', ''), file('b.qasm', '')]
    fireEvent.drop(panel, { dataTransfer: { types: ['Files'], files } })
    expect(notices()[0].message).toBe('Drop one file at a time.')
  })
})
