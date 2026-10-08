// Density Matrices tab: the reduced ρ of the kept qubit(s), what can be read off it,
// and the full ρ = |ψ⟩⟨ψ| it comes from.
//
// Math recap (for the presenter):
//  - ρ = |ψ⟩⟨ψ| is the 2ⁿ×2ⁿ density matrix of the whole circuit's state.
//  - ρₖ (2×2) describes qubit k on its own. It is the partial trace of ρ over all other
//    qubits; the spheres use a direct O(2ⁿ) formula that gives the same numbers.
//  - From ρₖ = ½(I + xX + yY + zZ) the Bloch vector is x = 2·Re ρ₀₁, y = −2·Im ρ₀₁,
//    z = ρ₀₀ − ρ₁₁, and the purity is Tr(ρₖ²) = (1 + |r|²)/2.
//  - V2-7: "Keep qubits" can keep several qubits at once. With 2+ kept qubits the tab shows
//    the 2^k × 2^k reduced ρ of the set, its purity and its von Neumann entropy instead
//    (SubsetDensityView below); with one kept qubit it is the v1 view plus the entropy.
import { useMemo, useState } from 'react'
import { vonNeumannEntropy } from '../../engine/subset'
import { useCircuitStore } from '../../model/store'
import { MathText } from '../common/MathText'
import { KeepSelector } from '../Teaching/KeepSelector'
import { MatrixSkeleton } from '../Teaching/MatrixSkeleton'
import { MatrixTable } from '../Teaching/MatrixTable'
import { Rho } from '../Teaching/Rho'
import { SubsetExplanation, SubsetNote, SubsetQuantities } from '../Teaching/SubsetSummary'
import {
  MAX_DISPLAY_KEPT,
  MAX_DISPLAY_QUBITS,
  blochFromRho,
  cellKey,
  formatReal,
  qubitList,
} from '../Teaching/format'
import { useKeep } from '../Teaching/keepStore'
import { useSubsetResult, type SubsetData } from '../Teaching/useSubsetResult'
import { useTeachingData } from '../Teaching/useTeachingData'
import '../Teaching/Teaching.css'

export function DensityMatricesPanel() {
  const keep = useKeep()
  const circuit = useCircuitStore((s) => s.circuit)
  const multi = keep.length >= 2
  // Always called (hook order); only sends requests while 2+ qubits are kept.
  const subset = useSubsetResult(circuit, keep, multi)
  return multi ? (
    <SubsetDensityView numQubits={circuit.numQubits} keep={keep} data={subset} />
  ) : (
    <SingleQubitDensityView keep={keep} />
  )
}

