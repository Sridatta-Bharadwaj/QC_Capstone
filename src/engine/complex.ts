// Complex-number helpers. (M1 implements.)
import type { Complex } from './types'

export function complex(re: number, im = 0): Complex {
  return { re, im }
}
