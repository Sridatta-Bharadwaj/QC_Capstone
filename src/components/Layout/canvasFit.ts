// Fits the circuit / bottom-panel split to the number of qubits.
//
// With a fixed split, one or two qubits leave most of the canvas empty while the Bloch spheres
// (the main output) are squeezed into the bottom panel. So until the user drags the separator
// themselves, the top row is resized whenever the qubit count changes: just tall enough for
// the wires plus a little room, never below MIN_TOP_SHARE (the code panel shares that row)
// and never above MAX_TOP_SHARE (the default 55 / 45 split, where 6 qubits fit at 1280×720).
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { LayoutChangedMeta, PanelImperativeHandle } from 'react-resizable-panels'
import { ROW_H, RULER_H } from '../Canvas/CircuitGrid'

/** Top row share of the main column, as fractions. MAX is also the default size. */
export const MIN_TOP_SHARE = 0.35
export const MAX_TOP_SHARE = 0.55
/** `.circuit` padding-bottom (Canvas.css). */
const CIRCUIT_PAD_BOTTOM = 8
/** Room under the last wire: the empty-canvas hint (two lines) or the gate inspector. */
const SLACK = 52

/**
 * Height in px for the top row: the canvas chrome (header, footer: measured, so later
 * additions such as a timeline bar are included) plus the wires, clamped to the shares above.
 */
export function fitTopHeight(groupHeight: number, chrome: number, numQubits: number): number {
  const wanted = chrome + RULER_H + numQubits * ROW_H + CIRCUIT_PAD_BOTTOM + SLACK
  return Math.round(
    Math.min(MAX_TOP_SHARE * groupHeight, Math.max(MIN_TOP_SHARE * groupHeight, wanted)),
  )
}

/**
 * Resizes `topPanel` to fit the circuit whenever `numQubits` changes, until the user resizes
 * the split by hand. Returns the `onLayoutChanged` handler for the vertical Group.
 */
export function useCanvasFit(
  topPanel: RefObject<PanelImperativeHandle | null>,
  canvasPanel: RefObject<HTMLDivElement | null>,
  numQubits: number,
) {
  const userResized = useRef(false)

  useEffect(() => {
    if (userResized.current) return
    // Wait one frame so the panels have their first layout (sizes are 0 before that).
    const frame = requestAnimationFrame(() => {
      const panel = topPanel.current
      const canvas = canvasPanel.current
      const scroll = canvas?.querySelector('.canvas__scroll')
      if (!panel || !canvas || !scroll) return
      const { inPixels, asPercentage } = panel.getSize()
      if (inPixels <= 0 || asPercentage <= 0) return
      const groupHeight = inPixels / (asPercentage / 100)
      const chrome = canvas.clientHeight - scroll.clientHeight
      const target = fitTopHeight(groupHeight, chrome, numQubits)
      if (Math.abs(target - inPixels) >= 1) panel.resize(`${target}px`)
    })
    return () => cancelAnimationFrame(frame)
  }, [topPanel, canvasPanel, numQubits])

  return useCallback((_layout: unknown, meta: LayoutChangedMeta) => {
    if (meta.isUserInteraction) userResized.current = true
  }, [])
}
