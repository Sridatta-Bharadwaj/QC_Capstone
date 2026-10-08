// Partial Trace Steps tab: the explicit (textbook) partial trace for the selected qubit,
// one numbered step at a time. Data comes from engine.partialTraceExplicit (run in the
// worker for the selected qubit only).
//
// The rule being shown:  ρₖ[a][b] = Σ_rest ρ[(a, rest)][(b, rest)]
// i.e. keep the entries of ρ whose row has qubit k = a, whose column has qubit k = b, and
// where all OTHER qubits are equal in row and column; add them up.
import { useState } from 'react'
import type { Complex, TraceEntry } from '../../engine/types'
import { MathText } from '../common/MathText'
import { BasisKet } from '../Teaching/BasisKet'
import { MatrixSkeleton } from '../Teaching/MatrixSkeleton'
import { MatrixTable } from '../Teaching/MatrixTable'
import { QubitSelector } from '../Teaching/QubitSelector'
import { Rho } from '../Teaching/Rho'
import {
  MAX_DISPLAY_QUBITS,
  formatComplex,
  formatReal,
  formatScientific,
  isZero,
  maxAbsDifference,
  qubitList,
  subscript,
} from '../Teaching/format'
import { useTeachingData } from '../Teaching/useTeachingData'
import '../Teaching/Teaching.css'

/** Above this the direct and explicit results are reported as different. */
const AGREEMENT_TOLERANCE = 1e-10

/** "|·0·⟩": the pattern of the summed kets, with · for "same value in row and column". */
function patternKet(numQubits: number, qubit: number, bit: 0 | 1): string {
  return `|${Array.from({ length: numQubits }, (_, j) => (j === qubit ? bit : '·')).join('')}⟩`
}

