// V2-5: the step-through debugger's only motion (a short fade when gates dim) must be removed
// under prefers-reduced-motion. Stepping itself is a plain jump (tested in tests/timeline).
import { describe, expect, it } from 'vitest'
import { readRepoFile } from './tokens'

describe('step-through debugger motion', () => {
  it('the dimming fade is removed by the global reduced-motion rule', () => {
    expect(readRepoFile('src/components/Canvas/Canvas.css')).toMatch(
      /\.circuit--stepping \.gate \{\s*transition: opacity/,
    )
    expect(readRepoFile('src/styles/global.css')).toMatch(
      /prefers-reduced-motion: reduce[\s\S]*transition-duration: 0\.01ms !important/,
    )
  })
})
