// @vitest-environment jsdom
// Regression tests for the fixes from the independent v2 review (docs/reviews/v2-review.md).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendGate, nudgeSelected } from '../../src/components/Canvas/actions'
import { useCanvasStore } from '../../src/components/Canvas/canvasStore'
import { clearNotices, useNoticeStore } from '../../src/components/Notices/noticeStore'
import { KeepSelector } from '../../src/components/Teaching/KeepSelector'
import { blochPngTitle } from '../../src/files/blochPng'
import { installFileDropGuard } from '../../src/files/dropGuard'
import { collapseEmptyColumns, columnCount, emptyCircuit } from '../../src/model/circuit'
import { useStepStore } from '../../src/model/stepStore'
import { useCircuitStore } from '../../src/model/store'
import { MAX_OPERATIONS, type Circuit, type Operation } from '../../src/model/types'
import { MAX_COLUMN, validateCircuit } from '../../src/model/validate'
import { suggestGateName } from '../../src/parser/qasm'
import { parseQiskit } from '../../src/parser/qiskit'
import { BACKUP_KEY, readSavedCircuit, STORAGE_KEY } from '../../src/persistence/autosave'

const initialCircuitState = useCircuitStore.getState()
const initialStepState = useStepStore.getState()

beforeEach(() => {
  useCircuitStore.setState(initialCircuitState, true)
  useStepStore.setState(initialStepState, true)
  useCanvasStore.setState({ selectedOpId: null, hint: null })
  clearNotices()
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function hOps(count: number): Operation[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `h${i}`,
    gate: 'H' as const,
    column: i,
    qubits: [0],
  }))
}

describe('R1: the canvas cannot build circuits that validateCircuit rejects', () => {
  it(`refuses a gate past ${MAX_OPERATIONS} and says why`, () => {
    const full: Circuit = { ...emptyCircuit(1), operations: hOps(MAX_OPERATIONS) }
    useCircuitStore.setState({ circuit: full })
    expect(appendGate('X')).toBe(false)
    expect(useCircuitStore.getState().circuit.operations).toHaveLength(MAX_OPERATIONS)
    expect(useCanvasStore.getState().hint?.text).toMatch(/at most 500 gates/)
  })

  it('the store refuses a 501st gate even without the canvas', () => {
    const full: Circuit = { ...emptyCircuit(1), operations: hOps(MAX_OPERATIONS) }
    useCircuitStore.setState({ circuit: full })
    const id = useCircuitStore
      .getState()
      .addOperation({ gate: 'X', column: MAX_OPERATIONS, qubits: [0] })
    expect(id).toBeNull()
  })

  it(`refuses moving a gate past column ${MAX_COLUMN}`, () => {
    const circuit: Circuit = {
      ...emptyCircuit(1),
      operations: [{ id: 'a', gate: 'H', column: MAX_COLUMN, qubits: [0] }],
    }
    useCircuitStore.setState({ circuit })
    useCanvasStore.getState().selectOp('a')
    expect(nudgeSelected(1, 0)).toBe(false)
    expect(useCircuitStore.getState().circuit.operations[0].column).toBe(MAX_COLUMN)
    expect(useCanvasStore.getState().hint?.text).toMatch(/Column limit/)
  })

  it('invalid saved data is moved to a backup key instead of being deleted', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"numQubits": 99, "operations": []}')
    const result = readSavedCircuit()
    expect(result && 'error' in result).toBe(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(window.localStorage.getItem(BACKUP_KEY)).toBe('{"numQubits": 99, "operations": []}')
  })
})

describe('R4: a gate after the circuit is used is flagged', () => {
  it('warns once for gates after Statevector(qc)', () => {
    const src = [
      'from qiskit import QuantumCircuit',
      'from qiskit.quantum_info import Statevector',
      'qc = QuantumCircuit(1)',
      'qc.h(0)',
      'state = Statevector(qc)',
      'qc.x(0)',
      'qc.z(0)',
    ].join('\n')
    const { circuit, problems } = parseQiskit(src)
    expect(circuit?.operations).toHaveLength(3)
    const warnings = problems.filter((p) => /already uses 'qc'/.test(p.message))
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ severity: 'warning', line: 6 })
  })

  it('no warning when the analysis comes after every gate', () => {
    const src = 'from qiskit import QuantumCircuit\nqc = QuantumCircuit(1)\nqc.h(0)\nprint(qc)\n'
    expect(parseQiskit(src).problems).toEqual([])
  })
})

