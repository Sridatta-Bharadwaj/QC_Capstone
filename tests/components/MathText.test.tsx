// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MathText } from '../../src/components/common/MathText'

afterEach(cleanup)

const html = (text: string) => render(<MathText text={text} />).container

describe('MathText', () => {
  it('sets an outer product in one mono run with spaced brackets', () => {
    const el = html('Full ρ = |ψ⟩⟨ψ| (4×4)')
    const kets = el.querySelectorAll('.math-text__ket')
    expect(kets).toHaveLength(1)
    expect(kets[0]).toHaveTextContent('|ψ⟩⟨ψ|')
    expect(el.querySelectorAll('.math-text__bracket')).toHaveLength(2)
    expect(el).toHaveTextContent('Full ρ = |ψ⟩⟨ψ| (4×4)')
  })

  it('finds every ket in running text', () => {
    const el = html('(|100⟩ + |010⟩ + |001⟩)/√3. Product |+⟩|1⟩|i⟩')
    expect([...el.querySelectorAll('.math-text__ket')].map((k) => k.textContent)).toEqual([
      '|100⟩',
      '|010⟩',
      '|001⟩',
      '|+⟩',
      '|1⟩',
      '|i⟩',
    ])
  })

  it('turns ⁺ / ⁻ into real superscripts', () => {
    const el = html('Bell state Φ⁺ and Φ⁻')
    const sups = el.querySelectorAll('sup')
    expect([...sups].map((s) => s.textContent)).toEqual(['+', '−'])
    expect(el).toHaveTextContent('Bell state Φ+ and Φ−')
  })

  it('leaves text without notation alone', () => {
    const el = html('GHZ (3 qubits)')
    expect(el.innerHTML).toBe('GHZ (3 qubits)')
  })
})
