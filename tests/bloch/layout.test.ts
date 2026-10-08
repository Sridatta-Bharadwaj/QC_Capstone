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
  MIN_STACK_CARD_W,
  SIDE_CHROME_H,
  STACK_CHROME_H,
  computeBlochLayout,
  type BlochLayout,
} from '../../src/components/Bloch/layout'

const CHROME_H = { below: CARD_CHROME_H, side: SIDE_CHROME_H, stack: STACK_CHROME_H }

/** Height and width a layout needs for `count` cards in `cols` columns. */
function footprint(count: number, cols: number, layout: BlochLayout) {
  const rows = Math.ceil(count / cols)
  return {
    width: 2 * GRID_PAD_X + cols * layout.cardWidth + (cols - 1) * GRID_GAP,
    height:
      2 * GRID_PAD_Y + rows * (layout.sphere + CHROME_H[layout.stats]) + (rows - 1) * GRID_GAP,
  }
}

/** How many cards of this layout fit side by side in `width`. */
function columnsIn(width: number, layout: BlochLayout) {
  return Math.floor((width - 2 * GRID_PAD_X + GRID_GAP) / (layout.cardWidth + GRID_GAP))
}

// Bottom panel content measured in the app with 6 qubits (default 55 / 45 split).
const P1280 = { width: 1074, height: 267 }
const P1024 = { width: 859, height: 289 }
const P1440 = { width: 1209, height: 411 }
// With 1–2 qubits the split fits the canvas to the wires (Layout/canvasFit.ts).
const P1280_FEW = { width: 1074, height: 400 }
const P1440_FEW = { width: 1209, height: 517 }

describe('computeBlochLayout', () => {
  it('uses the default sphere with the stats below before the panel has a size', () => {
    const layout = computeBlochLayout(3, 0, 0)
    expect(layout.sphere).toBe(DEFAULT_SPHERE)
    expect(layout.stats).toBe('below')
  })

  it.each([
    ['1280×720', P1280],
    ['1024×768', P1024],
    ['1440×900', P1440],
  ])('fits 6 cards in one row at %s without scrolling', (_name, panel) => {
    const layout = computeBlochLayout(6, panel.width, panel.height)
    expect(layout.sphere).toBeGreaterThanOrEqual(MIN_SPHERE)
    const used = footprint(6, 6, layout)
    expect(used.width).toBeLessThanOrEqual(panel.width)
    expect(used.height).toBeLessThanOrEqual(panel.height)
  })

  it.each([1, 2, 3, 4, 5, 6])('fits %i card(s) in the 1280×720 panel without scrolling', (n) => {
    const layout = computeBlochLayout(n, P1280.width, P1280.height)
    const cols = Math.min(n, columnsIn(P1280.width, layout))
    const used = footprint(n, cols, layout)
    expect(used.width).toBeLessThanOrEqual(P1280.width)
    expect(used.height).toBeLessThanOrEqual(P1280.height)
  })

  it('uses narrow cards with the numbers stacked for 6 qubits at 1024×768', () => {
    const layout = computeBlochLayout(6, P1024.width, P1024.height)
    expect(layout.stats).toBe('stack')
    expect(layout.cardWidth).toBeGreaterThanOrEqual(MIN_STACK_CARD_W)
    expect(layout.cardWidth).toBeLessThan(MIN_CARD_W)
    expect(layout.sphere).toBeGreaterThanOrEqual(110)
  })

  it('puts the numbers beside the sphere in a short, wide panel', () => {
    const layout = computeBlochLayout(2, P1280.width, P1280.height)
    expect(layout.stats).toBe('side')
    // Beside beats below by the height the two stats rows would take.
    expect(layout.sphere).toBe(P1280.height - 2 * GRID_PAD_Y - SIDE_CHROME_H)
  })

  it.each([1, 2, 3])('draws the largest sphere for %i qubit(s) on bigger screens', (n) => {
    expect(computeBlochLayout(n, P1440_FEW.width, P1440_FEW.height).sphere).toBe(MAX_SPHERE)
    if (n <= 2) {
      expect(computeBlochLayout(n, P1280_FEW.width, P1280_FEW.height).sphere).toBe(MAX_SPHERE)
    }
  })

  it('grows the spheres in a taller panel, up to the maximum', () => {
    const small = computeBlochLayout(3, P1280.width, P1280.height)
    const tall = computeBlochLayout(3, 1200, 340)
    expect(tall.sphere).toBeGreaterThan(small.sphere)
    expect(computeBlochLayout(3, 2000, 1000).sphere).toBe(MAX_SPHERE)
  })

  it('wraps to more rows when one row would be too narrow', () => {
    const layout = computeBlochLayout(6, 600, 600)
    const cols = columnsIn(600, layout)
    expect(cols).toBeLessThan(6)
    expect(footprint(6, cols, layout).height).toBeLessThanOrEqual(600)
  })

  it('never goes below the minimum sphere (the panel scrolls instead)', () => {
    expect(computeBlochLayout(6, 300, 100).sphere).toBe(MIN_SPHERE)
    expect(computeBlochLayout(6, 150, 100).stats).toBe('stack')
  })
})
