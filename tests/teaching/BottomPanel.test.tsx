// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BottomPanel } from '../../src/components/BottomPanel/BottomPanel'
import { useUiStore } from '../../src/model/uiStore'
import { presetCircuit, seed } from './seed'

afterEach(cleanup)

// The first dynamic import transforms the tab module on the fly, which can take a few
// seconds when the whole suite runs in parallel.
const LOAD = { timeout: 10_000 }

describe('BottomPanel teaching tabs (lazy-loaded)', () => {
  it('loads the Density Matrices tab', async () => {
    seed(presetCircuit('bell'), 0)
    useUiStore.setState({ bottomTab: 'density' })
    render(<BottomPanel />)
    expect(
      await screen.findByRole('heading', { name: 'Reduced density matrix — q0' }, LOAD),
    ).toBeInTheDocument()
  }, 15_000)

  it('loads the Partial Trace Steps tab', async () => {
    seed(presetCircuit('bell'), 1)
    useUiStore.setState({ bottomTab: 'trace' })
    render(<BottomPanel />)
    expect(await screen.findByTestId('check-line', {}, LOAD)).toBeInTheDocument()
  }, 15_000)
})
