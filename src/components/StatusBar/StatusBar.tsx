// Status bar: qubit count, entangled qubits, purity per qubit. (M8 completes.)
import { useCircuitStore } from '../../model/store'
import { MAX_QUBITS } from '../../model/types'
import './StatusBar.css'

export function StatusBar() {
  const numQubits = useCircuitStore((s) => s.circuit.numQubits)
  return (
    <footer className="status-bar">
      <span className="status-bar__item">
        <span className="codicon codicon-circuit-board" aria-hidden="true" />
        {numQubits} / {MAX_QUBITS} qubits
      </span>
    </footer>
  )
}
