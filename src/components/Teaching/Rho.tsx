// "ρₖ" with a real <sub> element. IBM Plex Mono has no Unicode subscript digits, so
// "ρ₀" would fall back to a tiny glyph inside monospace text.
export function Rho({ qubit }: { qubit: number }) {
  return (
    <span className="rho">
      ρ<sub>{qubit}</sub>
    </span>
  )
}