describe('R5: a file dropped outside the code panel does not navigate away', () => {
  it('prevents the default drop and dragover for files', () => {
    const remove = installFileDropGuard()
    const types = ['Files']
    const over = new Event('dragover', { cancelable: true }) as DragEvent
    Object.defineProperty(over, 'dataTransfer', { value: { types, dropEffect: 'none' } })
    window.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)

    const drop = new Event('drop', { cancelable: true }) as DragEvent
    Object.defineProperty(drop, 'dataTransfer', { value: { types, files: [{}, {}] } })
    window.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(true)
    expect(useNoticeStore.getState().notices.at(-1)?.message).toMatch(/one file at a time/)
    remove()
  })

  it('ignores drags without files (e.g. dragging a gate)', () => {
    const remove = installFileDropGuard()
    const over = new Event('dragover', { cancelable: true }) as DragEvent
    Object.defineProperty(over, 'dataTransfer', { value: { types: ['text/plain'] } })
    window.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(false)
    remove()
  })
})

describe('R6: long runs of empty columns are collapsed on load', () => {
  it('a lone gate at column 999 lands in column 0', () => {
    const res = validateCircuit({
      numQubits: 1,
      operations: [{ gate: 'H', column: 999, qubits: [0] }],
    })
    expect('circuit' in res && res.circuit.operations[0].column).toBe(0)
  })

  it('keeps gate order, shared columns and at most one empty column between gates', () => {
    const c: Circuit = {
      ...emptyCircuit(2),
      operations: [
        { id: 'a', gate: 'H', column: 3, qubits: [0] },
        { id: 'b', gate: 'X', column: 3, qubits: [1] },
        { id: 'c', gate: 'CX', column: 4, qubits: [0, 1] },
        { id: 'd', gate: 'Z', column: 40, qubits: [1] },
      ],
    }
    const out = collapseEmptyColumns(c)
    const col = (id: string) => out.operations.find((o) => o.id === id)!.column
    expect([col('a'), col('b'), col('c'), col('d')]).toEqual([0, 0, 1, 3])
    expect(columnCount(out)).toBe(4)
  })

  it('returns the same object when nothing changes', () => {
    const c: Circuit = { ...emptyCircuit(1), operations: hOps(3) }
    expect(collapseEmptyColumns(c)).toBe(c)
  })
})

describe('R8: the Bloch PNG title says which step it shows', () => {
  it('adds the step only when not Live', () => {
    expect(blochPngTitle(2)).toBe('Bloch spheres · 2 qubits')
    expect(blochPngTitle(2, 'step 1 / 2 · after column 0')).toBe(
      'Bloch spheres · 2 qubits · step 1 / 2 · after column 0',
    )
  })
})

describe('R9: gate suggestions never match Object.prototype names', () => {
  it('has no suggestion for constructor / __proto__', () => {
    expect(suggestGateName('constructor')).not.toBe('constructor')
    expect(suggestGateName('__proto__')).not.toBe('__proto__')
    expect(suggestGateName('h')).toBe('h')
  })
})

describe('R13: teaching toolbars show the debugger step', () => {
  it('shows "Step k / N" only when not Live', () => {
    const circuit: Circuit = { ...emptyCircuit(2), operations: hOps(2) }
    useCircuitStore.setState({ circuit })
    const { rerender } = render(<KeepSelector numQubits={2} keep={[0]} />)
    expect(screen.queryByTestId('teaching-step')).toBeNull()
    useStepStore.setState({ live: false, step: 1 })
    rerender(<KeepSelector numQubits={2} keep={[0]} />)
    expect(screen.getByTestId('teaching-step').textContent).toBe('Step 1 / 2 · after column 0')
  })
})
