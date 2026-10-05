// Reduced density matrices. (M1 implements.)
import type { ComplexMatrix, PartialTraceResult, StateVector } from './types'

export function densityMatrix(_state: StateVector): ComplexMatrix {
  throw new Error('densityMatrix: not implemented (M1)')
}

export function reducedDensityMatrix(
  _state: StateVector,
  _numQubits: number,
  _qubit: number,
): ComplexMatrix {
  throw new Error('reducedDensityMatrix: not implemented (M1)')
}

export function partialTraceExplicit(
  _state: StateVector,
  _numQubits: number,
  _qubit: number,
): PartialTraceResult {
  throw new Error('partialTraceExplicit: not implemented (M1)')
}
