// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlochCard } from '../../src/components/Bloch/BlochCard'
import { BlochGrid } from '../../src/components/Bloch/BlochGrid'
import type { BlochSphereProps } from '../../src/components/Bloch/BlochSphere'
import { useCircuitStore } from '../../src/model/store'
import { useUiStore } from '../../src/model/uiStore'
import { VECTORS, mockQubit } from './mockVectors'

// WebGL is not available in jsdom: replace the 3D sphere with a plain element.
vi.mock('../../src/components/Bloch/BlochSphere', () => ({
  BlochSphere: ({ vector }: BlochSphereProps) => (
    <div data-testid="sphere" data-vector={`${vector.x},${vector.y},${vector.z}`} />
  ),
}))

afterEach(cleanup)

beforeEach(() => {
  useCircuitStore.setState({ selectedQubit: null })
  useUiStore.setState({ bottomTab: 'bloch' })
})

describe('BlochCard', () => {
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

  it('shows the mixed marker only for entangled (mixed) qubits', () => {
    const { rerender } = render(<BlochCard data={mockQubit(0, VECTORS.plus)} />)
    expect(screen.queryByText(/entangled with other qubits/)).not.toBeInTheDocument()
    expect(screen.getByText('pure')).toBeInTheDocument()

    rerender(<BlochCard data={mockQubit(0, VECTORS.maximallyMixed)} />)
    expect(screen.getByText('mixed — entangled with other qubits')).toBeInTheDocument()
    expect(screen.getByTestId('bloch-purity')).toHaveTextContent('0.500')
  })

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
