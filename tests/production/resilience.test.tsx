// @vitest-environment jsdom
// Production readiness: a crash in one part of the UI, or a browser without WebGL, must never
// blank the page (the demo runs on unknown lab / projector PCs).
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BlochSphereSvg } from '../../src/components/Bloch/BlochSphereSvg'
import { hasWebGL, setWebGLSupportForTests } from '../../src/components/Bloch/webgl'
import {
  AppCrashScreen,
  ErrorBoundary,
  PanelBoundary,
} from '../../src/components/common/ErrorBoundary'

afterEach(() => {
  cleanup()
  setWebGLSupportForTests(undefined)
  vi.restoreAllMocks()
})

function Bomb({ explode }: { explode: boolean }) {
  if (explode) throw new Error('boom')
  return <p>panel content</p>
}

describe('ErrorBoundary', () => {
  it('shows the fallback instead of crashing, and reset re-mounts the children', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    function Harness() {
      const [explode, setExplode] = useState(true)
      return (
        <ErrorBoundary
          fallback={(error, reset) => (
            <button
              onClick={() => {
                setExplode(false)
                reset()
              }}
            >
              recover from {error.message}
            </button>
          )}
        >
          <Bomb explode={explode} />
        </ErrorBoundary>
      )
    }
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'recover from boom' }))
    expect(screen.getByText('panel content')).toBeInTheDocument()
  })

  it('PanelBoundary keeps siblings alive and offers a retry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <div>
        <PanelBoundary name="code">
          <Bomb explode />
        </PanelBoundary>
        <p>other panel</p>
      </div>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The code panel ran into a problem.')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.getByText('other panel')).toBeInTheDocument()
  })

  it('the app crash screen offers reload and a workspace reset', () => {
    const onReset = vi.fn()
    render(<AppCrashScreen onReset={onReset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reset workspace' }))
    expect(onReset).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
  })
})

describe('WebGL fallback', () => {
  it('reports no WebGL when the browser cannot create a context (jsdom has none)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}) // jsdom logs "not implemented"
    expect(hasWebGL()).toBe(false)
  })

  it('the flat sphere draws an arrow for a pure state', () => {
    const { container } = render(<BlochSphereSvg vector={{ x: 1, y: 0, z: 0 }} size={200} />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Bloch vector (1.000, 0.000, 0.000)')
    expect(container.querySelector('polygon.bloch-svg__vector-fill')).not.toBeNull()
    expect(screen.queryByText('r = 0')).toBeNull()
    for (const label of ['x', 'y', '|0⟩', '|1⟩'])
      expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('the flat sphere shows the r = 0 marker and no arrow for a maximally mixed qubit', () => {
    const { container } = render(<BlochSphereSvg vector={{ x: 0, y: 0, z: 0 }} size={200} />)
    expect(screen.getByText('r = 0')).toBeInTheDocument()
    expect(container.querySelector('polygon')).toBeNull()
  })

  it('back-of-sphere lines are marked so they render dashed', () => {
    const { container } = render(<BlochSphereSvg vector={{ x: 0, y: 0, z: 1 }} size={200} />)
    expect(container.querySelectorAll('path[data-back="true"]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('path[data-back="false"]').length).toBeGreaterThan(0)
  })
})
