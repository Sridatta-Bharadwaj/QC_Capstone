// Step-through debugger state (V2-5).
//
// Step numbering is the engine's (see StepResult): step 0 = the start state, step k = the state
// after columns 0..k−1. With N columns the last step is N, which equals the final state.
// "Live" means "always show the final state", so it keeps following the circuit as it changes.
import { create } from 'zustand'
import { useCircuitStore } from './store'

export interface StepState {
  /** true = show the final state (default). */
  live: boolean
  /** The step shown when not Live (0…N). Ignored while Live. */
  step: number
  /** true while the timeline plays through the steps. */
  playing: boolean

  /** Show step `step` of `numSteps` (clamped); turns Live off and stops playing. */
  goTo: (step: number, numSteps: number) => void
  /** Move by `delta` steps from the step on screen; turns Live off and stops playing. */
  stepBy: (delta: number, numSteps: number) => void
  /** Back to the final state; stops playing. */
  goLive: () => void
  setPlaying: (playing: boolean) => void
}

/** The step on screen: N while Live, otherwise the chosen step clamped to 0…N. */
export function currentStep(state: Pick<StepState, 'live' | 'step'>, numSteps: number): number {
  return state.live ? numSteps : clampStep(state.step, numSteps)
}

/** The step to send to the engine: null = final state (Live). */
export function requestedStep(state: Pick<StepState, 'live' | 'step'>): number | null {
  return state.live ? null : state.step
}

function clampStep(step: number, numSteps: number): number {
  return Math.min(Math.max(0, Math.round(step)), Math.max(0, numSteps))
}

export const useStepStore = create<StepState>((set, get) => ({
  live: true,
  step: 0,
  playing: false,

  goTo: (step, numSteps) => set({ live: false, step: clampStep(step, numSteps), playing: false }),

  stepBy: (delta, numSteps) => {
    // With no gates there is only one state (start = final): nothing to step through.
    if (numSteps <= 0) return
    const from = currentStep(get(), numSteps)
    set({ live: false, step: clampStep(from + delta, numSteps), playing: false })
  },

  goLive: () => set({ live: true, playing: false }),

  setPlaying: (playing) => set({ playing }),
}))

// Any edit to the circuit returns to Live: an old step number may not mean anything any more
// (columns moved, gates removed), and the user expects to see the effect of their edit.
useCircuitStore.subscribe((state, prev) => {
  if (state.circuit === prev.circuit) return
  const steps = useStepStore.getState()
  if (!steps.live || steps.playing) steps.goLive()
})
