// Renders plain strings that contain Dirac notation (|ψ⟩, ⟨ψ|, |ψ⟩⟨ψ|) or a superscript
// sign (Φ⁺) so they look right with the bundled fonts.
//
// Neither IBM Plex Sans nor IBM Plex Mono has the angle brackets ⟨ ⟩ (U+27E8/9) or the
// superscript ⁺ ⁻, so the browser takes them from a system fallback font. Those fallback
// brackets have almost no side bearing, and "|ψ⟩⟨ψ|" came out as an unreadable "⟩⟨" clump,
// while "⁺" became a smudge. Here:
//   - each ket / bra / outer product is set in the mono font (like every other formula in
//     the app) and each bracket gets a little horizontal room;
//   - ⁺ and ⁻ become a real <sup>+</sup> / <sup>−</sup> in the text font.
// The accessible text is unchanged apart from the superscripts ("Φ+").
import type { ReactNode } from 'react'
import './MathText.css'

/** |…⟩ optionally followed by ⟨…| (an outer product), or a lone bra ⟨…|. No spaces inside. */
const DIRAC = /(\|[^|\s⟩]*⟩(?:⟨[^|\s⟩]*\|)?|⟨[^|\s⟩]*\|)/
const SUPERSCRIPT = /([⁺⁻])/

function brackets(ket: string): ReactNode[] {
  return ket.split(/([⟨⟩])/).map((part, i) =>
    part === '⟨' || part === '⟩' ? (
      <span key={i} className="math-text__bracket">
        {part}
      </span>
    ) : (
      part
    ),
  )
}

function superscripts(text: string, keyPrefix: string): ReactNode[] {
  return text.split(SUPERSCRIPT).map((part, i) =>
    part === '⁺' || part === '⁻' ? (
      <sup key={`${keyPrefix}-${i}`} className="math-text__sup">
        {part === '⁺' ? '+' : '−'}
      </sup>
    ) : (
      part
    ),
  )
}

/** `text` with its Dirac notation and superscript signs formatted (see the top of the file). */
export function MathText({ text }: { text: string }) {
  // With a capture group, split() puts the matches at the odd indices.
  const parts = text.split(DIRAC).flatMap((part, i) =>
    i % 2 === 1 ? (
      <span key={i} className="math-text__ket">
        {brackets(part)}
      </span>
    ) : (
      superscripts(part, String(i))
    ),
  )
  return <>{parts}</>
}
