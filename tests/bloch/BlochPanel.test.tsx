// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BlochPanel } from '../../src/components/BottomPanel/BlochPanel'
import { emptyCircuit } from '../../src/model/circuit'
import { setWebGLSupportForTests } from '../../src/components/Bloch/webgl'
import { useCircuitStore, useResultsStore } from '../../src/model/store'
import { VECTORS, mockQubit } from './mockVectors'

// WebGL is not available in jsdom: replace the 3D sphere with a plain element.
vi.mock('../../src/components/Bloch/BlochSphere', () => ({
  BlochSphere: () => <div data-testid="sphere" />,
}))

// The 3D sphere is mocked above, so pretend WebGL exists (jsdom has none).
beforeEach(() => setWebGLSupportForTests(true))
afterEach(() => {
  cleanup()
  setWebGLSupportForTests(undefined)
})

beforeEach(() => {
  useCircuitStore.setState({ circuit: emptyCircuit(3), selectedQubit: null })
  useResultsStore.setState({ analysis: null, computing: false })
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
    useCircuitStore.setState({ circuit: emptyCircuit(2) })
    render(<BlochPanel />)
    const qubits = [VECTORS.zero, VECTORS.maximallyMixed].map((v, k) => mockQubit(k, v))
    act(() => {
      useResultsStore.getState().setResults({ numQubits: 2, state: [], qubits }, null)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(await screen.findAllByTestId('sphere')).toHaveLength(2)
  })

  it('shows skeletons, not the old cards, while results belong to another qubit count', () => {
    // E.g. right after "Add qubit": the circuit has 3 qubits, the last reply had 2.
    const qubits = [VECTORS.zero, VECTORS.zero].map((v, k) => mockQubit(k, v))
    useResultsStore.setState({ analysis: { numQubits: 2, state: [], qubits } })
    render(<BlochPanel />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading Bloch spheres')
    expect(document.querySelectorAll('.bloch-card--skeleton')).toHaveLength(3)
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })

  it('hides the cards under a skeleton overlay while computing, keeping them mounted', async () => {
    useCircuitStore.setState({ circuit: emptyCircuit(2) })
    const qubits = [VECTORS.zero, VECTORS.maximallyMixed].map((v, k) => mockQubit(k, v))
    useResultsStore.setState({ analysis: { numQubits: 2, state: [], qubits }, computing: true })
    render(<BlochPanel />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading Bloch spheres')
    expect(document.querySelector('.bloch-panel__stale')).toHaveAttribute('aria-hidden', 'true')
    expect(document.querySelectorAll('.bloch-panel__stale .bloch-card')).toHaveLength(2)

    act(() => useResultsStore.getState().setComputing(false))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(await screen.findAllByTestId('sphere')).toHaveLength(2)
  })
})