function TraceEntryCard({
  entry,
  numQubits,
  qubit,
}: {
  entry: TraceEntry
  numQubits: number
  qubit: number
}) {
  const [showAll, setShowAll] = useState(false)
  const total = entry.terms.length
  const nonZero = entry.terms.filter((t) => !isZero(t.value))
  const shown = showAll ? entry.terms : nonZero
  const hidden = total - nonZero.length
  const k = subscript(qubit)
  const label = `ρ${k}[${entry.a}][${entry.b}]`

  return (
    <div className="trace-entry" data-testid={`trace-entry-${entry.a}${entry.b}`}>
      <div className="trace-entry__formula">
        <Rho qubit={qubit} />[{entry.a}][{entry.b}] = Σ ρ[{patternKet(numQubits, qubit, entry.a)}][
        {patternKet(numQubits, qubit, entry.b)}]
      </div>
      {shown.length === 0 ? (
        <p>All {total} terms are 0.</p>
      ) : (
        <table className="terms" aria-label={`Terms of ${label}`}>
          <thead>
            <tr>
              <th scope="col">row</th>
              <th scope="col">column</th>
              <th scope="col">ρ[row][column]</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((t) => (
              <tr key={`${t.row}-${t.col}`} className={isZero(t.value) ? 'terms__zero' : ''}>
                <td>
                  <BasisKet index={t.row} numQubits={numQubits} highlight={qubit} />
                </td>
                <td>
                  <BasisKet index={t.col} numQubits={numQubits} highlight={qubit} />
                </td>
                <td className="num">{formatComplex(t.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2}>sum</td>
              <td className="num" data-testid="entry-sum">
                {formatComplex(entry.sum)}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
      {shown.length === 0 && (
        <div className="trace-entry__formula" data-testid="entry-sum">
          sum = {formatComplex(entry.sum)}
        </div>
      )}
      {hidden > 0 && (
        <button
          type="button"
          className="link-button"
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Show only non-zero terms' : `Show all ${total} terms`}
        </button>
      )}
    </div>
  )
}

function Amplitudes({
  state,
  numQubits,
  qubit,
}: {
  state: Complex[]
  numQubits: number
  qubit: number
}) {
  const rows = state.map((amp, index) => ({ amp, index })).filter(({ amp }) => !isZero(amp))
  return (
    <table className="amplitudes" aria-label="Non-zero amplitudes" data-testid="amplitudes">
      <thead>
        <tr>
          <th scope="col">basis state</th>
          <th scope="col">amplitude ψ</th>
          <th scope="col">probability |ψ|²</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ amp, index }) => (
          <tr key={index}>
            <td>
              <BasisKet index={index} numQubits={numQubits} highlight={qubit} />
            </td>
            <td className="num">{formatComplex(amp)}</td>
            <td className="num">{formatReal(amp.re * amp.re + amp.im * amp.im)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TraceStepsPanel() {
  const { numQubits, selected, analysis, qubit, explicit, computing } = useTeachingData()

  const name = selected === null ? '' : `q${selected}`
  const others = qubitList(
    Array.from({ length: numQubits }, (_, j) => j).filter((j) => j !== selected),
  )
  const title =
    others === null
      ? `Partial trace — ${name} (nothing to trace out)`
      : `Partial trace — keep ${name}, trace out ${others}`

  const toolbar = (
    <QubitSelector numQubits={numQubits} selected={selected}>
      <h2 className="teaching-toolbar__title">{title}</h2>
    </QubitSelector>
  )

  const intro = (
    <p>
      <strong>Tracing out</strong> a qubit means describing the rest of the system while ignoring
      that qubit completely, as if it were sent away and never looked at again. We keep only the
      entries of the full density matrix where the ignored qubits have the <em>same</em> value in
      the row and the column, and add them up. What is left is a 2×2 matrix for {name} alone. Any
      phase relation between {name} and the other qubits (entanglement) is lost in the sum, which is
      why an entangled qubit ends up mixed.
    </p>
  )

  if (computing || analysis === null || qubit === null || explicit === null || selected === null) {
    return (
      <div className="teaching teaching--split">
        {toolbar}
        <div className="teaching__scroll">
          {intro}
          <MatrixSkeleton label="partial trace steps" size={4} />
        </div>
      </div>
    )
  }

  const dim = 2 ** numQubits
  const termsPerEntry = 2 ** (numQubits - 1)
  const diff = maxAbsDifference(explicit.reduced, qubit.rho)
  const agrees = diff <= AGREEMENT_TOLERANCE

  // The toolbar stays above a separate scroll area (`teaching--split`), so the text can never
  // slide underneath it.
  return (
    <div className="teaching teaching--split">
      {toolbar}
      <div className="teaching__scroll">
        {intro}

        <ol className="steps">
          <li className="step">
            <div className="step__body">
              <h3>
                The state <MathText text="|ψ⟩" />
              </h3>
              <p>
                The circuit produces this {numQubits}-qubit state. Only non-zero amplitudes are
                listed. Kets read <span className="math">|q0 q1 ...⟩</span>; the bit of {name} is
                underlined.
              </p>
              <Amplitudes state={analysis.state} numQubits={numQubits} qubit={selected} />
            </div>
          </li>

          <li className="step">
            <div className="step__body">
              <h3>
                Density matrix{' '}
                <span className="math">
                  ρ = <MathText text="|ψ⟩⟨ψ|" />
                </span>
              </h3>
              <p>
                Each entry is{' '}
                <span className="math">
                  ρ[i][j] = ψ<sub>i</sub> · conj(ψ<sub>j</sub>)
                </span>
                . For {numQubits} qubit{numQubits === 1 ? '' : 's'} ρ is {dim}×{dim} = {dim * dim}{' '}
                entries. The diagonal holds the probabilities; the off-diagonal entries hold the
                phases between basis states.
              </p>
              {numQubits > MAX_DISPLAY_QUBITS ? (
                <p className="teaching-note" data-testid="too-large">
                  Full ρ is {dim}×{dim} — too large to display. Step 3 lists the entries that matter
                  for {name}.
                </p>
              ) : (
                <div className="matrix-scroll">
                  <MatrixTable
                    matrix={explicit.fullRho}
                    numQubits={numQubits}
                    label="Full density matrix"
                    testId="full-rho"
                    highlightQubit={selected}
                    compact
                  />
                </div>
              )}
            </div>
          </li>

          <li className="step">
            <div className="step__body">
              <h3>Trace out every qubit except {name}</h3>
              {others === null ? (
                <p>
                  There are no other qubits, so <Rho qubit={selected} /> is ρ itself.
                </p>
              ) : (
                <p>
                  For each entry{' '}
                  <span className="math">
                    <Rho qubit={selected} />
                    [a][b]
                  </span>
                  , add up the entries of ρ whose row has {name} = a, whose column has {name} = b,
                  and where {others} {numQubits === 2 ? 'has' : 'have'} the same value in row and
                  column (shown as <span className="math">·</span>). That is 2
                  <sup>{numQubits - 1}</sup> = {termsPerEntry} terms per entry. Terms that are 0 are
                  hidden.
                </p>
              )}
              <div className="trace-entries">
                {explicit.entries.map((entry) => (
                  <TraceEntryCard
                    key={`${selected}-${entry.a}${entry.b}`}
                    entry={entry}
                    numQubits={numQubits}
                    qubit={selected}
                  />
                ))}
              </div>
            </div>
          </li>

          <li className="step">
            <div className="step__body">
              <h3>
                Result: reduced density matrix <Rho qubit={selected} />
              </h3>
              <div className="matrix-scroll">
                <MatrixTable
                  matrix={explicit.reduced}
                  numQubits={1}
                  label={`Reduced density matrix of ${name} (explicit method)`}
                  testId="explicit-reduced"
                />
              </div>
              <p
                className={`check-line${agrees ? '' : ' check-line--bad'}`}
                data-testid="check-line"
              >
                <span
                  className={`codicon ${agrees ? 'codicon-pass' : 'codicon-error'}`}
                  aria-hidden="true"
                />
                {agrees
                  ? 'Direct method (O(2ⁿ), used for the spheres) gives the same matrix'
                  : 'Direct method (O(2ⁿ), used for the spheres) gives a DIFFERENT matrix'}
                : max difference {formatScientific(diff)}
              </p>
            </div>
          </li>
        </ol>
      </div>
    </div>
  )
}
