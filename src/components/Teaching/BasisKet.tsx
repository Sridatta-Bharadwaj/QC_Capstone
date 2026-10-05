// A basis ket such as |0 1 0⟩ with one qubit's bit emphasised.
import { basisParts } from './format'

interface BasisKetProps {
  index: number
  numQubits: number
  /** Qubit whose bit is drawn emphasised (the qubit being kept). */
  highlight?: number | null
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
