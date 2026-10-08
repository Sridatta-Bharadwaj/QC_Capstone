// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoticeArea } from '../../src/components/Notices/NoticeArea'
import { clearNotices, showNotice, useNoticeStore } from '../../src/components/Notices/noticeStore'
import { TitleBar } from '../../src/components/TitleBar/TitleBar'
import { startHistoryTracking } from '../../src/history/history'
import { circuitsEqual } from '../../src/model/circuit'
import { useCircuitStore } from '../../src/model/store'
import { MAX_OPERATIONS } from '../../src/model/types'
import { LINK_COPIED_MESSAGE, LINK_FALLBACK_MESSAGE } from '../../src/persistence/copyLink'
import { decodeCircuitHash } from '../../src/persistence/shareLink'

const initial = useCircuitStore.getState()
let stop: () => void = () => {}

beforeEach(() => {
  useCircuitStore.setState(initial, true)
  stop = startHistoryTracking()
  clearNotices()
})

afterEach(() => {
  cleanup()
  stop()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const button = (name: RegExp) => screen.getByRole('button', { name })

describe('TitleBar circuit actions', () => {
  it('disables Undo, Redo and New circuit on a fresh workspace, with reasons', () => {
    render(<TitleBar />)
    expect(button(/^Undo/)).toBeDisabled()
    expect(button(/^Undo/)).toHaveAttribute('title', expect.stringMatching(/nothing to undo/))
    expect(button(/^Redo/)).toBeDisabled()
    expect(button(/^New circuit/)).toBeDisabled()
    expect(button(/^New circuit/)).toHaveAttribute('title', expect.stringMatching(/already empty/))
    expect(button(/^Copy link/)).toBeEnabled()
  })

  it('enables Undo after an edit; Undo then enables Redo', () => {
    render(<TitleBar />)
    act(() => {
      useCircuitStore.getState().addOperation({ gate: 'H', column: 0, qubits: [0] })
    })
    expect(button(/^Undo/)).toBeEnabled()
    expect(button(/^New circuit/)).toBeEnabled()
    fireEvent.click(button(/^Undo/))
    expect(useCircuitStore.getState().circuit.operations).toHaveLength(0)
    expect(button(/^Undo/)).toBeDisabled()
    expect(button(/^Redo/)).toBeEnabled()
    fireEvent.click(button(/^Redo/))
    expect(useCircuitStore.getState().circuit.operations).toHaveLength(1)
  })

  it('New circuit clears the workspace and can be undone', () => {
    render(<TitleBar />)
    act(() => useCircuitStore.getState().loadPreset('ghz3'))
    fireEvent.click(button(/^New circuit/))
    expect(useCircuitStore.getState().circuit.numQubits).toBe(2)
    expect(useCircuitStore.getState().circuit.operations).toHaveLength(0)
    fireEvent.click(button(/^Undo/))
    expect(useCircuitStore.getState().circuit.numQubits).toBe(3)
  })
})

describe('Copy link', () => {
  it('writes a decodable link to the clipboard and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    act(() => useCircuitStore.getState().loadPreset('bell'))
    render(
      <>
        <TitleBar />
        <NoticeArea />
      </>,
    )
    fireEvent.click(button(/^Copy link/))
    await screen.findByText(LINK_COPIED_MESSAGE)
    const url = (writeText.mock.calls[0] as unknown as [string])[0]
    const decoded = decodeCircuitHash(url.slice(url.indexOf('#')))
    expect(
      'circuit' in decoded && circuitsEqual(decoded.circuit, useCircuitStore.getState().circuit),
    ).toBe(true)
  })

  it('falls back to a selected read-only field when the clipboard fails', async () => {
    const writeText = vi.fn(() => Promise.reject(new Error('denied')))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(
      <>
        <TitleBar />
        <NoticeArea />
      </>,
    )
    fireEvent.click(button(/^Copy link/))
    await screen.findByText(LINK_FALLBACK_MESSAGE)
    const field = screen.getByRole('textbox', { name: 'Shareable link' })
    expect(field).toHaveAttribute('readonly')
    expect((field as HTMLInputElement).value).toMatch(/#c=/)
    await waitFor(() => expect(document.activeElement).toBe(field))
  })

  it('falls back when there is no clipboard API', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    render(<NoticeArea />)
    const { copyShareLink } = await import('../../src/persistence/copyLink')
    await act(() => copyShareLink())
    expect(screen.getByText(LINK_FALLBACK_MESSAGE)).toBeInTheDocument()
  })

  it('says the circuit is too large instead of copying an oversize link', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const operations = Array.from({ length: MAX_OPERATIONS }, (_, i) => ({
      id: `op${i}`,
      gate: 'RX' as const,
      column: i,
      qubits: [i % 6],
      angle: 0.123456789 + i,
    }))
    act(() =>
      useCircuitStore
        .getState()
        .setCircuit({ numQubits: 6, initialStates: Array(6).fill('0'), operations }, 'file'),
    )
    render(
      <>
        <TitleBar />
        <NoticeArea />
      </>,
    )
    fireEvent.click(button(/^Copy link/))
    await screen.findByText(/too large to share/)
    expect(writeText).not.toHaveBeenCalled()
  })
})

describe('NoticeArea', () => {
  it('renders notices as text with role=status and dismisses them', () => {
    render(<NoticeArea />)
    act(() => {
      showNotice('<b>not html</b>', { kind: 'warning' })
    })
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('<b>not html</b>')
    expect(notice.querySelector('b')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss notice' }))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('auto-dismisses info notices, keeps warnings, and caps the count', () => {
    vi.useFakeTimers()
    try {
      showNotice('info')
      showNotice('warn', { kind: 'warning' })
      vi.advanceTimersByTime(5000)
      expect(useNoticeStore.getState().notices.map((n) => n.message)).toEqual(['warn'])
      for (const m of ['a', 'b', 'c', 'd']) showNotice(m, { kind: 'warning' })
      expect(useNoticeStore.getState().notices.map((n) => n.message)).toEqual(['b', 'c', 'd'])
      // Same message again replaces the old one instead of stacking.
      showNotice('c', { kind: 'warning' })
      expect(useNoticeStore.getState().notices.map((n) => n.message)).toEqual(['b', 'd', 'c'])
    } finally {
      vi.useRealTimers()
    }
  })
})
