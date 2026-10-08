// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearNotices, useNoticeStore } from '../../src/components/Notices/noticeStore'
import { circuitsEqual, emptyCircuit } from '../../src/model/circuit'
import { useHistoryStore } from '../../src/model/historyStore'
import { PRESETS } from '../../src/model/presets'
import { useCircuitStore } from '../../src/model/store'
import { MAX_URL_BYTES } from '../../src/model/types'
import {
  AUTOSAVE_DELAY_MS,
  MAX_SAVED_CHARS,
  readSavedCircuit,
  serializeCircuit,
  startAutosave,
  STORAGE_KEY,
  writeSavedCircuit,
} from '../../src/persistence/autosave'
import { encodeCircuitHash } from '../../src/persistence/shareLink'
import { initPersistence, SAVED_INVALID_MESSAGE } from '../../src/persistence/startup'

const initialCircuitState = useCircuitStore.getState()
const bell = PRESETS.find((p) => p.id === 'bell')!.circuit
const ghz = PRESETS.find((p) => p.id === 'ghz3')!.circuit

let stops: (() => void)[] = []

beforeEach(() => {
  useCircuitStore.setState(initialCircuitState, true)
  useHistoryStore.getState().reset(initialCircuitState.circuit)
  clearNotices()
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  for (const stop of stops) stop()
  stops = []
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const circuit = () => useCircuitStore.getState().circuit
const messages = () => useNoticeStore.getState().notices.map((n) => n.message)

function start() {
  stops.push(initPersistence())
}

describe('readSavedCircuit / writeSavedCircuit', () => {
  it('returns null when nothing is saved', () => {
    expect(readSavedCircuit()).toBeNull()
  })

  it('round-trips a circuit', () => {
    expect(writeSavedCircuit(bell)).toBe(true)
    const result = readSavedCircuit()
    expect(result && 'circuit' in result && circuitsEqual(result.circuit, bell)).toBe(true)
  })

  it.each([
    ['non-JSON', 'not json {'],
    ['JSON that is not a circuit', '{"numQubits":99,"operations":[]}'],
    ['a JSON array', '[1,2,3]'],
    ['a prototype-pollution attempt', '{"__proto__":{"numQubits":1,"operations":[]}}'],
    ['a huge value', 'x'.repeat(MAX_SAVED_CHARS + 1)],
  ])('discards %s and removes the key', (_, raw) => {
    window.localStorage.setItem(STORAGE_KEY, raw)
    const result = readSavedCircuit()
    expect(result).toHaveProperty('error')
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('treats storage whose getItem throws as empty', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readSavedCircuit()).toBeNull()
  })

  it('returns false when setItem throws (quota)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(writeSavedCircuit(bell)).toBe(false)
  })

  it('treats a localStorage getter that throws as unavailable', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(readSavedCircuit()).toBeNull()
    expect(writeSavedCircuit(bell)).toBe(false)
  })

  it('saves without operation ids', () => {
    expect(serializeCircuit(bell)).not.toMatch(/"id"/)
  })
})

describe('autosave', () => {
  it('writes once, 500 ms after the last change', () => {
    vi.useFakeTimers()
    stops.push(startAutosave())
    const { addOperation } = useCircuitStore.getState()
    addOperation({ gate: 'H', column: 0, qubits: [0] })
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100)
    addOperation({ gate: 'X', column: 0, qubits: [1] })
    vi.advanceTimersByTime(AUTOSAVE_DELAY_MS - 100)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    vi.advanceTimersByTime(100)
    const saved = readSavedCircuit()
    expect(saved && 'circuit' in saved && saved.circuit.operations).toHaveLength(2)
  })

  it('flushes a pending save when the page is hidden', () => {
    vi.useFakeTimers()
    stops.push(startAutosave())
    useCircuitStore.getState().addOperation({ gate: 'H', column: 0, qubits: [0] })
    window.dispatchEvent(new Event('pagehide'))
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()
  })

  it('keeps working when storage throws on every access', () => {
    vi.useFakeTimers()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    start()
    useCircuitStore.getState().addOperation({ gate: 'H', column: 0, qubits: [0] })
    expect(() => vi.advanceTimersByTime(AUTOSAVE_DELAY_MS)).not.toThrow()
    expect(circuit().operations).toHaveLength(1)
  })
})