/** One kept qubit: the v1 view (Bloch vector, |r|, purity) plus the entropy. */
function SingleQubitDensityView({ keep }: { keep: number[] }) {
  const { numQubits, selected, qubit, explicit, computing } = useTeachingData()
  const [hovered, setHovered] = useState<[number, number] | null>(null)
  // S(ρₖ) of a 2×2 matrix is cheap, so it is computed here from the worker's ρₖ.
  const entropy = useMemo(() => (qubit ? vonNeumannEntropy(qubit.rho) : 0), [qubit])

  // Full-ρ cells that are summed into the hovered reduced entry ρₖ[a][b].
  const termCells = useMemo(() => {
    if (!hovered || !explicit) return undefined
    const entry = explicit.entries[hovered[0] * 2 + hovered[1]]
    return new Set(entry.terms.map((t) => cellKey(t.row, t.col)))
  }, [hovered, explicit])

  const name = selected === null ? '' : `q${selected}`
  const title = `Reduced density matrix — ${name}`
  const toolbar = (
    <KeepSelector numQubits={numQubits} keep={keep}>
      <h2 className="teaching-toolbar__title">{title}</h2>
    </KeepSelector>
  )

  if (computing || qubit === null || selected === null) {
    return (
      <div className="teaching">
        {toolbar}
        <MatrixSkeleton label="density matrices" size={2} />
      </div>
    )
  }

  const r = blochFromRho(qubit.rho)
  const dim = 2 ** numQubits

  return (
    <div className="teaching">
      {toolbar}

      <section className="teaching-section" aria-label={title}>
        <p>
          <span className="math">
            <Rho qubit={selected} />
          </span>{' '}
          describes {name} on its own. Rows and columns are the basis states{' '}
          <span className="math">|0⟩</span>, <span className="math">|1⟩</span> of {name}.
        </p>
        <div className="teaching-row">
          <div className="matrix-scroll">
            <MatrixTable
              matrix={qubit.rho}
              numQubits={1}
              label={`Reduced density matrix of ${name}`}
              testId="reduced-rho"
              onCellHover={explicit ? setHovered : undefined}
              activeCell={hovered}
            />
          </div>

          <dl className="quantities" data-testid="quantities">
            <dt>r</dt>
            <dd data-testid="bloch-r">
              (<span className="axis-x">{formatReal(r.x)}</span>,{' '}
              <span className="axis-y">{formatReal(r.y)}</span>,{' '}
              <span className="axis-z">{formatReal(r.z)}</span>)
            </dd>
            <dd className="quantities__why">
              Bloch vector: x = 2·Re ρ₀₁, y = −2·Im ρ₀₁, z = ρ₀₀ − ρ₁₁
            </dd>

            <dt>|r|</dt>
            <dd data-testid="bloch-length">{formatReal(qubit.length)}</dd>
            <dd className="quantities__why">
              Length: 1 = on the sphere surface (pure), less than 1 = inside (mixed)
            </dd>

            <dt>Tr(ρ²)</dt>
            <dd data-testid="purity">{formatReal(qubit.purity)}</dd>
            <dd className="quantities__why">Purity: 1 = pure, 0.5 = maximally mixed</dd>

            <dt>S(ρ)</dt>
            <dd data-testid="entropy">{formatReal(entropy)}</dd>
            <dd className="quantities__why">
              Von Neumann entropy in bits: 0 = pure, 1 = maximally mixed
            </dd>
          </dl>
        </div>
        <p className="teaching-note" data-testid="mixed-note">
          {qubit.entangled ? (
            <>
              <strong>{name} is mixed.</strong> It is entangled with the other qubits, so on its own
              it has no statevector; only this density matrix describes it.
            </>
          ) : (
            <>
              <strong>{name} is pure.</strong> It is not entangled with the other qubits, so it
              could also be written as a single-qubit statevector.
            </>
          )}
        </p>
      </section>

      <section className="teaching-section" aria-label="Full density matrix">
        <h3>
          Full density matrix{' '}
          <span className="math">
            ρ = <MathText text="|ψ⟩⟨ψ|" />
          </span>{' '}
          ({dim}×{dim})
        </h3>
        {numQubits > MAX_DISPLAY_QUBITS ? (
          <p className="teaching-note" data-testid="too-large">
            Full ρ is {dim}×{dim} — too large to display. The reduced ρ above is computed from it by
            the partial trace.
          </p>
        ) : explicit === null ? (
          <MatrixSkeleton label="full density matrix" size={Math.min(dim, 8)} />
        ) : (
          <>
            <p>
              Hover an entry of{' '}
              <span className="math">
                <Rho qubit={selected} />
              </span>{' '}
              to outline the entries of ρ that are added up to make it (see Partial Trace Steps).
              The bit of {name} is underlined in the labels.
            </p>
            <div className="matrix-scroll">
              <MatrixTable
                matrix={explicit.fullRho}
                numQubits={numQubits}
                label="Full density matrix"
                testId="full-rho"
                highlightQubit={selected}
                highlightCells={termCells}
                compact
              />
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/** Two or more kept qubits: reduced ρ of the set, purity, entropy, and the full ρ. */
function SubsetDensityView({
  numQubits,
  keep,
  data,
}: {
  numQubits: number
  keep: number[]
  data: SubsetData
}) {
  const { result, computing } = data
  const [hovered, setHovered] = useState<[number, number] | null>(null)
  const size = 2 ** keep.length

  // Full-ρ cells that are summed into the hovered reduced entry (entries are row-major).
  const termCells = useMemo(() => {
    if (!hovered || !result?.entries) return undefined
    const entry = result.entries[hovered[0] * size + hovered[1]]
    return entry ? new Set(entry.terms.map((t) => cellKey(t.row, t.col))) : undefined
  }, [hovered, result, size])

  const kept = qubitList(keep) ?? ''
  const title = `Reduced density matrix — ${kept}`
  const toolbar = (
    <KeepSelector numQubits={numQubits} keep={keep}>
      <h2 className="teaching-toolbar__title">{title}</h2>
    </KeepSelector>
  )

  if (computing || result === null) {
    return (
      <div className="teaching">
        {toolbar}
        <MatrixSkeleton label="density matrices" size={Math.min(size, 8)} />
      </div>
    )
  }

  const dim = 2 ** numQubits
  const showReduced = keep.length <= MAX_DISPLAY_KEPT

  return (
    <div className="teaching">
      {toolbar}

      <section className="teaching-section" aria-label={title}>
        <SubsetExplanation numQubits={numQubits} keep={keep} />
        <div className="teaching-row">
          {showReduced ? (
            <div className="matrix-scroll">
              <MatrixTable
                matrix={result.reduced}
                numQubits={keep.length}
                label={`Reduced density matrix of ${kept}`}
                testId="reduced-rho"
                onCellHover={result.entries ? setHovered : undefined}
                activeCell={hovered}
              />
            </div>
          ) : (
            <p className="teaching-note" data-testid="reduced-too-large">
              <Rho qubit={keep} /> is {size}×{size} — too large to display. Its purity and entropy
              are still shown.
            </p>
          )}
          <SubsetQuantities purity={result.purity} entropy={result.entropy} numKept={keep.length} />
        </div>
        <SubsetNote
          numQubits={numQubits}
          keep={keep}
          purity={result.purity}
          entropy={result.entropy}
        />
      </section>

      <section className="teaching-section" aria-label="Full density matrix">
        <h3>
          Full density matrix{' '}
          <span className="math">
            ρ = <MathText text="|ψ⟩⟨ψ|" />
          </span>{' '}
          ({dim}×{dim})
        </h3>
        {numQubits > MAX_DISPLAY_QUBITS ? (
          <p className="teaching-note" data-testid="too-large">
            Full ρ is {dim}×{dim} — too large to display. The reduced ρ above is computed from it by
            the partial trace.
          </p>
        ) : result.fullRho === null ? (
          <p className="teaching-note" data-testid="full-rho-hidden">
            The full ρ and its partial-trace highlights are shown when at most {MAX_DISPLAY_KEPT}{' '}
            qubits are kept.
          </p>
        ) : (
          <>
            <p>
              Hover an entry of{' '}
              <span className="math">
                <Rho qubit={keep} />
              </span>{' '}
              to outline the entries of ρ that are added up to make it (see Partial Trace Steps).
              The bits of {kept} are underlined in the labels.
            </p>
            <div className="matrix-scroll">
              <MatrixTable
                matrix={result.fullRho}
                numQubits={numQubits}
                label="Full density matrix"
                testId="full-rho"
                highlightQubit={keep}
                highlightCells={termCells}
                compact
              />
            </div>
          </>
        )}
      </section>
    </div>
  )
}
