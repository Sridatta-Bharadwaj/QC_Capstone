import { describe, expect, it } from 'vitest'
import {
  CARD_CHROME_H,
  DEFAULT_SPHERE,
  GRID_GAP,
  GRID_PAD_X,
  GRID_PAD_Y,
  MAX_SPHERE,
  MIN_CARD_W,
  MIN_SPHERE,
  computeBlochLayout,
} from '../../src/components/Bloch/layout'

/** Height and width a layout needs for `count` cards in `cols` columns. */
function footprint(count: number, cols: number, layout: { sphere: number; cardWidth: number }) {
  const rows = Math.ceil(count / cols)
  return {
    width: 2 * GRID_PAD_X + cols * layout.cardWidth + (cols - 1) * GRID_GAP,
    height: 2 * GRID_PAD_Y + rows * (layout.sphere + CARD_CHROME_H) + (rows - 1) * GRID_GAP,
  }
}

// Bottom panel content measured in the app at 1280×720 (default 40 % split): 1074 × 234.
const SMALL = { width: 1074, height: 234 }

describe('computeBlochLayout', () => {
  it('uses the default sphere before the panel has a size', () => {
    expect(computeBlochLayout(3, 0, 0).sphere).toBe(DEFAULT_SPHERE)
  })

  it.each([1, 2, 3, 4, 5, 6])(
    'fits %i card(s) in one row of the 1280×720 panel without scrolling',
    (n) => {
      const layout = computeBlochLayout(n, SMALL.width, SMALL.height)
      expect(layout.sphere).toBeGreaterThanOrEqual(MIN_SPHERE)
      expect(layout.cardWidth).toBeGreaterThanOrEqual(MIN_CARD_W)
      const used = footprint(n, n, layout)
      expect(used.width).toBeLessThanOrEqual(SMALL.width)
      expect(used.height).toBeLessThanOrEqual(SMALL.height)
    },
  )

  it('grows the spheres in a taller panel, up to the maximum', () => {
    const small = computeBlochLayout(3, SMALL.width, SMALL.height)
    const tall = computeBlochLayout(3, 1200, 300)
    expect(tall.sphere).toBeGreaterThan(small.sphere)
    expect(computeBlochLayout(3, 2000, 1000).sphere).toBe(MAX_SPHERE)
  })

  it('wraps to more rows when one row would be too narrow', () => {
    const layout = computeBlochLayout(6, 600, 600)
    expect(layout.cardWidth).toBeGreaterThanOrEqual(MIN_CARD_W)
    const cols = Math.floor((600 - 2 * GRID_PAD_X + GRID_GAP) / (layout.cardWidth + GRID_GAP))
    expect(cols).toBeLessThan(6)
    expect(footprint(6, cols, layout).height).toBeLessThanOrEqual(600)
  })

  it('never goes below the minimum sphere (the panel scrolls instead)', () => {
    expect(computeBlochLayout(6, 300, 100).sphere).toBe(MIN_SPHERE)
  })
})
