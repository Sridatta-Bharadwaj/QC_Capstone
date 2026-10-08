// Inspector bar for the selected gate: re-target its qubits, edit its angle (text or
// slider), delete it.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { runWithHistoryKey } from '../../history/history'
import { formatAngle, parseAngle } from '../../model/angle'
import { useCircuitStore } from '../../model/store'
import { GATES, type Operation } from '../../model/types'
import { deleteSelected } from './actions'
import {
  FrameThrottle,
  SLIDER_MAX_TICKS,
  SLIDER_MIN_TICKS,
  angleToTicks,
  keyboardAngle,
  newGestureKey,
  sliderLabel,
  sliderValueText,
  snapAngle,
  ticksToAngle,
} from './angleSlider'
import { useCanvasStore } from './canvasStore'
import { qubitRoles, retargetQubits } from './placement'

interface GateInspectorProps {
  op: Operation
  numQubits: number
}

export function GateInspector({ op, numQubits }: GateInspectorProps) {
  const info = GATES[op.gate]
  const roles = qubitRoles(op.gate)
  const updateOperation = useCircuitStore((s) => s.updateOperation)
  const showHint = useCanvasStore((s) => s.showHint)

  function setRole(index: number, qubit: number) {
    const qubits = retargetQubits(op.qubits, index, qubit)
    if (!updateOperation(op.id, { qubits }))
      showHint(`Column ${op.column} is already used on those wires.`)
  }

  return (
    <div className="inspector" role="group" aria-label={`Selected gate ${info.label}`}>
      <span className="inspector__gate">{info.label}</span>
      <span className="inspector__meta">column {op.column}</span>

      {roles.map((role, i) => (
        <label key={role} className="inspector__field">
          <span>{role}</span>
          <select
            className="inspector__select"
            value={op.qubits[i]}
            onChange={(e) => setRole(i, Number(e.target.value))}
          >
            {Array.from({ length: numQubits }, (_, q) => (
              <option key={q} value={q}>
                q{q}
              </option>
            ))}
          </select>
        </label>
      ))}

      {info.parametric && op.angle !== undefined && (
        <>
          <AngleField angle={op.angle} onCommit={(angle) => updateOperation(op.id, { angle })} />
          <AngleSlider opId={op.id} angle={op.angle} />
        </>
      )}

      <span className="inspector__spacer" />
      <button
        type="button"
        className="inspector__button"
        onClick={deleteSelected}
        title="Delete gate (Delete)"
      >
        <span className="codicon codicon-trash" aria-hidden="true" />
        Delete
      </button>
    </div>
  )
}

interface AngleFieldProps {
  angle: number
  onCommit: (angle: number) => void
}

/** Text input for a rotation angle. Accepts expressions like "pi/2", "-3*pi/4", "0.5". */
function AngleField({ angle, onCommit }: AngleFieldProps) {
  const errorId = useId()
  const [draft, setDraft] = useState({ forAngle: angle, text: formatAngle(angle), error: false })

  // When the angle changes from outside (or after a commit), show the normalised text.
  // Adjusting state during render is React's recommended alternative to an effect here.
  if (draft.forAngle !== angle)
    setDraft({ forAngle: angle, text: formatAngle(angle), error: false })

  const revert = () => setDraft({ forAngle: angle, text: formatAngle(angle), error: false })

  /**
   * Enter: apply a valid angle; invalid text stays in the field with an inline error so it can
   * be corrected. Blur: the same, except invalid text is dropped and the field shows the angle
   * the model actually has again (it never displays a value that is not in the circuit).
   */
  function commit(onInvalid: 'keep' | 'revert') {
    const value = parseAngle(draft.text)
    if (value === null) {
      if (onInvalid === 'revert') revert()
      else setDraft({ ...draft, error: true })
      return
    }
    if (value === angle) setDraft({ forAngle: angle, text: formatAngle(angle), error: false })
    else onCommit(value)
  }

  return (
    <label className="inspector__field">
      <span>θ</span>
      <input
        className="inspector__input"
        value={draft.text}
        spellCheck={false}
        aria-label="Rotation angle"
        aria-invalid={draft.error}
        aria-describedby={draft.error ? errorId : undefined}
        onChange={(e) => setDraft({ ...draft, text: e.target.value, error: false })}
        onBlur={() => commit('revert')}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit('keep')
          if (e.key === 'Escape') revert()
        }}
      />
      {draft.error && (
        <span id={errorId} className="inspector__error" role="alert">
          Invalid angle. Try pi/2, -pi/4 or 0.5
        </span>
      )}
    </label>
  )
}

