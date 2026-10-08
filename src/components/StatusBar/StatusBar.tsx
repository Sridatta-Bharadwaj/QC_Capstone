// Status bar: qubit count, entangled qubits, purity per qubit, engine state.
// Purity Tr(ρₖ²) is 1 for a pure qubit and 0.5 for a maximally mixed one.
import { useCircuitStore, useProblemsStore, useResultsStore } from '../../model/store'
import { useUiStore } from '../../model/uiStore'
import { MAX_QUBITS, type Problem } from '../../model/types'
import { formatReal, qubitList } from '../Teaching/format'
import './StatusBar.css'

const hasErrors = (problems: Problem[]) => problems.some((p) => p.severity === 'error')

/** "QASM has errors — …", "Qiskit has errors — …", "QASM and Qiskit have errors — …" or null. */
function staleText(qasm: boolean, qiskit: boolean): string | null {
  const tabs = [qasm ? 'QASM' : null, qiskit ? 'Qiskit' : null].filter((t) => t !== null)
  if (tabs.length === 0) return null
  const verb = tabs.length === 1 ? 'has' : 'have'
  return `${tabs.join(' and ')} ${verb} errors — showing last valid circuit`
}

export function StatusBar() {
  const numQubits = useCircuitStore((s) => s.circuit.numQubits)
  const analysis = useResultsStore((s) => s.analysis)
  const computing = useResultsStore((s) => s.computing)
  const error = useResultsStore((s) => s.error)
  // While a code tab has errors, the circuit (and everything computed from it) is the last
  // valid one, not what that editor shows. Say so, and link to the Problems tab.
  const qasmHasErrors = useProblemsStore((s) => hasErrors(s.byTab.qasm))
  const qiskitHasErrors = useProblemsStore((s) => hasErrors(s.byTab.qiskit))
  const staleMessage = staleText(qasmHasErrors, qiskitHasErrors)
  const setBottomTab = useUiStore((s) => s.setBottomTab)

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

      {staleMessage && (
        <button
          type="button"
          className="status-bar__item status-bar__button status-bar__warning"
          data-testid="status-stale"
          title="The circuit, spheres and matrices are from the last code that parsed. Click to see the problems."
          onClick={() => setBottomTab('problems')}
        >
          <span className="codicon codicon-warning" aria-hidden="true" />
          {staleMessage}
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
