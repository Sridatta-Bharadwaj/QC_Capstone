// @vitest-environment jsdom
// V2-7: keep-any-subset views in the Density Matrices and Partial Trace Steps tabs.
// In jsdom there is no Worker, so the subset EngineClient computes synchronously.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DensityMatricesPanel } from '../../src/components/BottomPanel/DensityMatricesPanel'
import { TraceStepsPanel } from '../../src/components/BottomPanel/TraceStepsPanel'
import { effectiveKeep, toggleKept, useKeepStore } from '../../src/components/Teaching/keepStore'
import { useCircuitStore } from '../../src/model/store'
import { ghz, presetCircuit, seed } from './seed'

afterEach(cleanup)

const keepQubits = (custom: number[]) => act(() => useKeepStore.setState({ custom }))
const cellsOf = (testId: string) =>
  Array.from(screen.getByTestId(testId).querySelectorAll('td.matrix__cell')).map(
    (td) => td.textContent,
  )

describe('keep store', () => {
  it('defaults to the selected qubit and follows selection changes', () => {
    seed(presetCircuit('ghz3'), 1)
    expect(effectiveKeep(useKeepStore.getState().custom, 1, 3)).toEqual([1])
    toggleKept(2, [1])
    expect(useKeepStore.getState().custom).toEqual([1, 2])
    useCircuitStore.getState().selectQubit(0)
    expect(useKeepStore.getState().custom).toBeNull()
  })

  it('never removes the last kept qubit; one left becomes the selection', () => {
    seed(presetCircuit('ghz3'), 1)
    toggleKept(1, [1])
    expect(useCircuitStore.getState().selectedQubit).toBe(1)
    expect(useKeepStore.getState().custom).toBeNull()
    toggleKept(0, [0, 1])
    expect(useCircuitStore.getState().selectedQubit).toBe(1)
    expect(useKeepStore.getState().custom).toBeNull()
  })

  it('drops kept qubits that no longer exist', () => {
    expect(effectiveKeep([0, 3], 1, 3)).toEqual([1])
    expect(effectiveKeep([0, 1, 3], 1, 3)).toEqual([0, 1])
    expect(effectiveKeep(null, null, 3)).toEqual([])
  })
})

describe('Density Matrices with several kept qubits', () => {
  it('GHZ(3) keep q0, q2: mixed 4×4 ρ, purity 0.5, entropy 1 bit', () => {
    seed(presetCircuit('ghz3'), 0)
    keepQubits([0, 2])
    render(<DensityMatricesPanel />)

    expect(screen.getByRole('heading', { name: 'Reduced density matrix — q0, q2' })).toBeVisible()
    expect(screen.getByTestId('subset-explanation')).toHaveTextContent(
      'Keeps q0, q2 and traces out q1',
    )
    const reduced = cellsOf('reduced-rho')
    expect(reduced).toHaveLength(16)
    expect([reduced[0], reduced[15]]).toEqual(['0.500', '0.500'])
    expect(reduced.filter((v) => v === '0.000')).toHaveLength(14)
    expect(screen.getByTestId('purity')).toHaveTextContent('0.500')
    expect(screen.getByTestId('entropy')).toHaveTextContent('1.000')
    expect(screen.getByTestId('mixed-note')).toHaveTextContent('q0, q2 are mixed together')
    expect(cellsOf('full-rho')).toHaveLength(64)
  })

  it('outlines the full-ρ entries summed into a hovered entry', () => {
    seed(presetCircuit('ghz3'), 0)
    keepQubits([0, 2])
    render(<DensityMatricesPanel />)
    const cells = screen.getByTestId('reduced-rho').querySelectorAll('td.matrix__cell')
    fireEvent.mouseEnter(cells[3]) // ρ[00][11]: rows |0·0⟩, columns |1·1⟩, q1 equal
    expect(screen.getByTestId('full-rho').querySelectorAll('.matrix__cell--marked')).toHaveLength(2)
  })

  it('Bell pair kept together is pure', () => {
    seed(presetCircuit('bell'), 0)
    keepQubits([0, 1])
    render(<DensityMatricesPanel />)
    expect(screen.getByTestId('subset-explanation')).toHaveTextContent('Nothing is traced out')
    expect(screen.getByTestId('purity')).toHaveTextContent('1.000')
    expect(screen.getByTestId('entropy')).toHaveTextContent('0.000')
  })

  it('more than 3 kept qubits: too large to display, purity and entropy still shown', () => {
    seed(ghz(5), 0)
    keepQubits([0, 1, 2, 3])
    render(<DensityMatricesPanel />)
    expect(screen.getByTestId('reduced-too-large')).toHaveTextContent('16×16 — too large')
    expect(screen.queryByTestId('reduced-rho')).not.toBeInTheDocument()
    expect(screen.getByTestId('purity')).toHaveTextContent('0.500')
    expect(screen.getByTestId('entropy')).toHaveTextContent('1.000')
    expect(screen.getByTestId('too-large')).toHaveTextContent('Full ρ is 32×32')
  })

  it('selecting a qubit elsewhere goes back to the single-qubit view', () => {
    seed(presetCircuit('ghz3'), 0)
    keepQubits([0, 2])
    render(<DensityMatricesPanel />)
    act(() => useCircuitStore.getState().selectQubit(1))
    expect(screen.getByRole('heading', { name: 'Reduced density matrix — q1' })).toBeVisible()
    expect(screen.getByTestId('bloch-r')).toBeInTheDocument()
  })
})