describe('startup load order', () => {
  it('starts with the default circuit when there is nothing saved', () => {
    start()
    expect(circuitsEqual(circuit(), emptyCircuit(2))).toBe(true)
    expect(messages()).toEqual([])
    expect(useHistoryStore.getState().canUndo).toBe(false)
  })

  it('restores the saved circuit (source restore) and resets the history to it', () => {
    writeSavedCircuit(bell)
    start()
    expect(circuitsEqual(circuit(), bell)).toBe(true)
    expect(useCircuitStore.getState().lastSource).toBe('restore')
    const h = useHistoryStore.getState()
    expect(h.entries).toHaveLength(1)
    expect(h.canUndo).toBe(false)
  })

  it('discards an invalid saved circuit with a notice and starts from the default', () => {
    window.localStorage.setItem(STORAGE_KEY, '{"numQubits": "two"}')
    start()
    expect(circuitsEqual(circuit(), emptyCircuit(2))).toBe(true)
    expect(messages()).toEqual([SAVED_INVALID_MESSAGE])
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('prefers a valid link over the saved circuit, saves it and clears the hash', () => {
    writeSavedCircuit(bell)
    const encoded = encodeCircuitHash(ghz) as { hash: string }
    window.history.replaceState(null, '', '/app/' + encoded.hash)
    start()
    expect(circuitsEqual(circuit(), ghz)).toBe(true)
    expect(useCircuitStore.getState().lastSource).toBe('url')
    expect(window.location.hash).toBe('')
    expect(window.location.pathname).toBe('/app/')
    const saved = readSavedCircuit()
    expect(saved && 'circuit' in saved && circuitsEqual(saved.circuit, ghz)).toBe(true)
    expect(useHistoryStore.getState().canUndo).toBe(false)
  })

  it('falls back to the saved circuit when the link is invalid', () => {
    writeSavedCircuit(bell)
    window.history.replaceState(null, '', '/#c=%%%')
    start()
    expect(circuitsEqual(circuit(), bell)).toBe(true)
    expect(messages()).toHaveLength(1)
    expect(messages()[0]).toMatch(/^Link .*saved circuit instead\.$/)
    expect(window.location.hash).toBe('')
  })

  it('falls back when the link is oversize', () => {
    window.history.replaceState(null, '', '/#c=' + 'A'.repeat(MAX_URL_BYTES))
    start()
    expect(circuitsEqual(circuit(), emptyCircuit(2))).toBe(true)
    expect(messages()[0]).toMatch(/too large/)
  })

  it('ignores hashes that are not circuit links', () => {
    writeSavedCircuit(bell)
    window.history.replaceState(null, '', '/#section')
    start()
    expect(circuitsEqual(circuit(), bell)).toBe(true)
    expect(messages()).toEqual([])
    expect(window.location.hash).toBe('#section')
  })

  it('loads a link pasted into an open tab as an undoable change', () => {
    start()
    const encoded = encodeCircuitHash(bell) as { hash: string }
    window.history.replaceState(null, '', '/' + encoded.hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(circuitsEqual(circuit(), bell)).toBe(true)
    expect(useCircuitStore.getState().lastSource).toBe('url')
    expect(useHistoryStore.getState().canUndo).toBe(true)
    expect(window.location.hash).toBe('')
  })

  it('keeps the current circuit when a pasted link is invalid', () => {
    writeSavedCircuit(bell)
    start()
    window.history.replaceState(null, '', '/#c=bad!')
    window.dispatchEvent(new HashChangeEvent('hashchange'))
    expect(circuitsEqual(circuit(), bell)).toBe(true)
    expect(messages()[0]).toMatch(/Keeping the current circuit\.$/)
  })
})
