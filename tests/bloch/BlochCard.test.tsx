// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlochCard } from '../../src/components/Bloch/BlochCard'
import { BlochGrid } from '../../src/components/Bloch/BlochGrid'
import type { BlochSphereProps } from '../../src/components/Bloch/BlochSphere'
import { setWebGLSupportForTests } from '../../src/components/Bloch/webgl'
import { useCircuitStore } from '../../src/model/store'
import { useUiStore } from '../../src/model/uiStore'
import { VECTORS, mockQubit } from './mockVectors'

// WebGL is not available in jsdom: replace the 3D sphere with a plain element.
vi.mock('../../src/components/Bloch/BlochSphere', () => ({
  BlochSphere: ({ vector }: BlochSphereProps) => (
    <div data-testid="sphere" data-vector={`${vector.x},${vector.y},${vector.z}`} />
  ),
}))

// The 3D sphere is mocked above, so pretend WebGL exists (jsdom has none).
beforeEach(() => setWebGLSupportForTests(true))
afterEach(() => {
  cleanup()
  setWebGLSupportForTests(undefined)
})

beforeEach(() => {
  useCircuitStore.setState({ selectedQubit: null })
  useUiStore.setState({ bottomTab: 'bloch' })
})

describe('BlochCard', () => {
  it('uses the flat SVG sphere when WebGL is unavailable', () => {
    setWebGLSupportForTests(false)
    const { container } = render(<BlochCard data={mockQubit(0, VECTORS.plus)} />)
    expect(screen.queryByTestId('sphere')).toBeNull()
    expect(container.querySelector('.bloch-sphere--svg svg')).not.toBeNull()
  })

  it('shows the qubit name, the vector, |r| and purity to 3 decimals', async () => {
    render(<BlochCard data={mockQubit(2, VECTORS.wLike)} />)
    expect(screen.getByText('q2')).toBeInTheDocument()
    expect(screen.getByTestId('bloch-vector')).toHaveTextContent('(0.000, 0.000, 0.333)')
    expect(screen.getByTestId('bloch-length')).toHaveTextContent('0.333')
    expect(screen.getByTestId('bloch-purity')).toHaveTextContent('0.556')
    // The lazily loaded sphere receives the Bloch vector.
    expect(await screen.findByTestId('sphere')).toHaveAttribute(
      'data-vector',
      '0,0,0.3333333333333333',
    )
  })

  it('shows the mixed tag in the header only for entangled (mixed) qubits', () => {
    const { rerender } = render(<BlochCard data={mockQubit(0, VECTORS.plus)} />)
    expect(screen.queryByTestId('bloch-mixed')).not.toBeInTheDocument()
    expect(screen.getByText('pure')).toBeInTheDocument()

    rerender(<BlochCard data={mockQubit(0, VECTORS.maximallyMixed)} />)
    const tag = screen.getByTestId('bloch-mixed')
    expect(tag).toHaveTextContent('mixed · entangled')
    expect(tag).toHaveAttribute('title', 'Mixed state: this qubit is entangled with other qubits')
    expect(tag.closest('header')).not.toBeNull()
    expect(screen.queryByText('pure')).not.toBeInTheDocument()
    expect(screen.getByTestId('bloch-purity')).toHaveTextContent('0.500')
  })

  it('puts |r| and purity on one row under the vector', () => {
    render(<BlochCard data={mockQubit(0, VECTORS.wLike)} />)
    const rows = document.querySelectorAll('.bloch-card__row')
    expect(rows).toHaveLength(2)
    expect(rows[1]).toContainElement(screen.getByTestId('bloch-length'))
    expect(rows[1]).toContainElement(screen.getByTestId('bloch-purity'))
  })

  it.each(['side', 'stack'] as const)(
    'lists x, y, z, |r| and purity one per row when the stats are %s',
    (stats) => {
      render(<BlochCard data={mockQubit(0, VECTORS.wLike)} stats={stats} />)
      const rows = document.querySelectorAll('.bloch-card__row')
      expect([...rows].map((r) => r.querySelector('dt')?.textContent)).toEqual([
        'x',
        'y',
        'z',
        '|r|',
        'purity',
      ])
      expect(screen.getByTestId('bloch-z')).toHaveTextContent('0.333')
      expect(screen.getByTestId('bloch-purity')).toHaveTextContent('0.556')
      expect(document.querySelector(`.bloch-card__body--${stats}`)).not.toBeNull()
    },
  )

  it('selects the qubit on click and on Enter / Space, and marks the card selected', () => {
    render(<BlochCard data={mockQubit(1, VECTORS.zero)} />)
    const body = screen.getByRole('button', { name: 'Select q1' })
    expect(body).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(body)
    expect(useCircuitStore.getState().selectedQubit).toBe(1)
    expect(body).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('article')).toHaveAttribute('data-selected', 'true')
    expect(useUiStore.getState().bottomTab).toBe('bloch') // plain click keeps the spheres visible

    useCircuitStore.setState({ selectedQubit: null })
    fireEvent.keyDown(body, { key: 'Enter' })
    expect(useCircuitStore.getState().selectedQubit).toBe(1)

    useCircuitStore.setState({ selectedQubit: null })
    fireEvent.keyDown(body, { key: ' ' })
    expect(useCircuitStore.getState().selectedQubit).toBe(1)
  })

  it('"Reduced ρ" selects the qubit and switches to the Density Matrices tab', () => {
    render(<BlochCard data={mockQubit(3, VECTORS.plusI)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reduced ρ' }))
    expect(useCircuitStore.getState().selectedQubit).toBe(3)
    expect(useUiStore.getState().bottomTab).toBe('density')
  })
})

describe('BlochGrid', () => {
  it('renders one card per qubit in order', () => {
    const qubits = [VECTORS.zero, VECTORS.plus, VECTORS.plusI].map((v, k) => mockQubit(k, v))
    render(<BlochGrid qubits={qubits} />)
    const cards = screen.getAllByRole('article')
    expect(cards).toHaveLength(3)
    expect(within(cards[1]).getByTestId('bloch-vector')).toHaveTextContent('(1.000, 0.000, 0.000)')
  })
})
