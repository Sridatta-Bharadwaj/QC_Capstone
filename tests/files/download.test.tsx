// @vitest-environment jsdom
// Downloads (V2-3): file names, generated content, the Blob + object URL save, the menu, and
// the pure PNG layout / text (jsdom has no WebGL, so the drawing itself is checked in a browser).
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DownloadMenu } from '../../src/components/CodePanel/FileActions'
import { clearNotices, useNoticeStore } from '../../src/components/Notices/noticeStore'
import { toQasm, toQiskit } from '../../src/codegen'
import type { QubitAnalysis } from '../../src/engine/types'
import {
  PNG_METRICS,
  STATS_ROWS,
  blochCardText,
  blochPngLayout,
  blochPngTitle,
  mapLabelPoint,
  pngColumns,
} from '../../src/files/blochPng'
import {
  codeFileText,
  downloadCode,
  downloadFilename,
  fileTimestamp,
} from '../../src/files/download'
import { PRESETS } from '../../src/model/presets'
import { useCircuitStore } from '../../src/model/store'
import { parseQasm } from '../../src/parser/qasm'
import { parseQiskit } from '../../src/parser/qiskit'

const DATE = new Date(2026, 9, 8, 9, 5) // 8 Oct 2026, 09:05 local time

describe('file names', () => {
  it('timestamps are local time, zero-padded and file-name safe', () => {
    expect(fileTimestamp(DATE)).toBe('20261008-0905')
    expect(fileTimestamp(new Date(2026, 11, 31, 23, 59))).toBe('20261231-2359')
  })

  it.each([
    ['qasm', 'circuit-20261008-0905.qasm'],
    ['py', 'circuit-20261008-0905.py'],
    ['png', 'bloch-spheres-20261008-0905.png'],
  ] as const)('%s → %s', (kind, name) => {
    expect(downloadFilename(kind, DATE)).toBe(name)
    expect(name).toMatch(/^[a-z0-9.-]+$/)
  })
})

describe('code downloads', () => {
  it('content is generated from the model and parses back to the same circuit', () => {
    for (const preset of PRESETS) {
      const c = preset.circuit
      expect(codeFileText('qasm', c)).toBe(toQasm(c))
      expect(codeFileText('py', c)).toBe(toQiskit(c))
      // Same text after a round trip (layouts with gaps are normalised, see CONTEXT.md).
      expect(toQasm(parseQasm(codeFileText('qasm', c)).circuit!)).toBe(toQasm(c))
      expect(parseQiskit(codeFileText('py', c)).problems).toEqual([])
    }
  })

  it('saves through a temporary <a download> and revokes the object URL', async () => {
    vi.useFakeTimers()
    const create = vi.fn(() => 'blob:local/1')
    const revoke = vi.fn()
    const urlApi = URL as unknown as Record<string, unknown>
    const saved = { create: urlApi.createObjectURL, revoke: urlApi.revokeObjectURL }
    urlApi.createObjectURL = create
    urlApi.revokeObjectURL = revoke
    const clicks: { href: string; download: string; inDocument: boolean }[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push({
        href: this.href,
        download: this.download,
        inDocument: document.body.contains(this),
      })
    })
    try {
      const circuit = PRESETS[0].circuit
      const name = downloadCode('qasm', circuit, DATE)
      expect(name).toBe('circuit-20261008-0905.qasm')
      expect(clicks).toEqual([
        { href: 'blob:local/1', download: 'circuit-20261008-0905.qasm', inDocument: true },
      ])
      const blob = (create.mock.calls[0] as unknown as [Blob])[0]
      expect(blob.type).toBe('text/plain;charset=utf-8')
      expect(await blob.text()).toBe(toQasm(circuit))
      expect(document.querySelector('a[download]')).toBeNull() // link removed again
      expect(revoke).not.toHaveBeenCalled()
      vi.runAllTimers()
      expect(revoke).toHaveBeenCalledWith('blob:local/1')
    } finally {
      click.mockRestore()
      urlApi.createObjectURL = saved.create
      urlApi.revokeObjectURL = saved.revoke
      vi.useRealTimers()
    }
  })
})

