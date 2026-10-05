// Compact row of q0 … q(n−1) toggle buttons shared by the teaching tabs.
import type { ReactNode } from 'react'
import { useCircuitStore } from '../../model/store'

interface QubitSelectorProps {
  numQubits: number
  selected: number | null
  /** Shown on the right of the row (e.g. the section title). */
  children?: ReactNode
}

export function QubitSelector({ numQubits, selected, children }: QubitSelectorProps) {
  const selectQubit = useCircuitStore((s) => s.selectQubit)
  return (
    <div className="teaching-toolbar">
      <div className="qubit-selector" role="group" aria-label="Qubit">
        {Array.from({ length: numQubits }, (_, k) => (
          <button
            key={k}
            type="button"
            className="qubit-selector__button"
            aria-pressed={selected === k}
            onClick={() => selectQubit(k)}
          >
            q{k}
          </button>
        ))}
      </div>
      {children}
    </div>
  )
}
