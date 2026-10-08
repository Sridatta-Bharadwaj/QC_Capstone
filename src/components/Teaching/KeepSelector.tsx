// "Keep qubits" multi-select shared by the teaching tabs (V2-7): a compact row of
// q0 … q(n−1) toggle buttons. Pressed = kept; everything else is traced out.
import type { ReactNode } from 'react'
import { columnCount } from '../../model/circuit'
import { currentStep, useStepStore } from '../../model/stepStore'
import { useCircuitStore } from '../../model/store'
import { describeStep } from '../Timeline/timelineText'
import { toggleKept } from './keepStore'

/**
 * While the step debugger is not Live, says which state the teaching views show, so a
 * matrix is never mistaken for the final state.
 */
function StepTag() {
  const numSteps = useCircuitStore((s) => columnCount(s.circuit))
  const live = useStepStore((s) => s.live)
  const step = useStepStore((s) => currentStep(s, numSteps))
  if (live) return null
  return (
    <span className="teaching-toolbar__step" data-testid="teaching-step">
      Step {step} / {numSteps} · {describeStep(step)}
    </span>
  )
}

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
      <StepTag />
    </div>
  )
}
