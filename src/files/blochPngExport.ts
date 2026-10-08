// Bloch spheres as one PNG (V2-3): the drawing part. Needs a browser (WebGL canvases, 2D
// canvas, fonts), so it is checked in the browser; the layout and text are in blochPng.ts.
//
// How: each sphere is a WebGL canvas created with `preserveDrawingBuffer`, so its last frame
// can be copied with drawImage. The axis labels are DOM spans over the canvas; their text,
// colour and position on screen are redrawn with fillText. Colours and fonts are read from the
// theme's CSS tokens, so the image matches the current theme.
import { useCircuitStore, useResultsStore } from '../model/store'
import { useUiStore } from '../model/uiStore'
import {
  blochCardText,
  blochPngLayout,
  blochPngTitle,
  mapLabelPoint,
  PNG_METRICS,
} from './blochPng'
import { downloadFilename, saveBlob } from './download'

/** Draw at 2× so text and lines stay sharp when the image is zoomed or projected. */
const SCALE = 2

/** Give up waiting for the spheres after this long. */
const WAIT_MS = 5000

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

/** The live sphere containers (one per card, in qubit order) once they are all on screen. */
function liveSpheres(numQubits: number): HTMLElement[] | null {
  const spheres = [...document.querySelectorAll<HTMLElement>('.bloch-panel .bloch-sphere')]
  const ready =
    spheres.length === numQubits &&
    // A sphere has drawn its first frame once its axis labels were placed (made visible by
    // the label projector after a rendered frame); a canvas alone may still be blank.
    spheres.every(
      (s) =>
        s.querySelector('canvas') &&
        s.querySelector<HTMLElement>('.bloch-label')?.style.visibility === 'visible',
    ) &&
    !useResultsStore.getState().computing
  return ready ? spheres : null
}

/** Shows the Bloch tab if needed and waits until every sphere has rendered. */
async function waitForSpheres(numQubits: number): Promise<HTMLElement[] | null> {
  if (useUiStore.getState().bottomTab !== 'bloch') useUiStore.getState().setBottomTab('bloch')
  const start = performance.now()
  while (performance.now() - start < WAIT_MS) {
    const spheres = liveSpheres(numQubits)
    if (spheres) {
      // Two more frames: the canvases render on demand right after they mount.
      await nextFrame()
      await nextFrame()
      return liveSpheres(numQubits)
    }
    await nextFrame()
  }
  return null
}

/**
 * Draws all qubit cards into one PNG and downloads it. Returns the file name, or an error
 * message when the spheres are not available.
 */
export async function exportBlochPng(): Promise<{ filename: string } | { error: string }> {
  const numQubits = useCircuitStore.getState().circuit.numQubits
  const spheres = await waitForSpheres(numQubits)
  const analysis = useResultsStore.getState().analysis
  if (!spheres || !analysis || analysis.numQubits !== numQubits) {
    return { error: 'The Bloch spheres are not ready yet; try again in a moment.' }
  }
  await document.fonts.ready

  const layout = blochPngLayout(numQubits)
  const canvas = document.createElement('canvas')
  canvas.width = layout.width * SCALE
  canvas.height = layout.height * SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) return { error: 'Could not create the image.' }
  ctx.scale(SCALE, SCALE)

  const ui = token('--font-ui')
  const mono = token('--font-mono')
  const color = {
    background: token('--color-bg-panel'),
    card: token('--color-bg'),
    border: token('--color-border'),
    text: token('--color-text'),
    muted: token('--color-text-muted'),
    x: token('--axis-x'),
    y: token('--axis-y'),
    z: token('--axis-z'),
  }

  ctx.fillStyle = color.background
  ctx.fillRect(0, 0, layout.width, layout.height)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = color.text
  ctx.font = `600 13px ${ui}`
  ctx.fillText(blochPngTitle(numQubits), layout.title.x, layout.title.y)

  layout.cards.forEach((place, i) => {
    const text = blochCardText(analysis.qubits[i])
    const sphere = spheres[i]

    // Card: 1px border on the editor background, like the cards in the app.
    ctx.fillStyle = color.card
    ctx.fillRect(place.card.x, place.card.y, place.card.width, place.card.height)
    ctx.strokeStyle = color.border
    ctx.lineWidth = 1
    ctx.strokeRect(
      place.card.x + 0.5,
      place.card.y + 0.5,
      place.card.width - 1,
      place.card.height - 1,
    )

    // Header: "q0" and "pure" / "mixed · entangled".
    ctx.textAlign = 'left'
    ctx.fillStyle = color.text
    ctx.font = `600 13px ${mono}`
    ctx.fillText(text.title, place.header.x, place.header.y)
    ctx.textAlign = 'right'
    ctx.fillStyle = color.muted
    ctx.font = `11px ${ui}`
    ctx.fillText(text.state, place.card.x + place.card.width - PNG_METRICS.padding, place.header.y)

    // The sphere's last rendered frame.
    const gl = sphere.querySelector('canvas')
    if (gl) {
      const s = place.sphere
      ctx.drawImage(gl, s.x, s.y, s.width, s.height)
    }

    // Axis labels (x, y, |0⟩, |1⟩, r = 0): same text, colour and place as on screen.
    const box = sphere.getBoundingClientRect()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (const label of sphere.querySelectorAll<HTMLElement>('.bloch-label')) {
      const style = getComputedStyle(label)
      if (style.visibility !== 'visible' || !label.textContent) continue
      const r = label.getBoundingClientRect()
      const at = mapLabelPoint(
        { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top },
        box.width,
        place.sphere,
      )
      ctx.fillStyle = style.color
      ctx.font = `${style.fontWeight} ${parseFloat(style.fontSize) * at.scale}px ${style.fontFamily}`
      ctx.fillText(label.textContent, at.x, at.y)
    }
    ctx.textBaseline = 'alphabetic'

    // Numbers: keys left (x, y, z in the axis colours), values right-aligned.
    text.rows.forEach((row, k) => {
      const y = place.stats.y + (k + 1) * PNG_METRICS.row - 5
      ctx.textAlign = 'left'
      ctx.fillStyle = row.axis ? color[row.axis] : color.muted
      ctx.font = `600 12px ${mono}`
      ctx.fillText(row.key, place.stats.x, y)
      ctx.textAlign = 'right'
      ctx.fillStyle = color.text
      ctx.font = `12px ${mono}`
      ctx.fillText(row.value, place.stats.x + place.stats.width, y)
    })
  })

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) return { error: 'Could not create the image.' }
  const filename = downloadFilename('png')
  saveBlob(blob, filename)
  return { filename }
}
