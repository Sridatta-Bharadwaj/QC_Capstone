// One card per qubit: header, Bloch sphere, and the numbers behind it.
//
// Interaction: a click anywhere on the card (or Enter / Space on its focusable body) selects
// the qubit; the spheres stay visible, which matters during a demo. The "Reduced ρ" button
// also selects it and jumps to the Density Matrices tab.
import { Suspense, lazy, type KeyboardEvent } from 'react'
import type { QubitAnalysis } from '../../engine/types'
import { useCircuitStore } from '../../model/store'
import { useUiStore } from '../../model/uiStore'
import { Skeleton } from '../common/Skeleton'
import { formatFixed, formatVector } from './format'
import { DEFAULT_SPHERE } from './layout'
import './Bloch.css'

// three.js + react-three-fiber live in their own chunk; the circle skeleton shows while
// that chunk downloads and WebGL initialises (PLAN.md → Skeleton loaders).
const BlochSphere = lazy(() => import('./BlochSphere').then((m) => ({ default: m.BlochSphere })))

interface BlochCardProps {
  data: QubitAnalysis
  /** Sphere canvas edge in CSS px (BlochPanel fits it to the panel height, see layout.ts). */
  sphereSize?: number
}

export function BlochCard({ data, sphereSize = DEFAULT_SPHERE }: BlochCardProps) {
  const { qubit, bloch, length, purity, entangled } = data
  const selected = useCircuitStore((s) => s.selectedQubit === qubit)
  const selectQubit = useCircuitStore((s) => s.selectQubit)
  const setBottomTab = useUiStore((s) => s.setBottomTab)

  const name = `q${qubit}`
  const statsId = `bloch-stats-${qubit}`

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      selectQubit(qubit)
    }
  }

  const showReducedRho = () => {
    selectQubit(qubit)
    setBottomTab('density')
  }

  return (
    <article
      className="bloch-card"
      data-selected={selected}
      aria-label={`Qubit ${name}`}
      onClick={() => selectQubit(qubit)}
    >
      <header className="bloch-card__header">
        <span className="bloch-card__title">{name}</span>
        {entangled ? (
          <span
            className="bloch-card__tag"
            title="Mixed state: this qubit is entangled with other qubits"
            data-testid="bloch-mixed"
          >
            mixed<span className="bloch-card__tag-extra"> · entangled</span>
          </span>
        ) : (
          <span className="bloch-card__state">pure</span>
        )}
        <button
          type="button"
          className="bloch-card__link"
          title={`Show the reduced density matrix of ${name}`}
          onClick={showReducedRho}
        >
          Reduced ρ
        </button>
      </header>

      {/* Mouse clicks bubble to the article; this body is the keyboard target. */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`Select ${name}`}
        aria-describedby={statsId}
        className="bloch-card__body"
        onKeyDown={onKeyDown}
      >
        <div className="bloch-card__sphere" aria-hidden="true">
          <Suspense fallback={<Skeleton circle width={sphereSize - 16} style={{ margin: 8 }} />}>
            <BlochSphere vector={bloch} size={sphereSize} />
          </Suspense>
        </div>

        <div id={statsId} className="bloch-card__stats">
          <div className="bloch-card__row">
            <span className="bloch-card__key bloch-card__key--r">r</span>
            <span className="bloch-card__value" data-testid="bloch-vector">
              {formatVector(bloch)}
            </span>
          </div>
          <div className="bloch-card__row">
            <span className="bloch-card__key">|r|</span>
            <span className="bloch-card__value" data-testid="bloch-length">
              {formatFixed(length)}
            </span>
            <span className="bloch-card__key">purity</span>
            <span className="bloch-card__value" data-testid="bloch-purity">
              {formatFixed(purity)}
            </span>
          </div>
        </div>
      </div>
    </article>
  )
}
