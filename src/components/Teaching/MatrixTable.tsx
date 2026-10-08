// A complex matrix drawn as a table with ket labels on rows and columns.
// Cell background: flat accent tint whose opacity grows with |entry| (no gradients),
// so the non-zero structure is visible at a glance. Zero entries are dimmed.
import type { CSSProperties } from 'react'
import type { ComplexMatrix } from '../../engine/types'
import { BasisKet } from './BasisKet'
import { cellKey, formatComplex, isZero, magnitude, type QubitHighlight } from './format'

/** From this size on (16×16 = 4 qubits) cells get a smaller font and padding to fit the panel. */
const DENSE_SIZE = 16

interface MatrixTableProps {
  matrix: ComplexMatrix
  /** Qubits the row/column index runs over (1 for a reduced 2×2 ρ). */
  numQubits: number
  /** Accessible caption, e.g. "Reduced density matrix of q1". */
  label: string
  /** Qubit(s) whose bit is emphasised in the labels. */
  highlightQubit?: QubitHighlight
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
  // Every value cell is as wide as the longest entry (in mono "ch" units), so all columns
  // have the same width whatever their contents ("0.000" next to "0.250 + 0.250i").
  const cellChars = Math.max(1, ...matrix.flat().map((z) => formatComplex(z).length))
  const tableStyle = { '--cell-ch': cellChars } as CSSProperties

  return (
    <table
      className={[
        'matrix',
        compact ? 'matrix--compact' : '',
        size >= DENSE_SIZE ? 'matrix--dense' : '',
      ]
        .join(' ')
        .trim()}
      aria-label={label}
      data-testid={testId}
      style={tableStyle}
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
