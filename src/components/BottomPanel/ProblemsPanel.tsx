// Problems tab (like VS Code's): QASM parse errors/warnings, plus a simulation error if any.
// Clicking a parse problem opens the QASM tab with the cursor on that position.
import { useProblemsStore, useResultsStore } from '../../model/store'
import type { Problem } from '../../model/types'
import { ReplacedNotice } from '../CodePanel/ReplacedNotice'
import { revealProblem } from '../CodePanel/revealStore'
import './ProblemsPanel.css'

function SeverityIcon({ severity }: { severity: Problem['severity'] }) {
  return (
    <span
      className={`codicon codicon-${severity} problems__icon problems__icon--${severity}`}
      role="img"
      aria-label={severity === 'error' ? 'Error' : 'Warning'}
    />
  )
}

/** Problems in text order (by line, then column); problems without a position go first. */
function byPosition(problems: Problem[]): Problem[] {
  return [...problems].sort(
    (a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0),
  )
}

export function ProblemsPanel() {
  const problems = useProblemsStore((s) => s.problems)
  const engineError = useResultsStore((s) => s.error)

  if (problems.length === 0 && !engineError) {
    return (
      <div className="problems-empty">
        <ReplacedNotice />
        <div className="empty-state">No problems have been detected in the workspace.</div>
      </div>
    )
  }

  return (
    <ul className="problems" aria-label="Problems">
      {engineError && (
        <li className="problems__item problems__item--static">
          <SeverityIcon severity="error" />
          <span className="problems__message">Simulation failed: {engineError}</span>
          <span className="problems__source">engine</span>
        </li>
      )}
      {byPosition(problems).map((problem, i) => (
        <li key={i}>
          <button
            type="button"
            className="problems__item"
            onClick={() => revealProblem(problem)}
            title="Go to this position in the QASM code"
          >
            <SeverityIcon severity={problem.severity} />
            <span className="problems__message">{problem.message}</span>
            <span className="problems__source">
              circuit.qasm
              {problem.line !== undefined && (
                <span className="problems__position">
                  {' '}
                  [Ln {problem.line}, Col {problem.column ?? 1}]
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
