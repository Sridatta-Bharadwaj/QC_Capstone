// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlochPanel } from '../../src/components/BottomPanel/BlochPanel'
import { emptyCircuit } from '../../src/model/circuit'
import { useCircuitStore, useResultsStore } from '../../src/model/store'
import { VECTORS, mockQubit } from './mockVectors'

// WebGL is not available in jsdom: replace the 3D sphere with a plain element.
vi.mock('../../src/components/Bloch/BlochSphere', () => ({
  BlochSphere: () => <div data-testid="sphere" />,
}))

afterEach(cleanup)

beforeEach(() => {
  useCircuitStore.setState({ circuit: emptyCircuit(3), selectedQubit: null })
  useResultsStore.setState({ analysis: null })
})

describe('BlochPanel', () => {
  it('shows one skeleton card per qubit while there are no results yet', () => {
    render(<BlochPanel />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading Bloch spheres')
    expect(document.querySelectorAll('.bloch-card--skeleton')).toHaveLength(3)
    expect(document.querySelectorAll('.skeleton--circle')).toHaveLength(3)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('renders a card per qubit once the analysis arrives', async () => {
    render(<BlochPanel />)
    const qubits = [VECTORS.zero, VECTORS.maximallyMixed].map((v, k) => mockQubit(k, v))
    act(() => {
      useResultsStore.getState().setResults({ numQubits: 2, state: [], qubits }, null)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(await screen.findAllByTestId('sphere')).toHaveLength(2)
  })
})
