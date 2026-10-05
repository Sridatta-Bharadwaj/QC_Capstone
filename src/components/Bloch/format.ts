// Number formatting for the Bloch cards (mono, tabular, fixed decimals).

/** Fixed-decimal string that never shows "-0.000" for tiny negative rounding noise. */
export function formatFixed(value: number, digits = 3): string {
  const text = value.toFixed(digits)
  return Number(text) === 0 ? (0).toFixed(digits) : text
}

/** "(x, y, z)" with each component to 3 decimals. */
export function formatVector(v: { x: number; y: number; z: number }, digits = 3): string {
  return `(${formatFixed(v.x, digits)}, ${formatFixed(v.y, digits)}, ${formatFixed(v.z, digits)})`
}
