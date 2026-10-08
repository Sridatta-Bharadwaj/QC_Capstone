// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DensityMatricesPanel } from '../../src/components/BottomPanel/DensityMatricesPanel'
import { partialTraceExplicit } from '../../src/engine'
import { useCircuitStore, useResultsStore } from '../../src/model/store'
import { ghz, presetCircuit, seed } from './seed'

afterEach(cleanup)

const matrixCells = (testId: string) =>
  Array.from(screen.getByTestId(testId).querySelectorAll<HTMLElement>('td.matrix__cell'))

const cellsOf = (testId: string) => matrixCells(testId).map((td) => td.textContent)

describe('DensityMatricesPanel', () => {
  it('shows the reduced ρ of a Bell-state qubit with its derived quantities', () => {
    seed(presetCircuit('bell'), 1)
    render(<DensityMatricesPanel />)

    expect(screen.getByRole('heading', { name: 'Reduced density matrix — q1' })).toBeVisible()
    expect(cellsOf('reduced-rho')).toEqual(['0.500', '0.000', '0.000', '0.500'])
    expect(screen.getByTestId('bloch-r')).toHaveTextContent('(0.000, 0.000, 0.000)')
    expect(screen.getByTestId('bloch-length')).toHaveTextContent('0.000')
    expect(screen.getByTestId('purity')).toHaveTextContent('0.500')
    expect(screen.getByTestId('mixed-note')).toHaveTextContent('q1 is mixed')

    // Full ρ = |Φ⁺⟩⟨Φ⁺|: 0.5 in the four corners, 0 elsewhere.
    const full = cellsOf('full-rho')
    expect(full).toHaveLength(16)
    expect([full[0], full[3], full[12], full[15]]).toEqual(['0.500', '0.500', '0.500', '0.500'])
    expect(full.filter((v) => v === '0.000')).toHaveLength(12)
  })

  it('shows partial mixing for the W state', () => {
    seed(presetCircuit('w3'), 0)
    render(<DensityMatricesPanel />)
    // ρ₀ = diag(2/3, 1/3) → r = (0, 0, 1/3), purity (1 + 1/9)/2 = 5/9
    expect(cellsOf('reduced-rho')).toEqual(['0.667', '0.000', '0.000', '0.333'])
    expect(screen.getByTestId('bloch-r')).toHaveTextContent('(0.000, 0.000, 0.333)')
    expect(screen.getByTestId('purity')).toHaveTextContent('0.556')
    expect(cellsOf('full-rho')).toHaveLength(64)
  })

  it('marks a product-state qubit as pure', () => {
    seed(presetCircuit('product'), 2) // q2 = |+i⟩
    render(<DensityMatricesPanel />)
    expect(screen.getByTestId('bloch-r')).toHaveTextContent('(0.000, 1.000, 0.000)')
    expect(screen.getByTestId('mixed-note')).toHaveTextContent('q2 is pure')
  })

  it('selects q0 automatically when no qubit is selected', () => {
    seed(presetCircuit('bell'), null)
    render(<DensityMatricesPanel />)
    expect(useCircuitStore.getState().selectedQubit).toBe(0)
  })

  it('keeps more qubits from the Keep selector, and back to one', () => {
    seed(presetCircuit('bell'), 0)
    render(<DensityMatricesPanel />)
    expect(screen.getByRole('group', { name: 'Keep qubits' })).toBeInTheDocument()
    // The view is re-rendered on every change, so look the buttons up each time.
    const chip = (name: string) => screen.getByRole('button', { name })
    expect(chip('q0')).toHaveAttribute('aria-pressed', 'true')
    expect(chip('q0')).toHaveAttribute('aria-disabled', 'true') // the only kept qubit
    expect(chip('q1')).toHaveAttribute('aria-pressed', 'false')

    // Keep q0 and q1: the whole Bell pair, a pure 4×4 ρ.
    fireEvent.click(chip('q1'))
    expect(screen.getByRole('heading', { name: 'Reduced density matrix — q0, q1' })).toBeVisible()
    expect(chip('q1')).toHaveAttribute('aria-pressed', 'true')
    expect(cellsOf('reduced-rho')).toHaveLength(16)
    expect(screen.getByTestId('purity')).toHaveTextContent('1.000')
    expect(screen.getByTestId('entropy')).toHaveTextContent('0.000')

    // Drop q0: back to one kept qubit, which becomes the selected one (v1 view).
    fireEvent.click(chip('q0'))
    expect(useCircuitStore.getState().selectedQubit).toBe(1)
    expect(screen.getByRole('heading', { name: 'Reduced density matrix — q1' })).toBeVisible()
    expect(screen.getByTestId('entropy')).toHaveTextContent('1.000')
  })

  it('says the full ρ is too large at n = 5 but still shows the reduced ρ', () => {
    seed(ghz(5), 0)
    render(<DensityMatricesPanel />)
    expect(screen.getByTestId('too-large')).toHaveTextContent(
      'Full ρ is 32×32 — too large to display.',
    )
    expect(screen.queryByTestId('full-rho')).not.toBeInTheDocument()
    expect(cellsOf('reduced-rho')).toEqual(['0.500', '0.000', '0.000', '0.500'])
  })

  it('outlines the full-ρ entries summed into a hovered reduced entry', () => {
    seed(presetCircuit('bell'), 0)
    render(<DensityMatricesPanel />)
    const reduced = matrixCells('reduced-rho')
    fireEvent.mouseEnter(reduced[1]) // ρ₀[0][1]
    const marked = () => screen.getByTestId('full-rho').querySelectorAll('.matrix__cell--marked')
    // q0 kept: row |0x⟩, column |1x⟩, x equal → ρ[|00⟩][|10⟩] and ρ[|01⟩][|11⟩]
    expect(marked()).toHaveLength(2)
    fireEvent.mouseLeave(reduced[1])
    expect(marked()).toHaveLength(0)
  })

  it('shows a skeleton while computing', () => {
    seed(presetCircuit('bell'), 1)
    act(() => useResultsStore.setState({ computing: true }))
    render(<DensityMatricesPanel />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading density matrices')
    expect(screen.queryByTestId('reduced-rho')).not.toBeInTheDocument()
  })

  it('shows a skeleton for the full ρ while the explicit trace is for another qubit', () => {
    seed(presetCircuit('bell'), 1)
    const { state } = useResultsStore.getState().analysis!
    act(() => useResultsStore.setState({ explicit: partialTraceExplicit(state, 2, 0) }))
    render(<DensityMatricesPanel />)
    expect(screen.getByTestId('reduced-rho')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Loading full density matrix')
    expect(within(document.body).queryByTestId('full-rho')).not.toBeInTheDocument()
  })
})
