// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startHistoryTracking } from '../../src/history/history'
import { historyActionFor, installHistoryShortcuts } from '../../src/history/shortcuts'
import { useCircuitStore } from '../../src/model/store'

const initial = useCircuitStore.getState()
const cleanups: (() => void)[] = []

beforeEach(() => {
  useCircuitStore.setState(initial, true)
  cleanups.push(startHistoryTracking(), installHistoryShortcuts())
  useCircuitStore.getState().addOperation({ gate: 'H', column: 0, qubits: [0] })
})

afterEach(() => {
  while (cleanups.length) cleanups.pop()!()
  document.body.replaceChildren()
})

const ops = () => useCircuitStore.getState().circuit.operations.length

function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
  target.dispatchEvent(e)
  return e
}

describe('historyActionFor', () => {
  const ev = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)
  it('maps the shortcuts', () => {
    expect(historyActionFor(ev({ key: 'z', ctrlKey: true }))).toBe('undo')
    expect(historyActionFor(ev({ key: 'z', metaKey: true }))).toBe('undo')
    expect(historyActionFor(ev({ key: 'y', ctrlKey: true }))).toBe('redo')
    expect(historyActionFor(ev({ key: 'Z', ctrlKey: true, shiftKey: true }))).toBe('redo')
    expect(historyActionFor(ev({ key: 'z', metaKey: true, shiftKey: true }))).toBe('redo')
  })
  it('ignores other keys and modifiers', () => {
    expect(historyActionFor(ev({ key: 'z' }))).toBeNull()
    expect(historyActionFor(ev({ key: 'z', ctrlKey: true, altKey: true }))).toBeNull()
    expect(historyActionFor(ev({ key: 'x', ctrlKey: true }))).toBeNull()
  })
})

describe('window shortcuts', () => {
  it('Ctrl+Z undoes and Ctrl+Y / Ctrl+Shift+Z redo on the page', () => {
    const e = press(document.body, { key: 'z', ctrlKey: true })
    expect(e.defaultPrevented).toBe(true)
    expect(ops()).toBe(0)
    press(document.body, { key: 'y', ctrlKey: true })
    expect(ops()).toBe(1)
    press(document.body, { key: 'z', ctrlKey: true })
    press(document.body, { key: 'Z', ctrlKey: true, shiftKey: true })
    expect(ops()).toBe(1)
  })

  it('does nothing inside Monaco', () => {
    const editor = document.createElement('div')
    editor.className = 'monaco-editor'
    const area = document.createElement('div')
    area.tabIndex = 0
    editor.appendChild(area)
    document.body.appendChild(editor)
    const e = press(area, { key: 'z', ctrlKey: true })
    expect(e.defaultPrevented).toBe(false)
    expect(ops()).toBe(1)
  })

  it.each(['input', 'textarea', 'select'])('does nothing in a <%s>', (tag) => {
    const field = document.createElement(tag)
    document.body.appendChild(field)
    field.focus()
    press(field, { key: 'z', ctrlKey: true })
    expect(ops()).toBe(1)
  })

  it('does nothing after the listener is removed', () => {
    cleanups.pop()!()
    press(document.body, { key: 'z', ctrlKey: true })
    expect(ops()).toBe(1)
  })
})
