// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { appendGate } from '../../src/components/Canvas/actions'
import { CanvasView } from '../../src/components/Canvas/CanvasView'
import { CircuitDndProvider } from '../../src/components/Canvas/CircuitDndProvider'
import { useCanvasStore } from '../../src/components/Canvas/canvasStore'
import { useCircuitStore } from '../../src/model/store'
import { MAX_QUBITS, type Circuit } from '../../src/model/types'

const initialCircuit = useCircuitStore.getState()
const initialCanvas = useCanvasStore.getState()

beforeEach(() => {
  useCircuitStore.setState(initialCircuit, true)
  useCanvasStore.setState(initialCanvas, true)
})
afterEach(cleanup)

function renderCanvas(circuit?: Circuit, selectedOpId: string | null = null) {
  if (circuit) useCircuitStore.getState().setCircuit(circuit, 'canvas')
  useCanvasStore.setState({ selectedOpId })
  return render(
    <CircuitDndProvider>
      <CanvasView />
    </CircuitDndProvider>,
  )
}

const ops = () => useCircuitStore.getState().circuit.operations

describe('CanvasView toolbar', () => {
  it('shows the qubit count and disables Add qubit at the maximum', () => {
    renderCanvas()
    const add = screen.getByRole('button', { name: 'Add qubit' })
    expect(screen.getByText(`2 / ${MAX_QUBITS}`)).toBeInTheDocument()
    for (let i = 2; i < MAX_QUBITS; i++) fireEvent.click(add)
    expect(useCircuitStore.getState().circuit.numQubits).toBe(MAX_QUBITS)
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleName(`Add qubit (maximum of ${MAX_QUBITS} qubits reached)`)
    expect(add).toHaveAttribute('title', `Maximum of ${MAX_QUBITS} qubits reached`)
    expect(screen.getAllByRole('button', { name: /^Select qubit/ })).toHaveLength(MAX_QUBITS)
  })

  it('disables Remove qubit at one qubit', () => {
    renderCanvas()
    const remove = screen.getByRole('button', { name: 'Remove qubit' })
    expect(remove).toBeEnabled()
    fireEvent.click(remove)
    expect(useCircuitStore.getState().circuit.numQubits).toBe(1)
    expect(remove).toBeDisabled()
    expect(remove).toHaveAttribute('title', 'At least one qubit is needed')
  })

  it('shows an empty-circuit hint only while there are no gates', () => {
    renderCanvas()
    expect(screen.getByTestId('canvas-empty')).toHaveTextContent('pick a preset')
    cleanup()
    renderCanvas({ numQubits: 2, operations: [{ id: 'h', gate: 'H', column: 0, qubits: [0] }] })
    expect(screen.queryByTestId('canvas-empty')).not.toBeInTheDocument()
  })

  it('clears all gates', () => {
    renderCanvas({ numQubits: 2, operations: [{ id: 'h', gate: 'H', column: 0, qubits: [0] }] })
    expect(screen.queryByTestId('canvas-empty')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.getByTestId('canvas-empty')).toBeInTheDocument()
    expect(ops()).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled()
  })

  it('selects a qubit from its wire label', () => {
    renderCanvas()
    const q1 = screen.getByRole('button', { name: 'Select qubit q1' })
    fireEvent.click(q1)
    expect(useCircuitStore.getState().selectedQubit).toBe(1)
    expect(q1).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('CanvasView gates and inspector', () => {
  const rx: Circuit = {
    numQubits: 2,
    operations: [{ id: 'rx', gate: 'RX', column: 0, qubits: [0], angle: Math.PI / 2 }],
  }

  it('draws controls and targets for multi-qubit gates', () => {
    renderCanvas({
      numQubits: 3,
      operations: [{ id: 'cx', gate: 'CX', column: 1, qubits: [2, 0] }],
    })
    expect(screen.getByRole('button', { name: 'CX control on q2, column 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'CX target on q0, column 1' })).toBeInTheDocument()
  })

  it('selects a gate on click and shows the angle with π', () => {
    renderCanvas(rx)
    const gate = screen.getByRole('button', { name: 'Rx(π/2) on q0, column 0' })
    fireEvent.click(gate)
    expect(useCanvasStore.getState().selectedOpId).toBe('rx')
    expect(screen.getByRole('textbox', { name: 'Rotation angle' })).toHaveValue('pi/2')
  })

  it('commits a valid angle on Enter', () => {
    renderCanvas(rx, 'rx')
    const input = screen.getByRole('textbox', { name: 'Rotation angle' })
    fireEvent.change(input, { target: { value: '-3*pi/4' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(ops()[0].angle).toBeCloseTo((-3 * Math.PI) / 4)
    expect(input).toHaveValue('-3*pi/4')
  })

  it('rejects an invalid angle on Enter with an inline error and keeps the old one', () => {
    renderCanvas(rx, 'rx')
    const input = screen.getByRole('textbox', { name: 'Rotation angle' })
    fireEvent.change(input, { target: { value: 'pi/' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid angle')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveValue('pi/')
    expect(ops()[0].angle).toBe(Math.PI / 2)
  })

  it.each(['abc', ''])('reverts invalid text %j to the current angle on blur', (text) => {
    renderCanvas(rx, 'rx')
    const input = screen.getByRole('textbox', { name: 'Rotation angle' })
    fireEvent.change(input, { target: { value: text } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('alert')).toBeInTheDocument()
    fireEvent.blur(input)
    expect(input).toHaveValue('pi/2')
    expect(input).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(ops()[0].angle).toBe(Math.PI / 2)
  })

  it('commits a valid angle on blur and reverts with Escape', () => {
    renderCanvas(rx, 'rx')
    const input = screen.getByRole('textbox', { name: 'Rotation angle' })
    fireEvent.change(input, { target: { value: 'pi' } })
    fireEvent.blur(input)
    expect(ops()[0].angle).toBeCloseTo(Math.PI)
    fireEvent.change(input, { target: { value: 'nonsense' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('pi')
    expect(ops()[0].angle).toBeCloseTo(Math.PI)
  })

  it('re-targets qubits, swapping roles when needed', () => {
    renderCanvas(
      { numQubits: 3, operations: [{ id: 'cx', gate: 'CX', column: 0, qubits: [0, 1] }] },
      'cx',
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Target' }), { target: { value: '2' } })
    expect(ops()[0].qubits).toEqual([0, 2])
    fireEvent.change(screen.getByRole('combobox', { name: 'Control' }), { target: { value: '2' } })
    expect(ops()[0].qubits).toEqual([2, 0])
  })

  it('deletes the selected gate with the Delete button', () => {
    renderCanvas(rx, 'rx')
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }))
    expect(ops()).toHaveLength(0)
    expect(useCanvasStore.getState().selectedOpId).toBeNull()
  })

  it('handles Delete, Escape and arrow keys on a selected gate', () => {
    renderCanvas(rx, 'rx')
    const gate = () => screen.getByRole('button', { name: /^Rx/ })
    fireEvent.keyDown(gate(), { key: 'ArrowRight' })
    fireEvent.keyDown(gate(), { key: 'ArrowDown' })
    expect(ops()[0]).toMatchObject({ column: 1, qubits: [1] })
    fireEvent.keyDown(gate(), { key: 'Escape' })
    expect(useCanvasStore.getState().selectedOpId).toBeNull()
    fireEvent.click(gate())
    fireEvent.keyDown(gate(), { key: 'Delete' })
    expect(ops()).toHaveLength(0)
  })

  it('does not delete the gate when Backspace is pressed inside the angle input', () => {
    renderCanvas(rx, 'rx')
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Rotation angle' }), {
      key: 'Backspace',
    })
    expect(ops()).toHaveLength(1)
  })
})

describe('CanvasView scrolling', () => {
  afterEach(() => {
    // jsdom has no scrollIntoView; remove the stub again.
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
  })

  it('scrolls a newly placed (selected) gate into view', () => {
    const scrollIntoView = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    renderCanvas({ numQubits: 1, operations: [] })
    act(() => {
      appendGate('H')
    })
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' })
    const gate = screen.getByRole('button', { name: 'H on q0, column 0' })
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(gate.closest('.gate'))
  })
})
