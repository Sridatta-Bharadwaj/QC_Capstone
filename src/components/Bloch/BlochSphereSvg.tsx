// Flat (SVG) Bloch sphere: the fallback when WebGL is not available (see webgl.ts), and when
// the 3D sphere fails at runtime (error boundary in BlochCard). Same viewpoint, colours, labels
// and r = 0 marker as the 3D sphere, but drawn once with a fixed camera (no rotating).
//
// The math is an orthographic projection: we look at the origin from the direction `view`
// (the same direction as the 3D camera, CAMERA_POSITION in coords.ts). Every physics point p
// is drawn at (p · right, p · up) on screen; p · view tells whether it is on the front half of
// the sphere (> 0, drawn solid) or the back half (< 0, drawn faint and dashed).
import type { BlochVector } from '../../engine/types'
import { ZERO_VECTOR_THRESHOLD, spherical, vectorLength } from './coords'
import './Bloch.css'

type V = BlochVector

const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: V, b: V): V => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const normalize = (a: V): V => {
  const n = Math.hypot(a.x, a.y, a.z)
  return { x: a.x / n, y: a.y / n, z: a.z / n }
}

/** Viewing direction: polar 70°, azimuth 25° (matches CAMERA_POSITION). */
const VIEW = spherical(1, (70 * Math.PI) / 180, (25 * Math.PI) / 180)
/** Screen "right" and "up" vectors: z stays vertical on screen, as in the 3D view. */
const RIGHT = normalize(cross({ x: 0, y: 0, z: 1 }, VIEW))
const UP = cross(VIEW, RIGHT)

/** Physics point → screen offset from the centre (y grows downward in SVG), in sphere radii. */
function project(p: V): { x: number; y: number; depth: number } {
  return { x: dot(p, RIGHT), y: -dot(p, UP), depth: dot(p, VIEW) }
}

const AXIS_LENGTH = 1.12
const LABEL_OFFSET = 1.3
const SEGMENTS = 72

/** Splits a closed circle into runs on the front / back half, as SVG path strings. */
function circleRuns(point: (t: number) => V, scale: number): { d: string; back: boolean }[] {
  const runs: { d: string; back: boolean }[] = []
  let current: { pts: string[]; back: boolean } | null = null
  for (let i = 0; i <= SEGMENTS; i++) {
    const p = project(point((2 * Math.PI * i) / SEGMENTS))
    const back = p.depth < 0
    const xy = `${(p.x * scale).toFixed(2)},${(p.y * scale).toFixed(2)}`
    if (!current || current.back !== back) {
      // Repeat the last point so neighbouring runs join without a gap.
      const start: string[] = current ? [current.pts[current.pts.length - 1]] : []
      if (current) runs.push({ d: `M${current.pts.join('L')}`, back: current.back })
      current = { pts: [...start, xy], back }
    } else {
      current.pts.push(xy)
    }
  }
  if (current) runs.push({ d: `M${current.pts.join('L')}`, back: current.back })
  return runs
}

const LATITUDES = [Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]
const MERIDIANS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]

export interface BlochSphereSvgProps {
  vector: BlochVector
  /** Edge length in CSS pixels. */
  size?: number
}

