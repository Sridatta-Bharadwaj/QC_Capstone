// Circuit model → OpenQASM 2.0 text.
//
// The output is deterministic: same circuit in, byte-identical text out. M7 parses this
// text back into a circuit, so the format here is also the "canonical" QASM of the app.
//
//   OPENQASM 2.0;
//   include "qelib1.inc";
//
//   qreg q[2];
//
//   h q[0];
//   cx q[0],q[1];
//
// No `creg` / `measure`: measurement is not part of v1.
import { formatAngle } from '../model/angle'
import { sortedOperations } from '../model/circuit'
import type { Circuit, GateType, Operation } from '../model/types'

/** OpenQASM 2.0 (qelib1.inc) name of each gate. Qubit order matches `Operation.qubits`. */
export const QASM_GATE_NAMES: Record<GateType, string> = {
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

/** One gate as a QASM statement, e.g. `rx(pi/2) q[1];` or `cx q[0],q[1];`. */
export function qasmStatement(op: Operation): string {
  const name = QASM_GATE_NAMES[op.gate]
  const params = op.angle === undefined ? '' : `(${formatAngle(op.angle)})`
  const args = op.qubits.map((q) => `q[${q}]`).join(',')
  return `${name}${params} ${args};`
}

/** The whole circuit as an OpenQASM 2.0 program (ends with a newline). */
export function toQasm(circuit: Circuit): string {
  const lines = ['OPENQASM 2.0;', 'include "qelib1.inc";', '', `qreg q[${circuit.numQubits}];`]
  const ops = sortedOperations(circuit)
  if (ops.length > 0) {
    lines.push('')
    for (const op of ops) lines.push(qasmStatement(op))
  }
  return lines.join('\n') + '\n'
}
