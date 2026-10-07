// Inspector bar for the selected gate: re-target its qubits, edit its angle, delete it.
import { useId, useState } from 'react'
import { formatAngle, parseAngle } from '../../model/angle'
import { useCircuitStore } from '../../model/store'
import { GATES, type Operation } from '../../model/types'
import { deleteSelected } from './actions'
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
        <AngleField angle={op.angle} onCommit={(angle) => updateOperation(op.id, { angle })} />
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
