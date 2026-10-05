// Bloch vector, purity and per-qubit analysis. (M1 implements.)
import type { Circuit } from '../model/types'
import type { BlochVector, CircuitAnalysis, ComplexMatrix } from './types'

export function blochVector(_rho: ComplexMatrix): BlochVector {
  throw new Error('blochVector: not implemented (M1)')
}

export function purity(_rho: ComplexMatrix): number {
  throw new Error('purity: not implemented (M1)')
}

export function analyze(_circuit: Circuit): CircuitAnalysis {
  throw new Error('analyze: not implemented (M1)')
}
