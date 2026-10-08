// Circuit model → runnable Qiskit Python (read-only in the app).
//
// The script rebuilds the circuit with QuantumCircuit, then computes the same thing the app
// shows: each qubit's reduced density matrix, obtained by tracing out every other qubit.
// Output is deterministic (same circuit → identical text).
// Wires that start somewhere other than |0⟩ get a marked block of preparation gates right
// after QuantumCircuit(n) (see prep.ts); with all wires in |0⟩ there is no block.
import { formatAngle } from '../model/angle'
import { sortedOperations } from '../model/circuit'
import type { Circuit, GateType, Operation } from '../model/types'
import { PREP_BLOCK_BEGIN, PREP_BLOCK_END, prepGates } from './prep'

/** QuantumCircuit method for each gate. Qubit order matches `Operation.qubits`. */
export const QISKIT_METHODS: Record<GateType, string> = {
  I: 'id',
  H: 'h',
  X: 'x',
  Y: 'y',
  Z: 'z',
  S: 's',
  Sdg: 'sdg',
  T: 't',
  Tdg: 'tdg',
  RX: 'rx',
  RY: 'ry',
  RZ: 'rz',
  CX: 'cx',
  CZ: 'cz',
  SWAP: 'swap',
  CCX: 'ccx',
}

/** One gate as a Qiskit call, e.g. `qc.rx(pi/2, 1)` (angle first, then qubits). */
export function qiskitStatement(op: Operation): string {
  const args = op.qubits.map(String)
  if (op.angle !== undefined) args.unshift(formatAngle(op.angle))
  return `qc.${QISKIT_METHODS[op.gate]}(${args.join(', ')})`
}

/** The whole circuit as a Python script (ends with a newline). */
export function toQiskit(circuit: Circuit): string {
  const single = circuit.numQubits === 1
  const statements = sortedOperations(circuit).map(qiskitStatement)
  const prep = prepGates(circuit.initialStates)
  const prepBlock =
    prep.length === 0
      ? []
      : [
          `# ${PREP_BLOCK_BEGIN}`,
          ...prep.map(({ gate, qubit }) => `qc.${QISKIT_METHODS[gate]}(${qubit})`),
          `# ${PREP_BLOCK_END}`,
        ]
  // Import pi only when an angle is written with it (e.g. "pi/2"): no unused import.
  const usesPi = statements.some((s) => /\bpi\b/.test(s))
  const lines = [
    ...(usesPi ? ['from math import pi', ''] : []),
    'from qiskit import QuantumCircuit',
    single
      ? 'from qiskit.quantum_info import DensityMatrix, Statevector'
      : 'from qiskit.quantum_info import Statevector, partial_trace',
    '',
    `qc = QuantumCircuit(${circuit.numQubits})`,
    ...prepBlock,
    ...statements,
    '',
  ]

  if (single) {
    // Nothing to trace out: the reduced state of the only qubit is the full density matrix.
    lines.push(
      '# Only one qubit, so there is nothing to trace out:',
      '# its reduced density matrix is the full density matrix |psi><psi|.',
      'state = Statevector(qc)',
      'rho = [DensityMatrix(state)]',
    )
  } else {
    lines.push(
      '# Reduced density matrix of each qubit: trace out all the others.',
      '# Note: Qiskit orders qubits little-endian (q0 is the rightmost bit), but',
      '# partial_trace works with qubit indices, so rho[k] is still qubit k.',
      'state = Statevector(qc)',
      'rho = [partial_trace(state, [j for j in range(qc.num_qubits) if j != k]) for k in range(qc.num_qubits)]',
    )
  }
  return lines.join('\n') + '\n'
}
