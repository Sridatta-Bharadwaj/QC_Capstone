// "Keep qubits" multi-select shared by the teaching tabs (V2-7): a compact row of
// q0 … q(n−1) toggle buttons. Pressed = kept; everything else is traced out.
import type { ReactNode } from 'react'
import { toggleKept } from './keepStore'

interface KeepSelectorProps {
  numQubits: number
  /** Kept qubits, sorted ascending. */
  keep: number[]
  /** Shown on the right of the row (e.g. the section title). */
  children?: ReactNode
}

export function KeepSelector({ numQubits, keep, children }: KeepSelectorProps) {
  return (
    <div className="teaching-toolbar">
      <span className="keep-selector__label" aria-hidden="true">
        Keep
      </span>
      <div className="qubit-selector" role="group" aria-label="Keep qubits">
        {Array.from({ length: numQubits }, (_, k) => {
          const pressed = keep.includes(k)
          // The last kept qubit stays: something has to be kept.
          const locked = pressed && keep.length === 1
          return (
            <button
              key={k}
              type="button"
              className="qubit-selector__button"
              aria-pressed={pressed}
              aria-disabled={locked || undefined}
              title={
                locked
                  ? `q${k} is the only kept qubit`
                  : pressed
                    ? `Trace out q${k}`
                    : `Keep q${k} too`
              }
              onClick={() => toggleKept(k, keep)}
            >
              q{k}
            </button>
          )
        })}
      </div>
      {children}
    </div>
  )
}
