// Density Matrices tab: the reduced ρₖ of the selected qubit, what can be read off it,
// and the full ρ = |ψ⟩⟨ψ| it comes from.
//
// Math recap (for the presenter):
//  - ρ = |ψ⟩⟨ψ| is the 2ⁿ×2ⁿ density matrix of the whole circuit's state.
//  - ρₖ (2×2) describes qubit k on its own. It is the partial trace of ρ over all other
//    qubits; the spheres use a direct O(2ⁿ) formula that gives the same numbers.
//  - From ρₖ = ½(I + xX + yY + zZ) the Bloch vector is x = 2·Re ρ₀₁, y = −2·Im ρ₀₁,
//    z = ρ₀₀ − ρ₁₁, and the purity is Tr(ρₖ²) = (1 + |r|²)/2.
import { useMemo, useState } from 'react'
import { MatrixSkeleton } from '../Teaching/MatrixSkeleton'
import { MatrixTable } from '../Teaching/MatrixTable'
import { QubitSelector } from '../Teaching/QubitSelector'
import {
  MAX_DISPLAY_QUBITS,
  blochFromRho,
  cellKey,
  formatReal,
  subscript,
} from '../Teaching/format'
import { useTeachingData } from '../Teaching/useTeachingData'
import '../Teaching/Teaching.css'

export function DensityMatricesPanel() {
  const { numQubits, selected, qubit, explicit, computing } = useTeachingData()
  const [hovered, setHovered] = useState<[number, number] | null>(null)

  // Full-ρ cells that are summed into the hovered reduced entry ρₖ[a][b].
  const termCells = useMemo(() => {
    if (!hovered || !explicit) return undefined
    const entry = explicit.entries[hovered[0] * 2 + hovered[1]]
    return new Set(entry.terms.map((t) => cellKey(t.row, t.col)))
  }, [hovered, explicit])

  const name = selected === null ? '' : `q${selected}`
  const title = `Reduced density matrix — ${name}`
  const toolbar = (
    <QubitSelector numQubits={numQubits} selected={selected}>
      <h2 className="teaching-toolbar__title">{title}</h2>
    </QubitSelector>
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
  const k = subscript(selected)
  const dim = 2 ** numQubits

  return (
    <div className="teaching">
      {toolbar}

      <section className="teaching-section" aria-label={title}>
        <p>
          <span className="math">ρ{k}</span> describes {name} on its own. Rows and columns are the
          basis states <span className="math">|0⟩</span>, <span className="math">|1⟩</span> of{' '}
          {name}.
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
          Full density matrix <span className="math">ρ = |ψ⟩⟨ψ|</span> ({dim}×{dim})
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
              Hover an entry of <span className="math">ρ{k}</span> to outline the entries of ρ that
              are added up to make it (see Partial Trace Steps). The bit of {name} is underlined in
              the labels.
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
