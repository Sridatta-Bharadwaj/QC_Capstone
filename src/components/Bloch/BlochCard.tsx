// One card per qubit: header, Bloch sphere, and the numbers behind it.
//
// Interaction: a click anywhere on the card (or Enter / Space on its focusable body) selects
// the qubit; the spheres stay visible, which matters during a demo. The "Reduced ρ" button
// also selects it and jumps to the Density Matrices tab.
import { Suspense, lazy, type KeyboardEvent } from 'react'
import type { QubitAnalysis } from '../../engine/types'
import { useCircuitStore } from '../../model/store'
import { useUiStore } from '../../model/uiStore'
import { ErrorBoundary } from '../common/ErrorBoundary'
import { Skeleton } from '../common/Skeleton'
import { BlochSphereSvg } from './BlochSphereSvg'
import { formatFixed, formatVector } from './format'
import { DEFAULT_SPHERE, type StatsPlacement } from './layout'
import { hasWebGL } from './webgl'
import './Bloch.css'

// three.js + react-three-fiber live in their own chunk; the circle skeleton shows while
// that chunk downloads and WebGL initialises (PLAN.md → Skeleton loaders).
const BlochSphere = lazy(() => import('./BlochSphere').then((m) => ({ default: m.BlochSphere })))

interface BlochCardProps {
  data: QubitAnalysis
  /** Sphere canvas edge in CSS px (BlochPanel fits it to the panel height, see layout.ts). */
  sphereSize?: number
  /** Where the numbers go: under the sphere (two rows or five short rows) or beside it. */
  stats?: StatsPlacement
}

export function BlochCard({ data, sphereSize = DEFAULT_SPHERE, stats = 'below' }: BlochCardProps) {
  const { qubit, bloch, entangled } = data
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
          aria-label="Reduced ρ"
          onClick={showReducedRho}
        >
          {/* Narrow cards drop the word and keep just "ρ" (see Bloch.css). */}
          <span className="bloch-card__link-word">Reduced </span>
          <span className="bloch-card__rho">ρ</span>
        </button>
      </header>

      {/* Mouse clicks bubble to the article; this body is the keyboard target. */}
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        aria-label={`Select ${name}`}
        aria-describedby={statsId}
        className={`bloch-card__body bloch-card__body--${stats}`}
        onKeyDown={onKeyDown}
      >
        <div className="bloch-card__sphere" aria-hidden="true">
          {hasWebGL() ? (
            // If the 3D sphere fails at runtime (e.g. the WebGL context cannot be created or
            // is lost), this card falls back to the flat sphere instead of breaking the page.
            <ErrorBoundary fallback={() => <BlochSphereSvg vector={bloch} size={sphereSize} />}>
              <Suspense
                fallback={<Skeleton circle width={sphereSize - 16} style={{ margin: 8 }} />}
              >
                <BlochSphere vector={bloch} size={sphereSize} />
              </Suspense>
            </ErrorBoundary>
          ) : (
            <BlochSphereSvg vector={bloch} size={sphereSize} />
          )}
        </div>

        {stats === 'below' ? (
          <StatsRows id={statsId} data={data} />
        ) : (
          <StatsList id={statsId} data={data} />
        )}
      </div>
    </article>
  )
}

/** Two rows under the sphere: "r (x, y, z)", then |r| and purity. */
function StatsRows({ id, data }: { id: string; data: QubitAnalysis }) {
  return (
    <div id={id} className="bloch-card__stats">
      <div className="bloch-card__row">
        <span className="bloch-card__key bloch-card__key--r">r</span>
        <span className="bloch-card__value" data-testid="bloch-vector">
          {formatVector(data.bloch)}
        </span>
      </div>
      <div className="bloch-card__row">
        <span className="bloch-card__key">|r|</span>
        <span className="bloch-card__value" data-testid="bloch-length">
          {formatFixed(data.length)}
        </span>
        <span className="bloch-card__key">purity</span>
        <span className="bloch-card__value" data-testid="bloch-purity">
          {formatFixed(data.purity)}
        </span>
      </div>
    </div>
  )
}

/**
 * Five short rows: the components of r (keys in the axis colours, like the sphere) and then
 * |r| and purity. Used beside the sphere, or under it in narrow cards.
 */
function StatsList({ id, data }: { id: string; data: QubitAnalysis }) {
  const { bloch } = data
  const rows: [key: string, value: number, keyClass: string, testId: string][] = [
    ['x', bloch.x, 'bloch-card__key--x', 'bloch-x'],
    ['y', bloch.y, 'bloch-card__key--y', 'bloch-y'],
    ['z', bloch.z, 'bloch-card__key--z', 'bloch-z'],
    ['|r|', data.length, '', 'bloch-length'],
    ['purity', data.purity, '', 'bloch-purity'],
  ]
  return (
    <dl id={id} className="bloch-card__stats bloch-card__stats--list">
      {rows.map(([key, value, keyClass, testId]) => (
        <div key={key} className="bloch-card__row">
          <dt className={`bloch-card__key ${keyClass}`}>{key}</dt>
          <dd className="bloch-card__value" data-testid={testId}>
            {formatFixed(value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}
