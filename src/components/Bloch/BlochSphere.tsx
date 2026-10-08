// 3D Bloch sphere for one qubit (react-three-fiber). Lazy-loaded so three.js is its own chunk.
//
// What is drawn (all in physics coordinates, mapped to three.js by `blochToThree`):
//   - a wireframe unit sphere: two latitude lines, the equator, four meridians
//   - the x, y, z axes in their fixed colours (x red, y green, z blue)
//   - labels x, y, |0⟩ at the north pole (+z), |1⟩ at the south pole (−z). They are plain DOM
//     spans laid over the canvas (bundled IBM Plex font, nothing fetched), moved every frame to
//     the screen position of their 3D anchor point.
//   - the Bloch vector r as an arrow from the origin. |r| = 1 means a pure state (tip on the
//     surface); |r| < 1 means a mixed state (tip inside). r ≈ 0 is maximally mixed: just a dot.
//
// Colours come from CSS tokens and are re-read whenever the theme changes.
//
// Legibility on a projector: lines are drei <Line> (screen-space "fat" lines, so the width in
// pixels is honoured everywhere, unlike plain WebGL lines that are always 1 px). Line widths
// and label size grow with the sphere (`strokeScale`), so a 300 px sphere is not drawn with
// hairlines.
import { Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react'
import { Quaternion, Vector3 } from 'three'
import type { BlochVector } from '../../engine/types'
import { useThemeStore, type Theme } from '../../theme/themeStore'
import {
  CAMERA_POSITION,
  ZERO_VECTOR_THRESHOLD,
  blochToThree,
  latitudeCircle,
  longitudeCircle,
  vectorLength,
  type Vec3,
} from './coords'
import './Bloch.css'

interface SceneColors {
  wire: string
  equator: string
  vector: string
  axisX: string
  axisY: string
  axisZ: string
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Reads the scene colours from the CSS tokens of the active theme. */
function readSceneColors(theme: Theme): SceneColors {
  // `theme` is only the cache key: <html data-theme> is already set when the store updates,
  // so the computed CSS variables below belong to `theme`.
  void theme
  return {
    wire: cssVar('--color-sphere-wire'),
    equator: cssVar('--color-sphere-equator'),
    vector: cssVar('--color-bloch-vector'),
    axisX: cssVar('--axis-x'),
    axisY: cssVar('--axis-y'),
    axisZ: cssVar('--axis-z'),
  }
}

const LATITUDES = [Math.PI / 4, (3 * Math.PI) / 4]
const MERIDIANS = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4]
const EQUATOR = latitudeCircle(Math.PI / 2)
const LATITUDE_LINES = LATITUDES.map((t) => latitudeCircle(t))
const MERIDIAN_LINES = MERIDIANS.map((p) => longitudeCircle(p))

const ORIGIN: Vec3 = [0, 0, 0]
const AXIS_LENGTH = 1.12
const LABEL_OFFSET = 1.28

const CONE_LENGTH = 0.2
const CONE_RADIUS = 0.075
/** Radius of the dot at the arrow tip (and of the centre dot when r = 0). */
const TIP_RADIUS = 0.045

/** Line widths in CSS px for a 160 px sphere; scaled by `strokeScale(size)`. */
const WIDTH = { wire: 1, equator: 1.25, axis: 2, vector: 3.5 }

/** 1 at 160 px, growing gently with the sphere edge, never thinner than at 160 px. */
function strokeScale(size: number): number {
  return Math.min(1.6, Math.max(1, size / 160))
}

/** Axis label size in CSS px: 12 px on small spheres up to 17 px on the largest. */
function labelSize(size: number): number {
  return Math.round(Math.min(17, Math.max(12, size / 18)))
}
const UP = new Vector3(0, 1, 0)

interface AxisLabel {
  text: string
  at: Vec3
  className: string
}

const LABELS: AxisLabel[] = [
  { text: 'x', at: blochToThree({ x: LABEL_OFFSET, y: 0, z: 0 }), className: 'bloch-label--x' },
  { text: 'y', at: blochToThree({ x: 0, y: LABEL_OFFSET, z: 0 }), className: 'bloch-label--y' },
  { text: '|0⟩', at: blochToThree({ x: 0, y: 0, z: LABEL_OFFSET }), className: 'bloch-label--z' },
  { text: '|1⟩', at: blochToThree({ x: 0, y: 0, z: -LABEL_OFFSET }), className: 'bloch-label--z' },
]

function Axis({ to, color, width }: { to: BlochVector; color: string; width: number }) {
  const end = blochToThree(to)
  const start = blochToThree({ x: -to.x, y: -to.y, z: -to.z })
  return <Line points={[start, end]} color={color} lineWidth={width} />
}

/**
 * Where the pole labels sit, as a fraction of the half-height of the canvas from its centre
 * (zoom 1, measured from the default camera): the |0⟩ / |1⟩ label centres.
 */
const POLE_LABEL_REACH = 0.87

/**
 * Camera zoom that keeps every label `margin` px inside the canvas edge. Labels have a fixed
 * pixel size while the sphere scales, so small spheres zoom out slightly; big ones stay at 1.
 */
function cameraZoom(size: number, label: number): number {
  const margin = label * 0.6 + 2
  return Math.min(1, (1 - (2 * margin) / size) / POLE_LABEL_REACH)
}

/** Runs inside the canvas: applies the zoom whenever it changes and redraws. */
function CameraZoom({ zoom }: { zoom: number }) {
  // `get` reads the live three.js state (the camera is a mutable three.js object).
  const get = useThree((s) => s.get)
  useEffect(() => {
    const { camera, invalidate } = get()
    camera.zoom = zoom
    camera.updateProjectionMatrix()
    invalidate()
  }, [get, zoom])
  return null
}

/**
 * Runs inside the canvas: after each rendered frame, projects every label's 3D anchor to
 * pixel coordinates and moves the matching DOM span there.
 */
function LabelProjector({ spans }: { spans: RefObject<(HTMLSpanElement | null)[]> }) {
  const point = useMemo(() => new Vector3(), [])
  useFrame(({ camera, size }) => {
    LABELS.forEach((label, i) => {
      const el = spans.current[i]
      if (!el) return
      // project() maps world space to normalised device coordinates, −1…1 on both axes.
      point.set(...label.at).project(camera)
      const px = ((point.x + 1) / 2) * size.width
      const py = ((1 - point.y) / 2) * size.height
      el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -50%)`
      el.style.visibility = 'visible'
    })
  })
  return null
}

/**
 * Arrow from the origin to r: a shaft line plus a cone whose apex is exactly at r.
 * Everything is derived from `vector`, so animating the arrow only means passing an
 * interpolated vector each frame.
 */
function BlochArrow({
  vector,
  color,
  width,
}: {
  vector: BlochVector
  color: string
  width: number
}) {
  const length = vectorLength(vector)
  const geometry = useMemo(() => {
    const tip = new Vector3(...blochToThree(vector))
    const dir = tip.clone().normalize()
    // Short vectors get a proportionally smaller cone so the head never overshoots the origin.
    const coneLength = Math.min(CONE_LENGTH, length * 0.5)
    const shaftEnd = dir.clone().multiplyScalar(length - coneLength)
    const coneCenter = dir.clone().multiplyScalar(length - coneLength / 2)
    // A cone geometry points along +Y; rotate +Y onto the arrow direction.
    const rotation = new Quaternion().setFromUnitVectors(UP, dir)
    return {
      tip: tip.toArray() as Vec3,
      shaftEnd: shaftEnd.toArray() as Vec3,
      coneCenter: coneCenter.toArray() as Vec3,
      rotation,
      coneLength,
    }
  }, [vector, length])

  if (length < ZERO_VECTOR_THRESHOLD) {
    // Maximally mixed state: r = 0, nothing to point at.
    return (
      <mesh position={ORIGIN}>
        <sphereGeometry args={[TIP_RADIUS * 1.4, 16, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    )
  }

  const coneRadius = CONE_RADIUS * (geometry.coneLength / CONE_LENGTH)
  return (
    <group>
      <Line points={[ORIGIN, geometry.shaftEnd]} color={color} lineWidth={width} />
      <mesh position={geometry.coneCenter} quaternion={geometry.rotation}>
        <coneGeometry args={[coneRadius, geometry.coneLength, 20]} />
        <meshBasicMaterial color={color} />
      </mesh>
      <mesh position={geometry.tip}>
        <sphereGeometry args={[TIP_RADIUS, 16, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </group>
  )
}

export interface BlochSphereProps {
  vector: BlochVector
  /** Canvas edge length in CSS pixels. */
  size?: number
}

export function BlochSphere({ vector, size = 160 }: BlochSphereProps) {
  const theme = useThemeStore((s) => s.theme)
  const colors = useMemo(() => readSceneColors(theme), [theme])
  const labelSpans = useRef<(HTMLSpanElement | null)[]>([])
  const k = strokeScale(size)
  const label = labelSize(size)
  const style = {
    width: size,
    height: size,
    '--bloch-label-size': `${label}px`,
  } as CSSProperties

  return (
    <div className="bloch-sphere" style={style}>
      <Canvas
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ alpha: true, antialias: true }}
        camera={{ position: CAMERA_POSITION, fov: 30, near: 0.1, far: 20 }}
      >
        {/* Wireframe sphere */}
        {LATITUDE_LINES.map((points, i) => (
          <Line key={`lat-${i}`} points={points} color={colors.wire} lineWidth={WIDTH.wire * k} />
        ))}
        {MERIDIAN_LINES.map((points, i) => (
          <Line key={`lon-${i}`} points={points} color={colors.wire} lineWidth={WIDTH.wire * k} />
        ))}
        <Line points={EQUATOR} color={colors.equator} lineWidth={WIDTH.equator * k} />

        {/* Axes (physics convention) */}
        <Axis to={{ x: AXIS_LENGTH, y: 0, z: 0 }} color={colors.axisX} width={WIDTH.axis * k} />
        <Axis to={{ x: 0, y: AXIS_LENGTH, z: 0 }} color={colors.axisY} width={WIDTH.axis * k} />
        <Axis to={{ x: 0, y: 0, z: AXIS_LENGTH }} color={colors.axisZ} width={WIDTH.axis * k} />

        <BlochArrow vector={vector} color={colors.vector} width={WIDTH.vector * k} />
        <LabelProjector spans={labelSpans} />
        <CameraZoom zoom={cameraZoom(size, label)} />

        {/* Rotate only: zoom and pan would just let the sphere get lost in a small card. */}
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          enableDamping={false}
          rotateSpeed={0.6}
        />
      </Canvas>
      {LABELS.map((label, i) => (
        <span
          key={label.text}
          ref={(el) => {
            labelSpans.current[i] = el
          }}
          className={`bloch-label ${label.className}`}
        >
          {label.text}
        </span>
      ))}
    </div>
  )
}
