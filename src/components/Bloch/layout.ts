// Sizes the Bloch cards so that every qubit's card fits the bottom panel without scrolling.
//
// The bottom panel is short on a 1280×720 projector (~230 px of content), so a fixed sphere
// size cut off the numbers under each sphere. Instead, the sphere edge is computed from the
// panel's size: try every column count, see how large a sphere fits both the row height and
// the column width, and keep the largest. Pure function, so it is unit-tested directly.
//
// The constants mirror Bloch.css; keep the two in sync.
import type { CSSProperties } from 'react'

/** Grid padding (`.bloch-grid`). */
export const GRID_PAD_X = 8
export const GRID_PAD_Y = 8
/** Gap between cards (`.bloch-grid` gap). */
export const GRID_GAP = 8
/**
 * Card height that is not the sphere: 1 px borders (2) + header (24 + 1 border) +
 * 4 px above the sphere + stats (two 16 px rows, 2 px gap, 6 px bottom padding).
 */
export const CARD_CHROME_H = 2 + 25 + 4 + 40
/** Horizontal space around the sphere inside a card (borders included). */
export const SPHERE_PAD_X = 16
/** Narrowest card that still shows the stats rows in full. */
export const MIN_CARD_W = 164

/** Largest sphere drawn (big panels); default when the panel size is not known yet. */
export const MAX_SPHERE = 200
/** Smallest sphere drawn; below this the panel scrolls instead of shrinking further. */
export const MIN_SPHERE = 96
/** Used before the panel has been measured (and in tests, where nothing has a size). */
export const DEFAULT_SPHERE = 160

export interface BlochLayout {
  /** Sphere canvas edge in CSS px. */
  sphere: number
  /** Card width in CSS px. */
  cardWidth: number
}

function layoutFor(sphere: number): BlochLayout {
  return { sphere, cardWidth: Math.max(MIN_CARD_W, sphere + SPHERE_PAD_X) }
}

/**
 * Card size for `count` cards in a panel of `width` × `height` CSS px.
 * Unknown size (0) gives the default sphere.
 */
export function computeBlochLayout(count: number, width: number, height: number): BlochLayout {
  if (count < 1 || width <= 0 || height <= 0) return layoutFor(DEFAULT_SPHERE)

  let best = -Infinity
  for (let cols = count; cols >= 1; cols--) {
    const cardWidth = Math.floor((width - 2 * GRID_PAD_X - GRID_GAP * (cols - 1)) / cols)
    if (cardWidth < MIN_CARD_W) continue // stats would not fit: try fewer columns
    const rows = Math.ceil(count / cols)
    const rowHeight = Math.floor((height - 2 * GRID_PAD_Y - GRID_GAP * (rows - 1)) / rows)
    const sphere = Math.min(MAX_SPHERE, rowHeight - CARD_CHROME_H, cardWidth - SPHERE_PAD_X)
    best = Math.max(best, sphere)
  }
  return layoutFor(Math.max(MIN_SPHERE, Math.min(MAX_SPHERE, best)))
}

/** Inline style that hands the card width to CSS (`--bloch-card-w`, see `.bloch-card`). */
export function cardWidthStyle(layout: BlochLayout): CSSProperties {
  return { '--bloch-card-w': `${layout.cardWidth}px` } as CSSProperties
}
