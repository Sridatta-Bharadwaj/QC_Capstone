// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { StatusBar } from '../../src/components/StatusBar/StatusBar'
import { useResultsStore } from '../../src/model/store'
import { presetCircuit, seed } from './seed'

afterEach(cleanup)

describe('StatusBar', () => {
  it('lists entangled qubits and per-qubit purity for a Bell state', () => {
    seed(presetCircuit('bell'), null)
    render(<StatusBar />)
    expect(screen.getByTestId('status-qubits')).toHaveTextContent('2 / 6 qubits')
    expect(screen.getByTestId('status-entangled')).toHaveTextContent('Entangled: q0, q1')
    expect(screen.getByTestId('status-purity')).toHaveTextContent('Purity q0 0.500 · q1 0.500')
    expect(screen.queryByTestId('status-computing')).not.toBeInTheDocument()
    expect(screen.queryByTestId('status-error')).not.toBeInTheDocument()
  })

  it('reports no entanglement for a product state', () => {
    seed(presetCircuit('product'), null)
    render(<StatusBar />)
    expect(screen.getByTestId('status-qubits')).toHaveTextContent('3 / 6 qubits')
    expect(screen.getByTestId('status-entangled')).toHaveTextContent('No entanglement')
    expect(screen.getByTestId('status-purity')).toHaveTextContent('q0 1.000 · q1 1.000 · q2 1.000')
  })

  it('shows Computing… and engine errors only when present', () => {
    seed(presetCircuit('w3'), null)
    render(<StatusBar />)
    expect(screen.getByTestId('status-entangled')).toHaveTextContent('Entangled: q0, q1, q2')
    act(() => useResultsStore.setState({ computing: true, error: 'boom' }))
    expect(screen.getByTestId('status-computing')).toHaveTextContent('Computing…')
    expect(screen.getByTestId('status-error')).toHaveTextContent('Engine error: boom')
  })
})
