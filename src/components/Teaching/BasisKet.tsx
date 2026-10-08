// A basis ket such as |0 1 0⟩ with the kept qubit's (or qubits') bits emphasised.
import { basisParts, type QubitHighlight } from './format'

interface BasisKetProps {
  index: number
  numQubits: number
  /** Qubit(s) whose bit is drawn emphasised (the kept qubit or qubits). */
  highlight?: QubitHighlight
}

export function BasisKet({ index, numQubits, highlight = null }: BasisKetProps) {
  const parts = basisParts(index, numQubits, highlight)
  return (
    <span className="ket">
      |
      {parts.map((p) =>
        p.highlighted ? (
          <b key={p.qubit} className="ket__bit--kept" title={`q${p.qubit}`}>
            {p.bit}
          </b>
        ) : (
          <span key={p.qubit}>{p.bit}</span>
        ),
      )}
      ⟩
    </span>
  )
}
