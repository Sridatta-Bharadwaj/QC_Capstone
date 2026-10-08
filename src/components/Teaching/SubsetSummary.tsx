// Pieces shared by the subset (2+ kept qubits) views of the teaching tabs (V2-7):
// the plain-language "what was traced out" line, purity + entropy, and the pure/mixed note.
//
// Math recap (for the presenter):
//  - Keeping the set K and tracing out the rest R gives ρ_K, a 2^k × 2^k matrix (k = |K|).
//  - Purity Tr(ρ_K²) is 1 for a pure state and 1/2^k for the maximally mixed one.
//  - Von Neumann entropy S(ρ_K) = −Σ λ log₂ λ (λ = eigenvalues of ρ_K), in bits.
//    The whole circuit is in a pure state, so S(ρ_K) measures how entangled K is with R:
//    0 = not entangled, k bits = as entangled as k qubits can be.
import { formatReal, keptKetLabel, qubitList, tracedOut } from './format'
import { Rho } from './Rho'

/** Treat purity this close to 1 as pure (same tolerance as the entangled flag). */
const PURE_EPS = 1e-9

/** One plain-language line: what was kept, what was traced out, and what ρ_K means. */
export function SubsetExplanation({
  numQubits,
  keep,
}: {
  numQubits: number
  keep: readonly number[]
}) {
  const kept = qubitList([...keep]) ?? ''
  const traced = qubitList(tracedOut(numQubits, keep))
  const size = 2 ** keep.length
  return (
    <p data-testid="subset-explanation">
      {traced === null ? (
        <>
          Nothing is traced out: every qubit is kept, so{' '}
          <span className="math">
            <Rho qubit={keep} />
          </span>{' '}
          is the full density matrix ρ.
        </>
      ) : (
        <>
          Keeps {kept} and traces out {traced}:{' '}
          <span className="math">
            <Rho qubit={keep} />
          </span>{' '}
          describes {kept} together, as if {traced} were sent away and never looked at.
        </>
      )}{' '}
      It is {size}×{size}; rows and columns are the basis states{' '}
      <span className="math">{keptKetLabel(keep)}</span>.
    </p>
  )
}

/** Purity and entropy as a key–value list (same look as the v1 quantities). */
export function SubsetQuantities({
  purity,
  entropy,
  numKept,
}: {
  purity: number
  entropy: number
  numKept: number
}) {
  const mixedPurity = 1 / 2 ** numKept
  return (
    <dl className="quantities" data-testid="quantities">
      <dt>Tr(ρ²)</dt>
      <dd data-testid="purity">{formatReal(purity)}</dd>
      <dd className="quantities__why">
        Purity: 1 = pure, {formatReal(mixedPurity)} (1/{2 ** numKept}) = maximally mixed
      </dd>

      <dt>S(ρ)</dt>
      <dd data-testid="entropy">{formatReal(entropy)}</dd>
      <dd className="quantities__why">
        Von Neumann entropy in bits: 0 = pure, {numKept} = maximally mixed
      </dd>
    </dl>
  )
}

/** "The kept qubits are pure / mixed, because …". */
export function SubsetNote({
  numQubits,
  keep,
  purity,
  entropy,
}: {
  numQubits: number
  keep: readonly number[]
  purity: number
  entropy: number
}) {
  const kept = qubitList([...keep]) ?? ''
  const traced = qubitList(tracedOut(numQubits, keep))
  const pure = purity > 1 - PURE_EPS
  return (
    <p className="teaching-note" data-testid="mixed-note">
      {traced === null ? (
        <>
          <strong>The whole circuit is in a pure state</strong>, so keeping every qubit gives
          entropy 0.
        </>
      ) : pure ? (
        <>
          <strong>{kept} are pure together.</strong> They are not entangled with {traced}, so
          together they could be written as one statevector (entropy 0).
        </>
      ) : (
        <>
          <strong>{kept} are mixed together.</strong> They are entangled with {traced}. The whole
          circuit is in a pure state, so all of their uncertainty comes from that entanglement: S ={' '}
          {formatReal(entropy)} bit{Math.abs(entropy - 1) < 5e-4 ? '' : 's'} of entanglement.
        </>
      )}
    </p>
  )
}
