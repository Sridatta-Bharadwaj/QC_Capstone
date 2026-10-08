// Problems tab (like VS Code's): parse errors/warnings from both code tabs (QASM and Qiskit),
// plus a simulation error if any. Each row says which tab it came from; clicking it opens that
// tab with the cursor on the position.
import { useProblemsStore, useResultsStore } from '../../model/store'
import type { CodeTab, Problem } from '../../model/types'
import { CODE_TAB_LABELS, CODE_TABS } from '../CodePanel/codeSync'
import { ReplacedNotice } from '../CodePanel/ReplacedNotice'
import { revealProblem } from '../CodePanel/revealStore'
import './ProblemsPanel.css'

/** File name shown for each tab, like an editor tab title. */
const FILE_NAMES: Record<CodeTab, string> = { qasm: 'circuit.qasm', qiskit: 'circuit.py' }

/** "Code was replaced" notices of both tabs (each renders nothing when not needed). */
function ReplacedNotices() {
  return (
    <>
      {CODE_TABS.map((tab) => (
        <ReplacedNotice key={tab} tab={tab} />
      ))}
    </>
  )
}

function SeverityIcon({ severity }: { severity: Problem['severity'] }) {
  return (
    <span
      className={`codicon codicon-${severity} problems__icon problems__icon--${severity}`}
      role="img"
      aria-label={severity === 'error' ? 'Error' : 'Warning'}
    />
  )
}

/**
 * Problems grouped by tab (QASM first), then in text order (by line, then column); problems
 * without a position go first within their tab.
 */
function byPosition(problems: Problem[]): Problem[] {
  const tabIndex = (p: Problem) => CODE_TABS.indexOf(p.tab ?? 'qasm')
  return [...problems].sort(
    (a, b) =>
      tabIndex(a) - tabIndex(b) ||
      (a.line ?? 0) - (b.line ?? 0) ||
      (a.column ?? 0) - (b.column ?? 0),
  )
}

function ProblemRow({ problem }: { problem: Problem }) {
  const tab = problem.tab ?? 'qasm'
  const label = CODE_TAB_LABELS[tab]
  return (
    <button
      type="button"
      className="problems__item"
      onClick={() => revealProblem(problem)}
      title={`Go to this position in the ${label} code`}
    >
      <SeverityIcon severity={problem.severity} />
      <span className="problems__tab">{label}</span>
      <span className="problems__message">{problem.message}</span>
      <span className="problems__source">
        {FILE_NAMES[tab]}
        {problem.line !== undefined && (
          <span className="problems__position">
            {' '}
            [Ln {problem.line}, Col {problem.column ?? 1}]
          </span>
        )}
      </span>
    </button>
  )
}

export function ProblemsPanel() {
  const problems = useProblemsStore((s) => s.problems)
  const engineError = useResultsStore((s) => s.error)

  if (problems.length === 0 && !engineError) {
    return (
      <div className="problems-empty">
        <ReplacedNotices />
        <div className="empty-state">No problems have been detected in the workspace.</div>
      </div>
    )
  }

  return (
    <div className="problems-list">
      <ReplacedNotices />
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
            <ProblemRow problem={problem} />
          </li>
        ))}
      </ul>
    </div>
  )
}
