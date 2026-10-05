// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TraceStepsPanel } from '../../src/components/BottomPanel/TraceStepsPanel'
import { useCircuitStore, useResultsStore } from '../../src/model/store'
import { ghz, presetCircuit, seed } from './seed'

afterEach(cleanup)

const bodyRows = (el: HTMLElement) => el.querySelectorAll('tbody tr')

describe('TraceStepsPanel', () => {
  it('walks through the Bell state for q0', () => {
    seed(presetCircuit('bell'), 0)
    render(<TraceStepsPanel />)

    expect(
      screen.getByRole('heading', { name: 'Partial trace — keep q0, trace out q1' }),
    ).toBeVisible()
    expect(screen.getByText(/Tracing out/)).toBeVisible()

    // Step 1: two non-zero amplitudes, 1/√2 each, with q0's bit emphasised.
    const amps = screen.getByTestId('amplitudes')
    expect(bodyRows(amps)).toHaveLength(2)
    expect(amps).toHaveTextContent('|00⟩0.7070.500')
    expect(amps).toHaveTextContent('|11⟩0.7070.500')
    expect(amps.querySelectorAll('.ket__bit--kept')).toHaveLength(2)

    // Step 2: the 4×4 ρ is shown.
    expect(screen.getByTestId('full-rho')).toBeInTheDocument()

    // Step 3: ρ₀[0][0] = ρ[00][00] + ρ[01][01] = 0.5 + 0 (only the non-zero term shown).
    const e00 = screen.getByTestId('trace-entry-00')
    expect(e00).toHaveTextContent('ρ0[0][0] = Σ ρ[|0·⟩][|0·⟩]')
    expect(bodyRows(e00)).toHaveLength(1)
    expect(within(e00).getByTestId('entry-sum')).toHaveTextContent('0.500')

    // ρ₀[0][1]: both terms are 0 (the coherence is lost).
    const e01 = screen.getByTestId('trace-entry-01')
    expect(e01).toHaveTextContent('All 2 terms are 0.')
    expect(within(e01).getByTestId('entry-sum')).toHaveTextContent('0.000')

    // Step 4: result and the direct-vs-explicit check.
    expect(screen.getByTestId('explicit-reduced')).toBeInTheDocument()
    expect(screen.getByTestId('check-line')).toHaveTextContent(
      /Direct method \(O\(2ⁿ\), used for the spheres\) gives the same matrix: max difference (0|\d\.\de-\d+)$/,
    )
  })

  it('toggles between non-zero and all terms', () => {
    seed(presetCircuit('w3'), 1)
    render(<TraceStepsPanel />)
    // ρ₁[0][0] = ρ[000][000] + ρ[001][001] + ρ[100][100] + ρ[101][101] = 0 + 1/3 + 1/3 + 0
    const e00 = screen.getByTestId('trace-entry-00')
    expect(bodyRows(e00)).toHaveLength(2)
    expect(within(e00).getByTestId('entry-sum')).toHaveTextContent('0.667')

    fireEvent.click(within(e00).getByRole('button', { name: 'Show all 4 terms' }))
    expect(bodyRows(e00)).toHaveLength(4)
    expect(e00.querySelectorAll('tr.terms__zero')).toHaveLength(2)

    fireEvent.click(within(e00).getByRole('button', { name: 'Show only non-zero terms' }))
    expect(bodyRows(e00)).toHaveLength(2)
  })

  it('says the full ρ is too large at n = 5 but still lists the terms', () => {
    seed(ghz(5), 2)
    render(<TraceStepsPanel />)
    expect(screen.getByTestId('too-large')).toHaveTextContent(
      'Full ρ is 32×32 — too large to display.',
    )
    expect(screen.queryByTestId('full-rho')).not.toBeInTheDocument()
    expect(within(screen.getByTestId('trace-entry-11')).getByRole('button')).toHaveTextContent(
      'Show all 16 terms',
    )
  })

  it('selects q0 automatically and shows a skeleton until the explicit trace arrives', () => {
    seed(presetCircuit('ghz3'), null)
    render(<TraceStepsPanel />)
    expect(useCircuitStore.getState().selectedQubit).toBe(0)
    // The worker has not answered for q0 yet (explicit is still null).
    expect(screen.getByRole('status')).toHaveTextContent('Loading partial trace steps')

    act(() => seed(presetCircuit('ghz3'), 0))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByTestId('check-line')).toBeInTheDocument()
  })

  it('shows the skeleton while computing', () => {
    seed(presetCircuit('bell'), 0)
    act(() => useResultsStore.setState({ computing: true }))
    render(<TraceStepsPanel />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading partial trace steps')
  })
})