/**
 * Sets the gate's angle as part of the gesture `key` (one undo step per key). Skips the
 * update when the angle is already that value, so a drag that ends where it started leaves
 * no empty undo step.
 */
function applySliderAngle(opId: string, angle: number, key: string) {
  const store = useCircuitStore.getState()
  const op = store.circuit.operations.find((o) => o.id === opId)
  if (!op || op.angle === angle) return
  runWithHistoryKey(key, () => store.updateOperation(opId, { angle }))
}

interface AngleSliderProps {
  opId: string
  angle: number
}

/**
 * Range slider for a rotation angle, −2π … 2π (PLAN.md → V2-6).
 *
 * - Pointer drag: updates the circuit live, at most once per animation frame (FrameThrottle);
 *   the last value is committed on release. The whole drag is ONE undo step.
 * - Shift while dragging snaps to multiples of π/8.
 * - Keyboard: ←/→ ±1°, Shift+arrows or PageUp/PageDown jump between π/8 marks, Home/End.
 *   Each key press (including its auto-repeat while held) is one undo step.
 */
function AngleSlider({ opId, angle }: AngleSliderProps) {
  // While dragging, the thumb and label follow the pointer at once; the circuit catches up
  // on the next animation frame. null = show the circuit's angle.
  const [dragAngle, setDragAngle] = useState<number | null>(null)
  const shown = dragAngle ?? angle

  const keyPressKey = useRef('')
  const shiftHeld = useRef(false)
  /** Throttle of the drag in progress (null when not dragging). */
  const dragThrottle = useRef<FrameThrottle | null>(null)
  const endDragRef = useRef<(() => void) | null>(null)

  // Unmounting mid-drag (e.g. the gate is deleted): commit what we have, drop listeners.
  useEffect(() => () => endDragRef.current?.(), [])

  function startDrag(e: PointerEvent<HTMLInputElement>) {
    endDragRef.current?.()
    // One history key for the whole drag: every frame's update lands in one undo step.
    const key = newGestureKey('slider', opId)
    const throttle = new FrameThrottle((value) => applySliderAngle(opId, value, key))
    dragThrottle.current = throttle
    shiftHeld.current = e.shiftKey
    // The pointer may leave the slider while dragging, so listen on the window.
    const trackShift = (ev: globalThis.PointerEvent | globalThis.KeyboardEvent) => {
      shiftHeld.current = ev.shiftKey
    }
    const end = () => {
      window.removeEventListener('pointermove', trackShift)
      window.removeEventListener('keydown', trackShift)
      window.removeEventListener('keyup', trackShift)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      endDragRef.current = null
      dragThrottle.current = null
      throttle.flush()
      setDragAngle(null)
    }
    window.addEventListener('pointermove', trackShift)
    window.addEventListener('keydown', trackShift)
    window.addEventListener('keyup', trackShift)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    endDragRef.current = end
  }

  function onChange(ticks: number) {
    let value = ticksToAngle(ticks)
    if (shiftHeld.current) value = snapAngle(value)
    if (dragThrottle.current) {
      setDragAngle(value)
      dragThrottle.current.push(value)
    } else {
      // A change without a pointer drag (e.g. assistive technology): its own undo step.
      applySliderAngle(opId, value, newGestureKey('slider', opId))
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    const current = useCircuitStore.getState().circuit.operations.find((o) => o.id === opId)
    if (current?.angle === undefined) return
    const next = keyboardAngle(current.angle, e.key, e.shiftKey)
    if (next === null) return
    e.preventDefault() // we move the value ourselves (the native step is only 0.25°)
    // A new press starts a new undo step; auto-repeat while the key is held continues it.
    if (!e.repeat || keyPressKey.current === '')
      keyPressKey.current = newGestureKey('slider-key', opId)
    applySliderAngle(opId, next, keyPressKey.current)
  }

  return (
    <span className="inspector__field">
      <input
        type="range"
        className="inspector__slider"
        min={SLIDER_MIN_TICKS}
        max={SLIDER_MAX_TICKS}
        step={1}
        value={angleToTicks(shown)}
        aria-label="Rotation angle slider"
        aria-valuetext={sliderValueText(shown)}
        title="Drag to change the angle. Hold Shift to snap to multiples of π/8."
        onPointerDown={startDrag}
        onChange={(e) => onChange(Number(e.target.value))}
        onKeyDown={onKeyDown}
      />
      <span className="inspector__slider-value" aria-hidden="true">
        {sliderLabel(shown)}
      </span>
    </span>
  )
}
