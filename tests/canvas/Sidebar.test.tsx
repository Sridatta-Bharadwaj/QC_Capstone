// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CanvasView } from '../../src/components/Canvas/CanvasView'
import { CircuitDndProvider } from '../../src/components/Canvas/CircuitDndProvider'
import { useCanvasStore } from '../../src/components/Canvas/canvasStore'
import { Sidebar } from '../../src/components/Sidebar/Sidebar'
import { PRESETS } from '../../src/model/presets'
import { useCircuitStore } from '../../src/model/store'
import { GATE_TYPES, GATES } from '../../src/model/types'

const initialCircuit = useCircuitStore.getState()
const initialCanvas = useCanvasStore.getState()

beforeEach(() => {
  useCircuitStore.setState(initialCircuit, true)
  useCanvasStore.setState(initialCanvas, true)
})
afterEach(cleanup)

function renderApp() {
  return render(
    <CircuitDndProvider>
      <Sidebar />
      <CanvasView />
    </CircuitDndProvider>,
  )
}

describe('Sidebar', () => {
  it('renders every gate in three groups', () => {
    renderApp()
    for (const title of ['Single-qubit', 'Rotations', 'Multi-qubit'])
      expect(screen.getByRole('group', { name: title })).toBeInTheDocument()
    for (const gate of GATE_TYPES) {
      const info = GATES[gate]
      const button = screen.getByRole('button', { name: `${info.label}: ${info.description}` })
      expect(button).toHaveTextContent(info.label)
    }
    expect(
      within(screen.getByRole('group', { name: 'Rotations' })).getAllByRole('button'),
    ).toHaveLength(3)
  })

  it('loads a preset on click', () => {
    renderApp()
    const ghz = PRESETS.find((p) => p.id === 'ghz3')!
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(ghz.name.replace(/[()]/g, '.')) }),
    )
    const { circuit, lastSource } = useCircuitStore.getState()
    expect(lastSource).toBe('preset')
    expect(circuit.numQubits).toBe(3)
    expect(circuit.operations.map((o) => o.gate)).toEqual(['H', 'CX', 'CX'])
  })

  it('appends a gate on click and selects it', () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /^H:/ }))
    fireEvent.click(screen.getByRole('button', { name: /^CX:/ }))
    const ops = useCircuitStore.getState().circuit.operations
    expect(ops.map((o) => [o.gate, o.column, o.qubits])).toEqual([
      ['H', 0, [0]],
      ['CX', 1, [0, 1]],
    ])
    expect(useCanvasStore.getState().selectedOpId).toBe(ops[1].id)
  })

  it('refuses a gate that needs more qubits and shows why', () => {
    renderApp()
    fireEvent.click(screen.getByRole('button', { name: /^CCX:/ }))
    expect(useCircuitStore.getState().circuit.operations).toHaveLength(0)
    expect(screen.getByText(/CCX needs 3 qubits/)).toHaveAttribute('aria-live', 'polite')
  })
})
