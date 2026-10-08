// Can this browser draw WebGL? Some lab and projector PCs, remote-desktop sessions and browsers
// with hardware acceleration turned off cannot. Then the Bloch cards use the flat SVG sphere
// (BlochSphereSvg.tsx) instead of the three.js one, so the demo still works.
//
// The answer is cached: creating WebGL contexts is not free and browsers limit how many exist.

let cached: boolean | undefined

/** For tests: forget the cached answer, or force one. */
export function setWebGLSupportForTests(value: boolean | undefined): void {
  cached = value
}

export function hasWebGL(): boolean {
  if (cached !== undefined) return cached
  cached = detect()
  return cached
}

function detect(): boolean {
  try {
    if (typeof document === 'undefined') return false
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false
    // Free the probe context right away so it does not count against the browser's limit.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}
