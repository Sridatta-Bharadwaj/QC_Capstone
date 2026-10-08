// @vitest-environment jsdom
// The initial-state picker on each wire (PLAN.md → V2-2): mouse and keyboard (menu button
// pattern), store + history integration, and the Bloch vector each start state produces.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CanvasView } from '../../src/components/Canvas/CanvasView'
import { CircuitDndProvider } from '../../src/components/Canvas/CircuitDndProvider'
import { useCanvasStore } from '../../src/components/Canvas/canvasStore'
import { analyze } from '../../src/engine'
import { startHistoryTracking, undoCircuit, redoCircuit } from '../../src/history/history'
import { useHistoryStore } from '../../src/model/historyStore'
import { useCircuitStore } from '../../src/model/store'
import { INITIAL_STATES, type InitialState } from '../../src/model/types'

const initialCircuit = useCircuitStore.getState()
const initialCanvas = useCanvasStore.getState()
let stopHistory = () => {}

beforeEach(() => {
  useCircuitStore.setState(initialCircuit, true)
  useCanvasStore.setState(initialCanvas, true)
  stopHistory = startHistoryTracking()
})
afterEach(() => {
  stopHistory()
  cleanup()
})

function renderCanvas() {
  return render(
    <CircuitDndProvider>
      <CanvasView />
    </CircuitDndProvider>,
  )
}

const picker = (q: number) =>
  screen.getByRole('button', { name: new RegExp(`^Initial state of q${q}:`) })
const states = () => useCircuitStore.getState().circuit.initialStates
const menu = () => screen.queryByRole('menu')
const items = () => within(screen.getByRole('menu')).getAllByRole('menuitemradio')

describe('InitialStatePicker: mouse', () => {
  it('shows |0⟩ on every wire by default', () => {
    renderCanvas()
    expect(picker(0)).toHaveTextContent('|0⟩')
    expect(picker(1)).toHaveTextContent('|0⟩')
    expect(picker(0)).toHaveAttribute('aria-haspopup', 'menu')
    expect(picker(0)).toHaveAttribute('aria-expanded', 'false')
  })

  it('opens a menu with the six states, the current one checked', () => {
    renderCanvas()
    fireEvent.click(picker(1))
    expect(picker(1)).toHaveAttribute('aria-expanded', 'true')
    const options = items()
    expect(options.map((o) => o.textContent)).toEqual([
      '|0⟩+z',
      '|1⟩−z',
      '|+⟩+x',
      '|−⟩−x',
      '|i⟩+y',
      '|−i⟩−y',
    ])
    expect(options[0]).toHaveAttribute('aria-checked', 'true')
    expect(options[1]).toHaveAttribute('aria-checked', 'false')
  })

  it('picking a state updates the store and the label, and closes the menu', () => {
    renderCanvas()
    fireEvent.click(picker(1))
    fireEvent.click(items()[3])
    expect(states()).toEqual(['0', '-'])
    expect(useCircuitStore.getState().lastSource).toBe('canvas')
    expect(menu()).toBeNull()
    expect(picker(1)).toHaveTextContent('|−⟩')
    expect(picker(1)).toHaveFocus()
  })

  it('clicking outside closes without a change', () => {
    renderCanvas()
    fireEvent.click(picker(0))
    fireEvent.pointerDown(document.body)
    expect(menu()).toBeNull()
    expect(states()).toEqual(['0', '0'])
  })

  it('does not select the qubit (the q0 name button does)', () => {
    renderCanvas()
    fireEvent.click(picker(0))
    expect(useCircuitStore.getState().selectedQubit).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Select qubit q0' }))
    expect(useCircuitStore.getState().selectedQubit).toBe(0)
  })
})

