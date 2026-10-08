// @vitest-environment jsdom
// V2-5: the timeline bar, canvas highlight, keyboard, play/pause, status bar, subset step.
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasView } from '../../src/components/Canvas/CanvasView'
import { CircuitDndProvider } from '../../src/components/Canvas/CircuitDndProvider'
import { useCanvasStore } from '../../src/components/Canvas/canvasStore'
import { StatusBar } from '../../src/components/StatusBar/StatusBar'
import { useSubsetResult } from '../../src/components/Teaching/useSubsetResult'
import { PLAY_STEP_MS } from '../../src/components/Timeline/timelineText'
import { useStepStore } from '../../src/model/stepStore'
import { useCircuitStore, useResultsStore } from '../../src/model/store'
import type { Circuit } from '../../src/model/types'
import { startEngineBridge } from '../../src/worker/useEngineBridge'
import { circuit, expectClose } from '../engine/helpers'

const initialCircuit = useCircuitStore.getState()
const initialCanvas = useCanvasStore.getState()
const initialResults = useResultsStore.getState()
const initialSteps = useStepStore.getState()

beforeEach(() => {
  useCircuitStore.setState(initialCircuit, true)
  useCanvasStore.setState(initialCanvas, true)
  useResultsStore.setState(initialResults, true)
  useStepStore.setState(initialSteps, true)
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const bell = circuit(2, ['H', 0, [0]], ['CX', 1, [0, 1]])
const steps = () => useStepStore.getState()

function renderCanvas(c: Circuit = bell) {
  useCircuitStore.getState().setCircuit(c, 'preset')
  return render(
    <CircuitDndProvider>
      <CanvasView />
    </CircuitDndProvider>,
  )
}

const slider = () => screen.getByRole('slider', { name: 'Step' })
const button = (name: RegExp | string) => screen.getByRole('button', { name })
const gateClass = (name: RegExp) => screen.getByRole('button', { name }).closest('.gate')!.className

describe('timeline bar', () => {
  it('starts Live at the last step with labelled, correctly disabled controls', () => {
    renderCanvas()
    expect(slider()).toHaveValue('2')
    expect(slider()).toHaveAttribute('aria-valuetext', 'Live, final state, step 2 of 2')
    expect(screen.getByTestId('timeline-label')).toHaveTextContent('Live')
    expect(button('Live')).toHaveAttribute('aria-pressed', 'true')
    expect(button('Next step')).toBeDisabled()
    expect(button(/^Last step/)).toBeDisabled()
    expect(button('Previous step')).toBeEnabled()
    expect(button(/^First step/)).toBeEnabled()
  })

  it('disables everything but Live when there are no gates', () => {
    renderCanvas(circuit(2))
    expect(slider()).toBeDisabled()
    expect(button('Previous step')).toBeDisabled()
    expect(button('Play through the steps')).toBeDisabled()
    expect(screen.getByTestId('timeline-label')).toHaveTextContent('No gates')
  })

  it('buttons and slider move the step and turn Live off; Live returns', () => {
    renderCanvas()
    fireEvent.click(button(/^First step/))
    expect(steps()).toMatchObject({ live: false, step: 0 })
    expect(slider()).toHaveAttribute('aria-valuetext', 'Step 0 of 2, start state')
    expect(button(/^First step/)).toBeDisabled()
    fireEvent.click(button('Next step'))
    expect(screen.getByTestId('timeline-label')).toHaveTextContent('Step 1 / 2 · after column 0')
    fireEvent.change(slider(), { target: { value: '2' } })
    expect(steps()).toMatchObject({ live: false, step: 2 })
    fireEvent.click(button('Live'))
    expect(steps().live).toBe(true)
  })

  it('a circuit edit returns to Live', () => {
    renderCanvas()
    fireEvent.click(button(/^First step/))
    act(() => {
      useCircuitStore.getState().addOperation({ gate: 'X', column: 2, qubits: [1] })
    })
    expect(steps().live).toBe(true)
    expect(button('Live')).toHaveAttribute('aria-pressed', 'true')
  })
})

describe('canvas highlight', () => {
  it('nothing is dimmed while Live', () => {
    renderCanvas()
    expect(gateClass(/^H on q0/)).not.toMatch(/gate--step/)
    expect(screen.queryByTestId('step-line')).toBeNull()
  })

  it('step 1 highlights column 0 and dims column 1', () => {
    renderCanvas()
    act(() => steps().goTo(1, 2))
    expect(gateClass(/^H on q0/)).toContain('gate--step-current')
    expect(gateClass(/control on q0/)).toContain('gate--step-future')
    expect(screen.getByTestId('step-band')).toHaveStyle({ left: '0px' })
  })

  it('step 0 dims every gate and draws only the line at the start', () => {
    renderCanvas()
    act(() => steps().goTo(0, 2))
    expect(gateClass(/^H on q0/)).toContain('gate--step-future')
    expect(gateClass(/control on q0/)).toContain('gate--step-future')
    expect(screen.queryByTestId('step-band')).toBeNull()
    expect(screen.getByTestId('step-line')).toHaveStyle({ left: '0px' })
  })

  it('the last step marks the last column as current, nothing dimmed', () => {
    renderCanvas()
    act(() => steps().goTo(2, 2))
    expect(gateClass(/^H on q0/)).not.toMatch(/gate--step/)
    expect(gateClass(/control on q0/)).toContain('gate--step-current')
  })
})

describe('keyboard', () => {
  it('[ and ] step when the canvas has focus', () => {
    renderCanvas()
    const canvas = screen.getByRole('region', { name: 'Circuit' })
    fireEvent.keyDown(canvas, { key: '[' })
    expect(steps()).toMatchObject({ live: false, step: 1 })
    fireEvent.keyDown(canvas, { key: '[' })
    fireEvent.keyDown(canvas, { key: '[' })
    expect(steps().step).toBe(0)
    fireEvent.keyDown(canvas, { key: ']' })
    expect(steps().step).toBe(1)
    // Also while the slider has focus.
    fireEvent.keyDown(slider(), { key: ']' })
    expect(steps().step).toBe(2)
  })

  it('does not step while typing in a text input', () => {
    renderCanvas()
    const input = document.createElement('input')
    screen.getByRole('region', { name: 'Circuit' }).append(input)
    fireEvent.keyDown(input, { key: '[' })
    expect(steps().live).toBe(true)
  })
})

describe('play / pause', () => {
  it('plays from the start, one step per interval, and stops at the end', () => {
    vi.useFakeTimers()
    renderCanvas()
    fireEvent.click(button('Play through the steps'))
    expect(steps()).toMatchObject({ live: false, step: 0, playing: true })
    expect(button('Pause')).toHaveAttribute('aria-pressed', 'true')

    act(() => vi.advanceTimersByTime(PLAY_STEP_MS))
    expect(steps().step).toBe(1)
    act(() => vi.advanceTimersByTime(PLAY_STEP_MS))
    expect(steps().step).toBe(2)
    expect(steps().playing).toBe(false)
    expect(button('Play through the steps')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(PLAY_STEP_MS * 3))
    expect(steps()).toMatchObject({ live: false, step: 2 })
  })

  it('pause stops the timer; a step button also pauses', () => {
    vi.useFakeTimers()
    renderCanvas(circuit(1, ['H', 0, [0]], ['X', 1, [0]], ['Z', 2, [0]]))
    fireEvent.click(button(/^First step/))
    fireEvent.click(button('Play through the steps'))
    act(() => vi.advanceTimersByTime(PLAY_STEP_MS))
    fireEvent.click(button('Pause'))
    act(() => vi.advanceTimersByTime(PLAY_STEP_MS * 5))
    expect(steps()).toMatchObject({ step: 1, playing: false })

    fireEvent.click(button('Play through the steps')) // resumes from step 1
    fireEvent.click(button('Next step'))
    expect(steps()).toMatchObject({ step: 2, playing: false })
  })

  it('under prefers-reduced-motion it still steps (jumps, no tweening)', () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('reduce'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    )
    vi.useFakeTimers()
    renderCanvas()
    fireEvent.click(button('Play through the steps'))
    act(() => vi.advanceTimersByTime(PLAY_STEP_MS))
    expect(steps().step).toBe(1)
    // (The CSS side, the global reduced-motion rule, is checked in tests/design/stepMotion.test.ts.)
  })
})

describe('results follow the step (through the UI)', () => {
  it('Bell: Next from the start gives a pure q0, then both maximally mixed', () => {
    const stop = startEngineBridge(() => null)
    renderCanvas()
    render(<StatusBar />)
    fireEvent.click(button(/^First step/))
    fireEvent.click(button('Next step'))
    let q = useResultsStore.getState().analysis!.qubits
    expectClose(q[0].purity, 1)
    expectClose(q[0].bloch.x, 1)
    expect(screen.getByTestId('status-entangled')).toHaveTextContent('No entanglement')
    expect(screen.getByTestId('status-step')).toHaveTextContent('Step 1/2')

    fireEvent.click(button('Next step'))
    q = useResultsStore.getState().analysis!.qubits
    expectClose(q[0].purity, 0.5)
    expectClose(q[1].purity, 0.5)
    expect(screen.getByTestId('status-entangled')).toHaveTextContent('Entangled')

    // The status bar item returns to Live.
    fireEvent.click(screen.getByTestId('status-step'))
    expect(steps().live).toBe(true)
    expect(screen.queryByTestId('status-step')).toBeNull()
    stop()
  })

  it('the subset view (V2-7) asks for the state at the step', () => {
    useCircuitStore.getState().setCircuit(bell, 'preset')
    const keep = [0]
    const { result } = renderHook(() => useSubsetResult(bell, keep, true))
    expectClose(result.current.result!.purity, 0.5)
    act(() => steps().goTo(1, 2))
    expectClose(result.current.result!.purity, 1)
    act(() => steps().goLive())
    expectClose(result.current.result!.purity, 0.5)
  })
})