describe('Download menu', () => {
  beforeEach(() => clearNotices())
  afterEach(() => {
    cleanup()
    clearNotices()
  })

  it('opens from the keyboard, moves with arrows and closes with Escape', () => {
    render(<DownloadMenu />)
    const button = screen.getByRole('button', { name: 'Download' })
    expect(button.getAttribute('aria-haspopup')).toBe('menu')
    fireEvent.keyDown(button, { key: 'ArrowDown' })
    const items = screen.getAllByRole('menuitem')
    expect(items.map((i) => i.textContent)).toEqual([
      'OpenQASM 2.0.qasm',
      'Qiskit Python.py',
      'Bloch spheres.png',
    ])
    expect(document.activeElement).toBe(items[0])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' })
    expect(document.activeElement).toBe(items[2])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('choosing Qiskit Python downloads the .py file and says so', () => {
    const urlApi = URL as unknown as Record<string, unknown>
    const saved = { create: urlApi.createObjectURL, revoke: urlApi.revokeObjectURL }
    urlApi.createObjectURL = () => 'blob:local/2'
    urlApi.revokeObjectURL = () => {}
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      render(<DownloadMenu />)
      fireEvent.click(screen.getByRole('button', { name: 'Download' }))
      act(() => fireEvent.click(screen.getByRole('menuitem', { name: /Qiskit Python/ })))
      expect(click).toHaveBeenCalledTimes(1)
      expect(useNoticeStore.getState().notices[0].message).toMatch(
        /^Downloaded circuit-\d{8}-\d{4}\.py$/,
      )
      expect(useCircuitStore.getState().circuit).toBeDefined()
    } finally {
      click.mockRestore()
      urlApi.createObjectURL = saved.create
      urlApi.revokeObjectURL = saved.revoke
    }
  })
})

describe('PNG composition (pure helpers)', () => {
  const qubit = (q: number, entangled: boolean): QubitAnalysis => ({
    qubit: q,
    rho: [],
    bloch: entangled ? { x: 0, y: -0, z: 0 } : { x: 1, y: 0, z: -0.25 },
    length: entangled ? 0 : 1,
    purity: entangled ? 0.5 : 1,
    entangled,
  })

  it.each([
    [1, 1, 1],
    [2, 2, 1],
    [3, 3, 1],
    [4, 2, 2],
    [5, 3, 2],
    [6, 3, 2],
  ])('%i qubits → %i columns × %i rows', (n, columns, rows) => {
    const layout = blochPngLayout(n)
    expect(pngColumns(n)).toBe(columns)
    expect(layout).toMatchObject({ columns, rows })
    expect(layout.cards).toHaveLength(n)
  })

  it('cards fit inside the image, do not overlap, and the sphere sits inside its card', () => {
    for (let n = 1; n <= 6; n++) {
      const { width, height, cards } = blochPngLayout(n)
      for (const [i, c] of cards.entries()) {
        expect(c.card.x).toBeGreaterThanOrEqual(PNG_METRICS.margin)
        expect(c.card.x + c.card.width).toBeLessThanOrEqual(width - PNG_METRICS.margin)
        expect(c.card.y + c.card.height).toBeLessThanOrEqual(height - PNG_METRICS.margin)
        expect(c.sphere.x).toBeGreaterThan(c.card.x)
        expect(c.sphere.y + c.sphere.height).toBeLessThan(c.stats.y)
        expect(c.stats.y + STATS_ROWS * PNG_METRICS.row).toBeLessThanOrEqual(
          c.card.y + c.card.height,
        )
        for (const other of cards.slice(i + 1)) {
          const apart =
            other.card.x >= c.card.x + c.card.width || other.card.y >= c.card.y + c.card.height
          expect(apart).toBe(true)
        }
      }
    }
  })

  it('card text: name, pure / mixed, and the same numbers as the app', () => {
    expect(blochCardText(qubit(0, false))).toEqual({
      title: 'q0',
      state: 'pure',
      rows: [
        { key: 'x', value: '1.000', axis: 'x' },
        { key: 'y', value: '0.000', axis: 'y' },
        { key: 'z', value: '−0.250', axis: 'z' },
        { key: '|r|', value: '1.000' },
        { key: 'purity', value: '1.000' },
      ],
    })
    const mixed = blochCardText(qubit(3, true))
    expect(mixed.title).toBe('q3')
    expect(mixed.state).toBe('mixed · entangled')
    expect(mixed.rows[1].value).toBe('0.000') // no "−0.000"
  })

  it('title and label mapping', () => {
    expect(blochPngTitle(1)).toBe('Bloch spheres · 1 qubit')
    expect(blochPngTitle(4)).toBe('Bloch spheres · 4 qubits')
    // A label at the centre of a 100 px live sphere lands at the centre of the 200 px image one.
    const target = { x: 10, y: 20, width: 200, height: 200 }
    expect(mapLabelPoint({ x: 50, y: 50 }, 100, target)).toEqual({ x: 110, y: 120, scale: 2 })
  })
})
