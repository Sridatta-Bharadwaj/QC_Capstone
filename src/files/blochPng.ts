// Bloch spheres as one PNG (V2-3): the pure part — where each card goes in the image and
// which text it shows. No DOM here, so it is unit-tested; blochPngExport.ts does the drawing.
//
//   ┌──────────────────────────────────────────┐
//   │ Bloch spheres · 3 qubits                  │  title
//   │ ┌────────┐ ┌────────┐ ┌────────┐          │
//   │ │q0  pure│ │q1 mixed│ │q2 mixed│          │  card header
//   │ │ sphere │ │ sphere │ │ sphere │          │  the live sphere, redrawn
//   │ │x  0.000│ │x  0.000│ │ …      │          │  x, y, z, |r|, purity
//   │ └────────┘ └────────┘ └────────┘          │
//   └──────────────────────────────────────────┘
import type { QubitAnalysis } from '../engine/types'
import { formatFixed } from '../components/Bloch/format'

/** Sizes in CSS pixels (the image is drawn at 2× for sharp text). */
export const PNG_METRICS = {
  /** Outer margin of the image. */
  margin: 16,
  /** Height of the title line. */
  title: 28,
  /** Space between cards. */
  gap: 12,
  /** Inner padding of a card. */
  padding: 12,
  /** Card header (qubit name + pure / mixed). */
  header: 24,
  /** Sphere edge. */
  sphere: 200,
  /** Space between the sphere and the numbers. */
  statsGap: 8,
  /** One line of numbers. */
  row: 18,
} as const

/** Rows of numbers under each sphere. */
export const STATS_ROWS = 5

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface PngCardLayout {
  card: Rect
  /** Baseline-left of the header text. */
  header: { x: number; y: number }
  sphere: Rect
  /** Top-left of the first row of numbers; rows are PNG_METRICS.row apart. */
  stats: { x: number; y: number; width: number }
}

export interface PngLayout {
  width: number
  height: number
  columns: number
  rows: number
  /** Baseline-left of the title. */
  title: { x: number; y: number }
  cards: PngCardLayout[]
}

/** Columns for n cards: one row up to 3, then 2 × 2 for four, then rows of three. */
export function pngColumns(count: number): number {
  if (count <= 3) return Math.max(1, count)
  return count === 4 ? 2 : 3
}

/** Where everything goes in an image of `count` qubit cards. */
export function blochPngLayout(count: number): PngLayout {
  const m = PNG_METRICS
  const columns = pngColumns(count)
  const rows = Math.max(1, Math.ceil(count / columns))
  const cardWidth = m.sphere + 2 * m.padding
  const cardHeight = m.padding + m.header + m.sphere + m.statsGap + STATS_ROWS * m.row + m.padding
  const top = m.margin + m.title

  const cards: PngCardLayout[] = Array.from({ length: count }, (_, i) => {
    const x = m.margin + (i % columns) * (cardWidth + m.gap)
    const y = top + Math.floor(i / columns) * (cardHeight + m.gap)
    const sphereY = y + m.padding + m.header
    return {
      card: { x, y, width: cardWidth, height: cardHeight },
      header: { x: x + m.padding, y: y + m.padding + 14 },
      sphere: { x: x + m.padding, y: sphereY, width: m.sphere, height: m.sphere },
      stats: { x: x + m.padding, y: sphereY + m.sphere + m.statsGap, width: m.sphere },
    }
  })

  return {
    width: 2 * m.margin + columns * cardWidth + (columns - 1) * m.gap,
    height: top + rows * cardHeight + (rows - 1) * m.gap + m.margin,
    columns,
    rows,
    title: { x: m.margin, y: m.margin + 14 },
    cards,
  }
}

export interface StatRow {
  key: string
  value: string
  /** Bloch axis the key is coloured with (x red, y green, z blue), if any. */
  axis?: 'x' | 'y' | 'z'
}

export interface CardText {
  title: string
  /** 'pure', or 'mixed · entangled' when |r| < 1. */
  state: string
  rows: StatRow[]
}

/** The text on one card: same numbers and formatting as the card in the app. */
export function blochCardText(q: QubitAnalysis): CardText {
  return {
    title: `q${q.qubit}`,
    state: q.entangled ? 'mixed · entangled' : 'pure',
    rows: [
      { key: 'x', value: formatFixed(q.bloch.x), axis: 'x' },
      { key: 'y', value: formatFixed(q.bloch.y), axis: 'y' },
      { key: 'z', value: formatFixed(q.bloch.z), axis: 'z' },
      { key: '|r|', value: formatFixed(q.length) },
      { key: 'purity', value: formatFixed(q.purity) },
    ],
  }
}

/**
 * Title line of the image. `stepText` (e.g. "step 1 / 2 · after column 0") is added when the
 * step debugger is not Live, so the image says which state it shows.
 */
export function blochPngTitle(numQubits: number, stepText: string | null = null): string {
  const title = `Bloch spheres · ${numQubits} ${numQubits === 1 ? 'qubit' : 'qubits'}`
  return stepText ? `${title} · ${stepText}` : title
}

/**
 * Maps a label's centre from the live sphere (its size on screen) onto the sphere in the image,
 * so the |0⟩ / |1⟩ / x / y labels land where they are on screen.
 */
export function mapLabelPoint(
  label: { x: number; y: number },
  liveSize: number,
  target: Rect,
): { x: number; y: number; scale: number } {
  const scale = liveSize > 0 ? target.width / liveSize : 1
  return { x: target.x + label.x * scale, y: target.y + label.y * scale, scale }
}
