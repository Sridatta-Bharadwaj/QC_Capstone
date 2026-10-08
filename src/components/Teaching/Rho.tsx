// "ρₖ" with a real <sub> element. IBM Plex Mono has no Unicode subscript digits, so
// "ρ₀" would fall back to a tiny glyph inside monospace text.
// For a kept set of qubits the subscript lists them: ρ with subscript "0,2" (q0 and q2).
export function Rho({ qubit }: { qubit: number | readonly number[] }) {
  const label = typeof qubit === 'number' ? String(qubit) : qubit.join(',')
  return (
    <span className="rho">
      ρ<sub>{label}</sub>
    </span>
  )
}
