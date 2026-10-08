// 3D Bloch sphere for one qubit (react-three-fiber). Lazy-loaded so three.js is its own chunk.
//
// What is drawn (all in physics coordinates, mapped to three.js by `blochToThree`):
//   - a wireframe unit sphere: two latitude lines, the equator, four meridians
//   - the x, y, z axes in their fixed colours (x red, y green, z blue)
//   - labels x, y, |0⟩ at the north pole (+z), |1⟩ at the south pole (−z). They are plain DOM
//     spans laid over the canvas (bundled IBM Plex font, nothing fetched), moved every frame to
//     the screen position of their 3D anchor point.
//   - the Bloch vector r as an arrow from the origin. |r| = 1 means a pure state (tip on the
//     surface); |r| < 1 means a mixed state (tip inside). r = 0 is maximally mixed: no arrow,
//     a dot and an "r = 0" marker at the centre.
//   - when r changes, the arrow glides to the new vector (~250 ms, see arrowAnimation.ts).
//
// Colours come from CSS tokens and are re-read whenever the theme changes.
//
// Legibility on a projector: lines are drei <Line> (screen-space "fat" lines, so the width in
// pixels is honoured everywhere, unlike plain WebGL lines that are always 1 px). Line widths
// and label size grow with the sphere (`strokeScale`), so a 300 px sphere is not drawn with
// hairlines.
import { Line, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { Vector3, type Group, type Mesh } from 'three'
import type { BlochVector } from '../../engine/types'
import { useThemeStore, type Theme } from '../../theme/themeStore'
import { ArrowAnimator, arrowShape, prefersReducedMotion } from './arrowAnimation'
import { CAMERA_POSITION, blochToThree, latitudeCircle, longitudeCircle, type Vec3 } from './coords'
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

/** The shaft as a unit line along +Y; scaled to its length every frame. */
const UNIT_SHAFT: Vec3[] = [ORIGIN, [0, 1, 0]]

/**
 * Arrow from the origin to r: a shaft line, a cone whose apex is exactly at r, and a tip dot.
 *
 * The arrow is built once pointing along +Y and then, every frame, rotated and stretched to
 * the vector on screen (no React re-render per frame). While a tween runs it asks for the
 * next frame (`invalidate`), since the canvas only renders on demand.
 * When |r| is ~0 the arrow is hidden and the centre dot + "r = 0" marker are shown.
 */
function BlochArrow({
  vector,
  color,
  width,
  onZeroChange,
}: {
  vector: BlochVector
  color: string
  width: number
  /** Called every frame with whether the arrow is hidden because |r| ≈ 0. */
  onZeroChange: (isZero: boolean) => void
}) {
  const invalidate = useThree((s) => s.invalidate)
  const [animator] = useState(() => new ArrowAnimator(vector))
  const arrow = useRef<Group>(null)
  const shaft = useRef<Group>(null)
  const cone = useRef<Mesh>(null)
  const tip = useRef<Mesh>(null)
  const centreDot = useRef<Mesh>(null)
  const direction = useMemo(() => new Vector3(), [])

  // A new vector from the engine: start the tween and request a frame.
  const { x, y, z } = vector
  useEffect(() => {
    animator.setTarget({ x, y, z }, performance.now(), prefersReducedMotion())
    invalidate()
  }, [animator, invalidate, x, y, z])

  useFrame(() => {
    const { vector: shown, animating } = animator.frame(performance.now())
    const shape = arrowShape(shown)
    if (arrow.current) arrow.current.visible = shape.visible
    if (centreDot.current) centreDot.current.visible = !shape.visible
    onZeroChange(!shape.visible)
    if (shape.visible && arrow.current && shaft.current && cone.current && tip.current) {
      // Rotate the +Y model onto the vector's direction, then size the parts along it.
      direction.set(...shape.direction)
      arrow.current.quaternion.setFromUnitVectors(UP, direction)
      shaft.current.scale.set(1, shape.shaftLength, 1)
      cone.current.position.set(0, shape.coneCenter, 0)
      cone.current.scale.set(shape.coneRadius, shape.coneLength, shape.coneRadius)
      tip.current.position.set(0, shape.length, 0)
    }
    if (animating) invalidate()
  })

  return (
    <>
      <group ref={arrow}>
        <group ref={shaft}>
          <Line points={UNIT_SHAFT} color={color} lineWidth={width} />
        </group>
        {/* Unit cone (radius 1, height 1, along +Y), scaled each frame. */}
        <mesh ref={cone}>
          <coneGeometry args={[1, 1, 20]} />
          <meshBasicMaterial color={color} />
        </mesh>
        <mesh ref={tip}>
          <sphereGeometry args={[TIP_RADIUS, 16, 12]} />
          <meshBasicMaterial color={color} />
        </mesh>
      </group>
      <mesh ref={centreDot} position={ORIGIN} visible={false}>
        <sphereGeometry args={[TIP_RADIUS * 1.4, 16, 12]} />
        <meshBasicMaterial color={color} />
      </mesh>
    </>
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
  const zeroMarker = useRef<HTMLSpanElement>(null)
  // Toggled from the render loop (no React re-render per frame).
  const showZeroMarker = useCallback((isZero: boolean) => {
    const el = zeroMarker.current
    if (el) el.style.visibility = isZero ? 'visible' : 'hidden'
  }, [])
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

        <BlochArrow
          vector={vector}
          color={colors.vector}
          width={WIDTH.vector * k}
          onZeroChange={showZeroMarker}
        />
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
      {/* Shown by BlochArrow when |r| ≈ 0. The origin always projects to the canvas centre
          (the camera orbits around it), so CSS can place this without projecting. */}
      <span ref={zeroMarker} className="bloch-label bloch-zero-marker">
        r = 0
      </span>
    </div>
  )
}
