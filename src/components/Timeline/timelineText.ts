// Constants and labels for the step-through timeline (V2-5).

/** Time each step stays on screen while playing. */
export const PLAY_STEP_MS = 700

/** Short description of a step, e.g. "after column 1" or "start state". */
export function describeStep(step: number): string {
  return step === 0 ? 'start state' : `after column ${step - 1}`
}
