// Step-through debugger bar (V2-5), shown under the circuit.
//
// Step k shows the state after columns 0..k−1 (step 0 = the start state, step N = after the
// last column = the final state). "Live" always shows the final state and is the default;
// moving the slider or pressing a step button turns it off, any circuit edit turns it back on.
import { useEffect, useRef, type ChangeEvent, type MouseEvent } from 'react'
import { columnCount } from '../../model/circuit'
import { useCircuitStore } from '../../model/store'
import { currentStep, useStepStore } from '../../model/stepStore'
import { PLAY_STEP_MS, describeStep } from './timelineText'
import './Timeline.css'

export function Timeline() {
  const numSteps = useCircuitStore((s) => columnCount(s.circuit))
  const live = useStepStore((s) => s.live)
  const step = useStepStore((s) => currentStep(s, numSteps))
  const playing = useStepStore((s) => s.playing)
  const goTo = useStepStore((s) => s.goTo)
  const stepBy = useStepStore((s) => s.stepBy)
  const goLive = useStepStore((s) => s.goLive)
  const setPlaying = useStepStore((s) => s.setPlaying)
  const sliderRef = useRef<HTMLInputElement>(null)

  /**
   * A step button that just became disabled (First at step 0, Last at the end) drops keyboard
   * focus to the page, which would also stop `[` / `]`. Move focus to the slider instead.
   */
  function keepFocus(e: MouseEvent<HTMLButtonElement>) {
    const button = e.currentTarget
    requestAnimationFrame(() => {
      if (button.disabled && document.activeElement !== sliderRef.current) {
        sliderRef.current?.focus()
      }
    })
  }

  // Playing: advance one step every PLAY_STEP_MS and stop on the last step. Each step is a
  // plain jump (no tweening), so this also behaves correctly under prefers-reduced-motion.
  useEffect(() => {
    if (!playing) return
    if (step >= numSteps) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => {
      useStepStore.setState({ live: false, step: step + 1 })
    }, PLAY_STEP_MS)
    return () => window.clearTimeout(timer)
  }, [playing, step, numSteps, setPlaying])

  const empty = numSteps === 0
  const atStart = step === 0
  const atEnd = step >= numSteps

  function togglePlay() {
    if (playing) {
      setPlaying(false)
      return
    }
    // From the end (or Live), play from the start state again.
    const from = atEnd ? 0 : step
    useStepStore.setState({ live: false, step: from, playing: true })
  }

  const label = live ? `Live · final state` : `Step ${step} / ${numSteps} · ${describeStep(step)}`
  const valueText = live
    ? `Live, final state, step ${numSteps} of ${numSteps}`
    : `Step ${step} of ${numSteps}, ${describeStep(step)}`

  return (
    <div className="timeline" role="group" aria-label="Step through the circuit">
      <button
        type="button"
        className="icon-button"
        aria-label="First step (start state)"
        title="First step: the start state"
        disabled={empty || atStart}
        onClick={(e) => {
          goTo(0, numSteps)
          keepFocus(e)
        }}
      >
        <span className="codicon codicon-debug-reverse-continue" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Previous step"
        title="Previous step ( [ )"
        disabled={empty || atStart}
        onClick={(e) => {
          stepBy(-1, numSteps)
          keepFocus(e)
        }}
      >
        <span className="codicon codicon-chevron-left" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label={playing ? 'Pause' : 'Play through the steps'}
        title={playing ? 'Pause' : 'Play: one step every 0.7 s'}
        aria-pressed={playing}
        disabled={empty}
        onClick={togglePlay}
      >
        <span
          className={`codicon codicon-${playing ? 'debug-pause' : 'play'}`}
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Next step"
        title="Next step ( ] )"
        disabled={empty || atEnd}
        onClick={(e) => {
          stepBy(1, numSteps)
          keepFocus(e)
        }}
      >
        <span className="codicon codicon-chevron-right" aria-hidden="true" />
      </button>
      <button
        type="button"
        className="icon-button"
        aria-label="Last step (after the last column)"
        title="Last step: after the last column"
        disabled={empty || atEnd}
        onClick={(e) => {
          goTo(numSteps, numSteps)
          keepFocus(e)
        }}
      >
        <span className="codicon codicon-debug-continue" aria-hidden="true" />
      </button>

      <input
        ref={sliderRef}
        type="range"
        className="timeline__slider"
        min={0}
        max={Math.max(numSteps, 1)}
        step={1}
        value={empty ? 0 : step}
        disabled={empty}
        aria-label="Step"
        aria-valuetext={empty ? 'No gates: only the start state' : valueText}
        onChange={(e: ChangeEvent<HTMLInputElement>) => goTo(Number(e.target.value), numSteps)}
      />

      <span className="timeline__label" data-testid="timeline-label" aria-hidden="true">
        {empty ? 'No gates' : label}
      </span>

      <button
        type="button"
        className={`timeline__live${live ? ' timeline__live--on' : ''}`}
        aria-pressed={live}
        title={live ? 'Showing the final state' : 'Return to the final state'}
        onClick={goLive}
      >
        Live
      </button>
    </div>
  )
}
