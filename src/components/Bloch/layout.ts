// Sizes the Bloch cards so that every qubit's card fits the bottom panel without scrolling,
// with the spheres as large as the panel allows (they are the main output of the app).
//
// A card is a header, the sphere, and the numbers behind it. The numbers can sit in one of
// three places, and each fits a different panel shape:
//   - 'below': two rows under the sphere, "r (x, y, z)" then "|r| … purity …". Needs a card
//              at least MIN_CARD_W wide. The default before the panel is measured.
//   - 'side':  a column of five short rows (x, y, z, |r|, purity) right of the sphere. Costs
//              width instead of height, so it wins in short, wide panels (few qubits).
//   - 'stack': the same five short rows, but under the sphere. Costs height instead of
//              width, so it wins in narrow cards (6 qubits on a small screen).
// For every column count and every mode we compute how large a sphere fits both the row
// height and the column width, and keep the largest. Pure function, so it is unit-tested.
//
// The constants mirror Bloch.css; keep the two in sync.
import type { CSSProperties } from 'react'

/** Grid padding (`.bloch-grid`). */
export const GRID_PAD_X = 8
export const GRID_PAD_Y = 8
/** Gap between cards (`.bloch-grid` gap). */
export const GRID_GAP = 8

/** Card borders (2) + header (24 + 1 border) + 4 px above the sphere. Common to every mode. */
const CARD_TOP_H = 2 + 25 + 4

/** 'below': stats are two 16 px rows, 2 px gap, 6 px bottom padding. */
export const CARD_CHROME_H = CARD_TOP_H + 40
/** 'stack': five 16 px rows, 2 px gaps, 4 px top and 6 px bottom padding. */
export const STACK_CHROME_H = CARD_TOP_H + 5 * 16 + 4 * 2 + 4 + 6
/** 'side': only 4 px under the sphere (the stats are next to it). */
export const SIDE_CHROME_H = CARD_TOP_H + 4

/** Horizontal space around the sphere inside a card (borders included). */
export const SPHERE_PAD_X = 16
/** 'side': width of the stats column (incl. its padding) + borders + 8 px left of the sphere. */
export const SIDE_STATS_W = 112
export const SIDE_CHROME_W = SIDE_STATS_W + 2 + 8

/** Narrowest 'below' card that still shows the two stats rows in full. */
export const MIN_CARD_W = 164
/** Narrowest 'stack' card: the header (name, pure/mixed, ρ link) must still fit. */
export const MIN_STACK_CARD_W = 124

/** Largest sphere drawn (big panels, few qubits). */
export const MAX_SPHERE = 320
/** Smallest sphere drawn; below this the panel scrolls instead of shrinking further. */
export const MIN_SPHERE = 96
/** Used before the panel has been measured (and in tests, where nothing has a size). */
export const DEFAULT_SPHERE = 160

export type StatsPlacement = 'below' | 'side' | 'stack'

export interface BlochLayout {
  /** Sphere canvas edge in CSS px. */
  sphere: number
  /** Card width in CSS px. */
  cardWidth: number
  /** Where the numbers go relative to the sphere. */
  stats: StatsPlacement
}

/** Card width for a sphere of edge `sphere` in the given mode. */
function cardWidthFor(sphere: number, stats: StatsPlacement): number {
  if (stats === 'side') return sphere + SIDE_CHROME_W
  if (stats === 'stack') return Math.max(MIN_STACK_CARD_W, sphere + SPHERE_PAD_X)
  return Math.max(MIN_CARD_W, sphere + SPHERE_PAD_X)
}

/** Largest sphere that fits a grid cell of `cellW` × `cellH` in the given mode (may be < 0). */
function sphereFor(stats: StatsPlacement, cellW: number, cellH: number): number {
  switch (stats) {
    case 'below':
      if (cellW < MIN_CARD_W) return -Infinity // the stats rows would be cut off
      return Math.min(cellH - CARD_CHROME_H, cellW - SPHERE_PAD_X)
    case 'stack':
      if (cellW < MIN_STACK_CARD_W) return -Infinity
      return Math.min(cellH - STACK_CHROME_H, cellW - SPHERE_PAD_X)
    case 'side':
      return Math.min(cellH - SIDE_CHROME_H, cellW - SIDE_CHROME_W)
  }
}

// On a tie the earlier mode wins: 'below' is the most familiar, 'stack' the last resort.
const MODES: StatsPlacement[] = ['below', 'side', 'stack']

/**
 * Card size and stats placement for `count` cards in a panel of `width` × `height` CSS px.
 * Unknown size (0) gives the default sphere with the stats below.
 */
export function computeBlochLayout(count: number, width: number, height: number): BlochLayout {
  const fallback: BlochLayout = {
    sphere: DEFAULT_SPHERE,
    cardWidth: cardWidthFor(DEFAULT_SPHERE, 'below'),
    stats: 'below',
  }
  if (count < 1 || width <= 0 || height <= 0) return fallback

  let best = { sphere: -Infinity, stats: 'below' as StatsPlacement }
  for (let cols = count; cols >= 1; cols--) {
    const rows = Math.ceil(count / cols)
    const cellW = Math.floor((width - 2 * GRID_PAD_X - GRID_GAP * (cols - 1)) / cols)
    const cellH = Math.floor((height - 2 * GRID_PAD_Y - GRID_GAP * (rows - 1)) / rows)
    for (const stats of MODES) {
      const sphere = Math.min(MAX_SPHERE, sphereFor(stats, cellW, cellH))
      if (sphere > best.sphere) best = { sphere, stats }
    }
  }

  // Nothing fits even at the minimum: keep the minimum size and let the panel scroll.
  // ('below' needs the widest card, so a too-narrow panel falls back to 'stack'.)
  if (best.sphere < MIN_SPHERE) {
    const stats: StatsPlacement = width - 2 * GRID_PAD_X >= MIN_CARD_W ? 'below' : 'stack'
    return { sphere: MIN_SPHERE, cardWidth: cardWidthFor(MIN_SPHERE, stats), stats }
  }
  const sphere = Math.floor(best.sphere)
  return { sphere, cardWidth: cardWidthFor(sphere, best.stats), stats: best.stats }
}

/** Inline style that hands the card width to CSS (`--bloch-card-w`, see `.bloch-card`). */
export function cardWidthStyle(layout: BlochLayout): CSSProperties {
  return { '--bloch-card-w': `${layout.cardWidth}px` } as CSSProperties
}
