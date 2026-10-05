// Number formatting for the Bloch cards (mono, tabular, fixed decimals).
// Same rules as the teaching views: a real minus sign (U+2212), never "−0.000".
import { formatReal } from '../Teaching/format'

/** Fixed-decimal string with a typographic minus; tiny negative rounding noise shows as 0. */
export function formatFixed(value: number, digits = 3): string {
  return formatReal(value, digits)
}

/** "(x, y, z)" with each component to 3 decimals. */
export function formatVector(v: { x: number; y: number; z: number }, digits = 3): string {
  return `(${formatFixed(v.x, digits)}, ${formatFixed(v.y, digits)}, ${formatFixed(v.z, digits)})`
}
