// How one wire of a gate is drawn, following standard circuit-diagram notation:
//   box     – square with the gate label (H, X, Rx …), rotations show their angle underneath
//   control – filled dot
//   target  – ⊕ (the X on the target of CX / CCX)
//   swap    – × (two of them joined by a line make a SWAP)
// Colours come from `currentColor` / CSS variables so both themes work.
import type { GatePartKind } from './placement'

interface GateGlyphProps {
  kind: GatePartKind
  label: string
  /** Formatted angle for rotation gates (box only). */
  angle?: string
}

export function GateGlyph({ kind, label, angle }: GateGlyphProps) {
  switch (kind) {
    case 'control':
      return (
        <svg className="gate-glyph gate-glyph--control" width="12" height="12" aria-hidden="true">
          <circle cx="6" cy="6" r="5" fill="currentColor" />
        </svg>
      )
    case 'target':
      return (
        <svg className="gate-glyph gate-glyph--target" width="24" height="24" aria-hidden="true">
          <circle
            cx="12"
            cy="12"
            r="10.5"
            fill="var(--color-gate-bg)"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <path d="M12 1.5V22.5M1.5 12H22.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      )
    case 'swap':
      return (
        <svg className="gate-glyph gate-glyph--swap" width="14" height="14" aria-hidden="true">
          <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.75" />
        </svg>
      )
    default:
      return (
        <span className={`gate-box${angle === undefined ? '' : ' gate-box--param'}`}>
          <span className="gate-box__label">{label}</span>
          {angle !== undefined && (
            <span className="gate-box__angle" title={angle}>
              {angle}
            </span>
          )}
        </span>
      )
  }
}