export function BlochSphereSvg({ vector, size = 160 }: BlochSphereSvgProps) {
  const half = size / 2
  const label = Math.round(Math.min(17, Math.max(12, size / 18)))
  // Leave room for the labels outside the sphere.
  const R = (half - label * 1.2) / LABEL_OFFSET
  const k = Math.min(1.6, Math.max(1, size / 160))

  const axis = (to: V, color: string) => {
    const a = project({ x: -to.x, y: -to.y, z: -to.z })
    const b = project(to)
    return (
      <line
        x1={a.x * R}
        y1={a.y * R}
        x2={b.x * R}
        y2={b.y * R}
        style={{ stroke: `var(${color})` }}
        strokeWidth={2 * k}
        strokeLinecap="round"
      />
    )
  }

  const labelAt = (p: V, text: string, color: string) => {
    const s = project(p)
    return (
      <text
        x={s.x * R}
        y={s.y * R}
        textAnchor="middle"
        dominantBaseline="central"
        className="bloch-svg__label"
        style={{ fill: `var(${color})`, fontSize: label }}
      >
        {text}
      </text>
    )
  }

  const length = vectorLength(vector)
  const isZero = length < ZERO_VECTOR_THRESHOLD
  const tip = project(vector)
  const tipX = tip.x * R
  const tipY = tip.y * R
  // Arrowhead: a small triangle pointing along the projected vector.
  const screenLen = Math.hypot(tipX, tipY)
  const head = Math.min(10 * k, screenLen * 0.45)
  let arrowHead: string | null = null
  if (!isZero && screenLen > 1e-6) {
    const ux = tipX / screenLen
    const uy = tipY / screenLen
    const bx = tipX - ux * head
    const by = tipY - uy * head
    const w = head * 0.45
    arrowHead = `${tipX},${tipY} ${bx - uy * w},${by + ux * w} ${bx + uy * w},${by - ux * w}`
  }

  return (
    <div className="bloch-sphere bloch-sphere--svg" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`${-half} ${-half} ${size} ${size}`}
        role="img"
        aria-label={`Bloch vector (${vector.x.toFixed(3)}, ${vector.y.toFixed(3)}, ${vector.z.toFixed(3)})`}
      >
        {/* Outline of the sphere (its silhouette is a circle in an orthographic view). */}
        <circle r={R} className="bloch-svg__outline" strokeWidth={1.25 * k} />

        {LATITUDES.map((theta) =>
          circleRuns((t) => spherical(1, theta, t), R).map((run, i) => (
            <path
              key={`lat-${theta}-${i}`}
              d={run.d}
              className={theta === Math.PI / 2 ? 'bloch-svg__equator' : 'bloch-svg__wire'}
              data-back={run.back}
              strokeWidth={(theta === Math.PI / 2 ? 1.25 : 1) * k}
            />
          )),
        )}
        {MERIDIANS.map((phi) =>
          circleRuns((t) => spherical(1, t, phi), R).map((run, i) => (
            <path
              key={`lon-${phi}-${i}`}
              d={run.d}
              className="bloch-svg__wire"
              data-back={run.back}
              strokeWidth={k}
            />
          )),
        )}

        {axis({ x: AXIS_LENGTH, y: 0, z: 0 }, '--axis-x')}
        {axis({ x: 0, y: AXIS_LENGTH, z: 0 }, '--axis-y')}
        {axis({ x: 0, y: 0, z: AXIS_LENGTH }, '--axis-z')}

        {labelAt({ x: LABEL_OFFSET, y: 0, z: 0 }, 'x', '--axis-x')}
        {labelAt({ x: 0, y: LABEL_OFFSET, z: 0 }, 'y', '--axis-y')}
        {labelAt({ x: 0, y: 0, z: LABEL_OFFSET }, '|0⟩', '--axis-z')}
        {labelAt({ x: 0, y: 0, z: -LABEL_OFFSET }, '|1⟩', '--axis-z')}

        {isZero ? (
          <>
            <circle r={4 * k} className="bloch-svg__vector-fill" />
            <text
              x={8 * k}
              y={-8 * k}
              className="bloch-svg__label bloch-svg__zero"
              style={{ fontSize: label }}
            >
              r = 0
            </text>
          </>
        ) : (
          <>
            <line
              x1={0}
              y1={0}
              x2={tipX - (arrowHead ? (tipX / screenLen) * head * 0.8 : 0)}
              y2={tipY - (arrowHead ? (tipY / screenLen) * head * 0.8 : 0)}
              className="bloch-svg__vector"
              strokeWidth={3.5 * k}
              strokeLinecap="round"
            />
            {arrowHead && <polygon points={arrowHead} className="bloch-svg__vector-fill" />}
            <circle r={2.5 * k} className="bloch-svg__vector-fill" />
          </>
        )}
      </svg>
    </div>
  )
}
