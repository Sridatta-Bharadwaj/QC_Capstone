// A complex matrix drawn as a table with ket labels on rows and columns.
// Cell background: flat accent tint whose opacity grows with |entry| (no gradients),
// so the non-zero structure is visible at a glance. Zero entries are dimmed.
import type { CSSProperties } from 'react'
import type { ComplexMatrix } from '../../engine/types'
import { BasisKet } from './BasisKet'
import { cellKey, formatComplex, isZero, magnitude } from './format'

interface MatrixTableProps {
  matrix: ComplexMatrix
  /** Qubits the row/column index runs over (1 for a reduced 2×2 ρ). */
  numQubits: number
  /** Accessible caption, e.g. "Reduced density matrix of q1". */
  label: string
  /** Qubit whose bit is emphasised in the labels. */
  highlightQubit?: number | null
  /** Cells drawn outlined, as "row,col" keys. */
  highlightCells?: ReadonlySet<string>
  /** Called with [row, col] on hover/focus, and null on leave. */
  onCellHover?: (cell: [number, number] | null) => void
  activeCell?: [number, number] | null
  compact?: boolean
  testId?: string
}

export function MatrixTable({
  matrix,
  numQubits,
  label,
  highlightQubit = null,
  highlightCells,
  onCellHover,
  activeCell = null,
  compact = false,
  testId,
}: MatrixTableProps) {
  const size = matrix.length
  const interactive = onCellHover !== undefined

  return (
    <table
      className={`matrix${compact ? ' matrix--compact' : ''}`}
      aria-label={label}
      data-testid={testId}
    >
      <thead>
        <tr>
          <td className="matrix__corner" />
          {Array.from({ length: size }, (_, c) => (
            <th key={c} scope="col">
              <BasisKet index={c} numQubits={numQubits} highlight={highlightQubit} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {matrix.map((row, r) => (
          <tr key={r}>
            <th scope="row">
              <BasisKet index={r} numQubits={numQubits} highlight={highlightQubit} />
            </th>
            {row.map((z, c) => {
              const zero = isZero(z)
              const active = activeCell !== null && activeCell[0] === r && activeCell[1] === c
              const marked = highlightCells?.has(cellKey(r, c)) ?? false
              const style = { '--mag': Math.min(1, magnitude(z)) } as CSSProperties
              return (
                <td
                  key={c}
                  style={style}
                  className={[
                    'matrix__cell',
                    zero ? 'matrix__cell--zero' : '',
                    marked ? 'matrix__cell--marked' : '',
                    active ? 'matrix__cell--active' : '',
                  ]
                    .join(' ')
                    .trim()}
                  tabIndex={interactive ? 0 : undefined}
                  onMouseEnter={interactive ? () => onCellHover([r, c]) : undefined}
                  onMouseLeave={interactive ? () => onCellHover(null) : undefined}
                  onFocus={interactive ? () => onCellHover([r, c]) : undefined}
                  onBlur={interactive ? () => onCellHover(null) : undefined}
                >
                  <span className="matrix__value">{formatComplex(z)}</span>
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
