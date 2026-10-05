// Shared skeleton placeholder. Use ONLY where something actually loads (PLAN.md → Skeleton loaders).
// Colours come from theme tokens; the shimmer is disabled under prefers-reduced-motion.
import type { CSSProperties, ReactNode } from 'react'
import './Skeleton.css'

interface SkeletonProps {
  width?: number | string
  height?: number | string
  /** Render as a circle (width is used as the diameter). */
  circle?: boolean
  className?: string
  style?: CSSProperties
}

export function Skeleton({ width = '100%', height = 12, circle, className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={['skeleton', circle ? 'skeleton--circle' : '', className ?? ''].join(' ').trim()}
      style={{ width, height: circle ? width : height, ...style }}
    />
  )
}

/** Grey lines that mimic text or code. */
export function SkeletonLines({ lines = 6, widths }: { lines?: number; widths?: string[] }) {
  const pattern = widths ?? ['62%', '88%', '45%', '74%', '30%', '81%', '56%']
  return (
    <div className="skeleton-lines">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={pattern[i % pattern.length]} />
      ))}
    </div>
  )
}

/** Accessible wrapper: announces "Loading <label>" once to screen readers. */
export function SkeletonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" className="skeleton-group">
      <span className="visually-hidden">Loading {label}</span>
      {children}
    </div>
  )
}
