// Problem messages shared by the QASM and Qiskit parsers, so both tabs say the same thing
// about the same situation (measurement, size limits).
import { MAX_OPERATIONS, MAX_UPLOAD_BYTES } from '../model/types'

/** Longest code we parse (characters), in either tab. Same budget as an uploaded file. */
export const MAX_SOURCE_LENGTH = MAX_UPLOAD_BYTES

/** Warning on a measurement that comes after the last gate on the qubits it measures. */
export const FINAL_MEASUREMENT_MESSAGE =
  'Final measurements ignored: showing the state just before measurement'

/** Error on a gate that acts on a qubit that was already measured (mid-circuit measurement). */
export function gateAfterMeasurementMessage(qubit: string, measuredOnLine: number): string {
  return (
    `Gate after a measurement: qubit ${qubit} was measured on line ${measuredOnLine}. ` +
    'Only final measurements are supported (they are ignored).'
  )
}

/** Error when a circuit grows past MAX_OPERATIONS gates; parsing stops there. */
export const TOO_MANY_GATES_MESSAGE = `Too many gates: a circuit can have at most ${MAX_OPERATIONS}.`

/** Error for code longer than MAX_SOURCE_LENGTH; it is not parsed at all. */
export function tooLongMessage(length: number): string {
  return (
    `The code is too long (${Math.ceil(length / 1024)} KB); the limit is ` +
    `${MAX_SOURCE_LENGTH / 1024} KB.`
  )
}
