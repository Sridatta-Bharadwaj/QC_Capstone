// Status bar: qubit count, entangled qubits, purity per qubit, engine state.
// Purity Tr(ρₖ²) is 1 for a pure qubit and 0.5 for a maximally mixed one.
import { useCircuitStore, useProblemsStore, useResultsStore } from '../../model/store'
import { useUiStore } from '../../model/uiStore'
import { MAX_QUBITS } from '../../model/types'
import { columnCount } from '../../model/circuit'
import { currentStep, useStepStore } from '../../model/stepStore'
import { formatReal, qubitList } from '../Teaching/format'
import './StatusBar.css'

export function StatusBar() {
  const numQubits = useCircuitStore((s) => s.circuit.numQubits)
  const analysis = useResultsStore((s) => s.analysis)
  const computing = useResultsStore((s) => s.computing)
  const error = useResultsStore((s) => s.error)
  // While the QASM has errors, the circuit (and everything computed from it) is the last valid
  // one, not what the editor shows. Say so, and link to the Problems tab.
  const qasmHasErrors = useProblemsStore((s) => s.problems.some((p) => p.severity === 'error'))
  const setBottomTab = useUiStore((s) => s.setBottomTab)
  // Step-through debugger (V2-5): everything here describes the state at that step.
  const numSteps = useCircuitStore((s) => columnCount(s.circuit))
  const stepping = useStepStore((s) => !s.live)
  const step = useStepStore((s) => currentStep(s, numSteps))
  const goLive = useStepStore((s) => s.goLive)

  const qubits = analysis?.qubits ?? []
  const entangled = qubitList(qubits.filter((q) => q.entangled).map((q) => q.qubit))

  return (
    <footer className="status-bar">
      <span className="status-bar__item" data-testid="status-qubits">
        <span className="codicon codicon-circuit-board" aria-hidden="true" />
        {numQubits} / {MAX_QUBITS} qubits
      </span>

      {analysis && (
        <span
          className="status-bar__item"
          data-testid="status-entangled"
          title="Qubits whose Bloch vector is shorter than 1 (mixed, entangled with the rest)"
        >
          <span className="codicon codicon-link" aria-hidden="true" />
          {entangled === null ? 'No entanglement' : `Entangled: ${entangled}`}
        </span>
      )}

      {analysis && (
        <span
          className="status-bar__item status-bar__purity"
          data-testid="status-purity"
          title="Purity Tr(ρ²) per qubit: 1 = pure, 0.5 = maximally mixed"
        >
          <span className="status-bar__label">Purity</span>{' '}
          {qubits.map((q, i) => (
            <span key={q.qubit} className="status-bar__mono">
              {i > 0 && <span className="status-bar__sep"> · </span>}q{q.qubit}{' '}
              {formatReal(q.purity)}
            </span>
          ))}
        </span>
      )}

      {stepping && (
        <button
          type="button"
          className="status-bar__item status-bar__button status-bar__step"
          data-testid="status-step"
          title="Spheres, matrices and purity show the state at this step. Click to return to Live (final state)."
          onClick={goLive}
        >
          <span className="codicon codicon-debug-pause" aria-hidden="true" />
          Step {step}/{numSteps} · back to Live
        </button>
      )}

      {qasmHasErrors && (
        <button
          type="button"
          className="status-bar__item status-bar__button status-bar__warning"
          data-testid="status-stale"
          title="The circuit, spheres and matrices are from the last QASM that parsed. Click to see the problems."
          onClick={() => setBottomTab('problems')}
        >
          <span className="codicon codicon-warning" aria-hidden="true" />
          QASM has errors — showing last valid circuit
        </button>
      )}

      {computing && (
        <span className="status-bar__item" data-testid="status-computing" role="status">
          <span className="codicon codicon-sync" aria-hidden="true" />
          Computing…
        </span>
      )}

      {error && (
        <span
          className="status-bar__item status-bar__error"
          data-testid="status-error"
          role="alert"
          title={error}
        >
          <span className="codicon codicon-error" aria-hidden="true" />
          Engine error: {error}
        </span>
      )}
    </footer>
  )
}