describe('InitialStatePicker: keyboard', () => {
  it.each(['Enter', ' ', 'ArrowDown'])(
    '%j opens the menu with the current state focused',
    (key) => {
      act(() => useCircuitStore.getState().setInitialState(0, '+'))
      renderCanvas()
      picker(0).focus()
      fireEvent.keyDown(picker(0), { key })
      expect(menu()).not.toBeNull()
      expect(items()[2]).toHaveFocus()
    },
  )

  it('arrows move (wrapping), Home/End jump, Enter picks', () => {
    renderCanvas()
    fireEvent.keyDown(picker(0), { key: 'ArrowDown' })
    const m = screen.getByRole('menu')
    expect(items()[0]).toHaveFocus()
    fireEvent.keyDown(m, { key: 'ArrowUp' })
    expect(items()[5]).toHaveFocus()
    fireEvent.keyDown(m, { key: 'ArrowDown' })
    expect(items()[0]).toHaveFocus()
    fireEvent.keyDown(m, { key: 'End' })
    expect(items()[5]).toHaveFocus()
    fireEvent.keyDown(m, { key: 'Home' })
    fireEvent.keyDown(m, { key: 'ArrowDown' })
    fireEvent.keyDown(m, { key: 'ArrowDown' })
    fireEvent.keyDown(m, { key: 'ArrowDown' })
    fireEvent.keyDown(m, { key: 'ArrowDown' })
    expect(items()[4]).toHaveFocus()
    fireEvent.keyDown(m, { key: 'Enter' })
    expect(states()).toEqual(['i', '0'])
    expect(menu()).toBeNull()
    expect(picker(0)).toHaveFocus()
  })

  it('Space picks too', () => {
    renderCanvas()
    fireEvent.keyDown(picker(1), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('menu'), { key: ' ' })
    expect(states()).toEqual(['0', '1'])
  })

  it('Escape closes, returns focus to the button and changes nothing', () => {
    renderCanvas()
    fireEvent.keyDown(picker(0), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(menu()).toBeNull()
    expect(picker(0)).toHaveFocus()
    expect(states()).toEqual(['0', '0'])
  })

  it('Tab closes the menu', () => {
    renderCanvas()
    fireEvent.keyDown(picker(0), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' })
    expect(menu()).toBeNull()
  })
})

describe('InitialStatePicker: history', () => {
  it('picking a state is one undoable entry; re-picking the same state adds none', () => {
    renderCanvas()
    const before = useHistoryStore.getState().entries.length
    fireEvent.click(picker(0))
    fireEvent.click(items()[1]) // |1⟩
    expect(useHistoryStore.getState().entries).toHaveLength(before + 1)
    fireEvent.click(picker(0))
    fireEvent.click(items()[1]) // same state again: no change
    expect(useHistoryStore.getState().entries).toHaveLength(before + 1)

    act(() => {
      undoCircuit()
    })
    expect(states()).toEqual(['0', '0'])
    expect(picker(0)).toHaveTextContent('|0⟩')
    act(() => {
      redoCircuit()
    })
    expect(states()).toEqual(['1', '0'])
    expect(picker(0)).toHaveTextContent('|1⟩')
  })
})

describe('Bloch vector of each start state (picked through the UI)', () => {
  const expected: Record<InitialState, [number, number, number]> = {
    '0': [0, 0, 1],
    '1': [0, 0, -1],
    '+': [1, 0, 0],
    '-': [-1, 0, 0],
    i: [0, 1, 0],
    '-i': [0, -1, 0],
  }

  it.each(INITIAL_STATES.map((s, k) => [s, k] as const))('|%s⟩', (state, k) => {
    renderCanvas()
    fireEvent.click(picker(1))
    fireEvent.click(items()[k])
    const circuit = useCircuitStore.getState().circuit
    expect(circuit.initialStates).toEqual(['0', state])
    const { x, y, z } = analyze(circuit).qubits[1].bloch
    const [ex, ey, ez] = expected[state]
    expect(x).toBeCloseTo(ex, 12)
    expect(y).toBeCloseTo(ey, 12)
    expect(z).toBeCloseTo(ez, 12)
    // Untouched wire stays at |0⟩.
    expect(analyze(circuit).qubits[0].bloch.z).toBeCloseTo(1, 12)
  })
})
