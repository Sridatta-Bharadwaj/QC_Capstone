// @vitest-environment jsdom
// Rotation-angle slider in the gate inspector (PLAN.md → V2-6).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasView } from '../../src/components/Canvas/CanvasView'
import { CircuitDndProvider } from '../../src/components/Canvas/CircuitDndProvider'
import { useCanvasStore } from '../../src/components/Canvas/canvasStore'
import { startHistoryTracking, undoCircuit } from '../../src/history/history'
import { defaultInitialStates } from '../../src/model/circuit'
import { useHistoryStore } from '../../src/model/historyStore'
import { useCircuitStore } from '../../src/model/store'
import type { Circuit } from '../../src/model/types'

const initialCircuit = useCircuitStore.getState()
const initialCanvas = useCanvasStore.getState()
const initialHistory = useHistoryStore.getState()

/** Animation frames requested by the slider, run by hand. */
let frames: (() => void)[] = []
let stopHistory: () => void = () => {}

const circuit: Circuit = {
  numQubits: 1,
  initialStates: defaultInitialStates(1),
  operations: [{ id: 'rx', gate: 'RX', column: 0, qubits: [0], angle: Math.PI / 2 }],
}

beforeEach(() => {
  frames = []
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(() => cb(0))
    return frames.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  useCircuitStore.setState(initialCircuit, true)
  useCanvasStore.setState(initialCanvas, true)
  useHistoryStore.setState(initialHistory, true)
  useCircuitStore.getState().setCircuit(circuit, 'canvas')
  stopHistory = startHistoryTracking()
  useCanvasStore.setState({ selectedOpId: 'rx' })
  render(
    <CircuitDndProvider>
      <CanvasView />
    </CircuitDndProvider>,
  )
})

afterEach(() => {
  cleanup()
  stopHistory()
  vi.unstubAllGlobals()
})

const angle = () => useCircuitStore.getState().circuit.operations[0].angle
const entries = () => useHistoryStore.getState().entries.length
const slider = () => screen.getByRole('slider', { name: 'Rotation angle slider' })
/** The π-fraction text next to the slider. */
const valueLabel = () => document.querySelector('.inspector__slider-value')
const runFrames = () =>
  act(() => {
    const pending = frames
    frames = []
    pending.forEach((f) => f())
  })

/** Ticks for an angle given as a multiple of π (1 tick = π/720). */
const ticks = (multipleOfPi: number) => String(Math.round(multipleOfPi * 720))

describe('rotation slider', () => {
  it('is labelled and reports the π fraction as aria-valuetext', () => {
    expect(slider()).toHaveAttribute('aria-valuetext', 'π/2 radians')
    expect(slider()).toHaveValue(ticks(0.5))
    expect(valueLabel()).toHaveTextContent('π/2')
  })

  it('a drag updates the circuit once per frame and is ONE undo step', () => {
    const before = entries()
    fireEvent.pointerDown(slider())
    fireEvent.change(slider(), { target: { value: ticks(0.6) } })
    fireEvent.change(slider(), { target: { value: ticks(0.7) } })
    // Throttled: nothing committed until the animation frame runs.
    expect(angle()).toBe(Math.PI / 2)
    expect(frames).toHaveLength(1)
    // The thumb and label follow the pointer immediately.
    expect(slider()).toHaveValue(ticks(0.7))
    runFrames()
    expect(angle()).toBeCloseTo(0.7 * Math.PI, 12)

    fireEvent.change(slider(), { target: { value: ticks(0.75) } })
    runFrames()
    expect(angle()).toBeCloseTo(0.75 * Math.PI, 12)
    fireEvent.change(slider(), { target: { value: ticks(-0.25) } })
    // Release flushes the last value without waiting for a frame.
    fireEvent.pointerUp(window)
    expect(angle()).toBeCloseTo(-0.25 * Math.PI, 12)

    expect(entries()).toBe(before + 1)
    act(() => {
      undoCircuit()
    })
    expect(angle()).toBe(Math.PI / 2)
  })

  it('keeps the text input in sync with the slider', () => {
    fireEvent.pointerDown(slider())
    fireEvent.change(slider(), { target: { value: ticks(0.25) } })
    fireEvent.pointerUp(window)
    expect(screen.getByRole('textbox', { name: 'Rotation angle' })).toHaveValue('pi/4')
    expect(slider()).toHaveAttribute('aria-valuetext', 'π/4 radians')
  })

  it('the slider follows an angle typed into the text input', () => {
    const input = screen.getByRole('textbox', { name: 'Rotation angle' })
    fireEvent.change(input, { target: { value: '-3*pi/4' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(slider()).toHaveValue(ticks(-0.75))
    expect(slider()).toHaveAttribute('aria-valuetext', '−3π/4 radians')
  })

  it('Shift during a drag snaps to the nearest π/8', () => {
    fireEvent.pointerDown(slider(), { shiftKey: true })
    fireEvent.change(slider(), { target: { value: '200' } }) // 50° → nearest π/8 is 45°
    fireEvent.pointerUp(window)
    expect(angle()).toBeCloseTo(Math.PI / 4, 12)
    expect(valueLabel()).toHaveTextContent('π/4')
  })

  it('a drag that ends where it started adds no undo step', () => {
    const before = entries()
    fireEvent.pointerDown(slider())
    fireEvent.change(slider(), { target: { value: ticks(0.6) } })
    fireEvent.change(slider(), { target: { value: ticks(0.5) } })
    fireEvent.pointerUp(window)
    expect(angle()).toBe(Math.PI / 2)
    expect(entries()).toBe(before)
    expect(frames).toHaveLength(1)
  })

  it('separate drags are separate undo steps', () => {
    const before = entries()
    for (const value of [0.25, 1]) {
      fireEvent.pointerDown(slider())
      fireEvent.change(slider(), { target: { value: ticks(value) } })
      fireEvent.pointerUp(window)
    }
    expect(entries()).toBe(before + 2)
    act(() => {
      undoCircuit()
    })
    expect(angle()).toBeCloseTo(Math.PI / 4, 12)
  })

  it('arrow keys move 1°; a held key (auto-repeat) is one undo step', () => {
    const before = entries()
    fireEvent.keyDown(slider(), { key: 'ArrowRight' })
    expect(angle()).toBeCloseTo(Math.PI / 2 + Math.PI / 180, 12)
    fireEvent.keyDown(slider(), { key: 'ArrowRight', repeat: true })
    fireEvent.keyDown(slider(), { key: 'ArrowRight', repeat: true })
    expect(angle()).toBeCloseTo(Math.PI / 2 + (3 * Math.PI) / 180, 12)
    expect(entries()).toBe(before + 1)
    // A new press is a new step.
    fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
    expect(entries()).toBe(before + 2)
  })

  it('Shift+arrow and PageUp jump between π/8 marks; Home/End go to ±2π', () => {
    fireEvent.keyDown(slider(), { key: 'ArrowRight', shiftKey: true })
    expect(angle()).toBeCloseTo((5 * Math.PI) / 8, 12)
    fireEvent.keyDown(slider(), { key: 'PageDown' })
    expect(angle()).toBeCloseTo(Math.PI / 2, 12)
    fireEvent.keyDown(slider(), { key: 'End' })
    expect(angle()).toBeCloseTo(2 * Math.PI, 12)
    fireEvent.keyDown(slider(), { key: 'Home' })
    expect(angle()).toBeCloseTo(-2 * Math.PI, 12)
    expect(valueLabel()).toHaveTextContent('−2π')
  })
})