describe('Partial Trace Steps with several kept qubits', () => {
  it('GHZ(3) keep q0, q1: per-entry sums and the direct-method check', () => {
    seed(presetCircuit('ghz3'), 0)
    keepQubits([0, 1])
    render(<TraceStepsPanel />)

    expect(
      screen.getByRole('heading', { name: 'Partial trace — keep q0, q1, trace out q2' }),
    ).toBeVisible()
    // Only ρ[00][00] and ρ[11][11] have non-zero terms.
    expect(screen.getByTestId('hidden-entries')).toHaveTextContent(
      '14 of 16 entries have only zero terms',
    )
    const e = screen.getByTestId('subset-entry-00-00')
    expect(e).toHaveTextContent('ρ0,1[00][00] = Σ ρ[|00·⟩][|00·⟩]')
    expect(within(e).getByTestId('entry-sum')).toHaveTextContent('0.500')
    expect(screen.getByTestId('subset-entry-11-11')).toBeInTheDocument()
    expect(screen.queryByTestId('subset-entry-00-11')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show all entries' }))
    // ρ[00][11] sums ρ[|000⟩][|110⟩] + ρ[|001⟩][|111⟩] = 0 + 0: the coherence is lost.
    expect(screen.getByTestId('subset-entry-00-11')).toHaveTextContent('All 2 terms are 0.')

    expect(cellsOf('explicit-reduced')).toHaveLength(16)
    expect(screen.getByTestId('check-line')).toHaveTextContent('gives the same matrix')
    expect(screen.getByTestId('entropy')).toHaveTextContent('1.000')
  })

  it('n = 5: full ρ too large, but the entries are still listed', () => {
    seed(ghz(5), 0)
    keepQubits([0, 4])
    render(<TraceStepsPanel />)
    expect(screen.getByTestId('too-large')).toHaveTextContent('Full ρ is 32×32')
    const e = screen.getByTestId('subset-entry-11-11')
    expect(e).toHaveTextContent('Σ ρ[|1···1⟩][|1···1⟩]')
    expect(within(e).getByRole('button')).toHaveTextContent('Show all 8 terms')
  })

  it('more than 3 kept qubits: no entries, purity and entropy still shown', () => {
    seed(ghz(4), 0)
    keepQubits([0, 1, 2, 3])
    render(<TraceStepsPanel />)
    expect(screen.getByTestId('entries-too-many')).toHaveTextContent('256 entries')
    expect(screen.getByTestId('purity')).toHaveTextContent('1.000')
    expect(screen.getByTestId('entropy')).toHaveTextContent('0.000')
  })
})
