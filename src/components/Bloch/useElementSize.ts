// Content-box size of an element, kept up to date with a ResizeObserver (panel drags,
// window resizes). Measured once before paint so the first frame already has the right size.
import { useLayoutEffect, useState, type RefObject } from 'react'

export interface ElementSize {
  width: number
  height: number
}

export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize {
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = (width: number, height: number) =>
      setSize((s) => (s.width === width && s.height === height ? s : { width, height }))
    update(el.clientWidth, el.clientHeight)
    // Not available in jsdom (tests): the size then stays 0 and callers use their defaults.
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      update(Math.floor(entry.contentRect.width), Math.floor(entry.contentRect.height))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])

  return size
}
