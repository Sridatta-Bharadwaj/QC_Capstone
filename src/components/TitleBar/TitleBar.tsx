import { isNewCircuit, newCircuit, redoCircuit, undoCircuit } from '../../history/history'
import { useHistoryStore } from '../../model/historyStore'
import { useCircuitStore } from '../../model/store'
import { copyShareLink } from '../../persistence/copyLink'
import { useThemeStore } from '../../theme/themeStore'
import './TitleBar.css'

/** "Ctrl" or "⌘" for shortcut hints. */
const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'

interface ActionButtonProps {
  /** Full codicon class, e.g. 'codicon-redo' (kept literal so the design test sees it). */
  icon: string
  label: string
  /** When set, the button is disabled and this explains why (tooltip). */
  disabledReason?: string
  onClick: () => void
}

/** Icon button whose tooltip says what it does, or why it is disabled. */
function ActionButton({ icon, label, disabledReason, onClick }: ActionButtonProps) {
  const disabled = disabledReason !== undefined
  return (
    <button
      type="button"
      className="icon-button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? `${label}: ${disabledReason}` : label}
      aria-label={disabled ? `${label} (${disabledReason})` : label}
    >
      <span className={`codicon ${icon}`} aria-hidden="true" />
    </button>
  )
}

/** Undo, redo, new circuit and copy link (circuit-wide actions). */
function CircuitActions() {
  const canUndo = useHistoryStore((s) => s.canUndo)
  const canRedo = useHistoryStore((s) => s.canRedo)
  const isNew = useCircuitStore((s) => isNewCircuit(s.circuit))
  return (
    <div className="title-bar__actions" role="group" aria-label="Circuit">
      <ActionButton
        icon="codicon-discard"
        label={`Undo circuit change (${MOD}+Z)`}
        disabledReason={canUndo ? undefined : 'nothing to undo'}
        onClick={undoCircuit}
      />
      <ActionButton
        icon="codicon-redo"
        label={`Redo circuit change (${MOD}+Shift+Z)`}
        disabledReason={canRedo ? undefined : 'nothing to redo'}
        onClick={redoCircuit}
      />
      <ActionButton
        icon="codicon-new-file"
        label="New circuit (2 qubits, all |0⟩)"
        disabledReason={isNew ? 'the circuit is already empty' : undefined}
        onClick={newCircuit}
      />
      <ActionButton
        icon="codicon-link"
        label="Copy link to this circuit"
        onClick={() => void copyShareLink()}
      />
    </div>
  )
}

export function TitleBar() {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <header className="title-bar">
      <span className="codicon codicon-circuit-board title-bar__icon" aria-hidden="true" />
      <h1 className="title-bar__title">QC Capstone</h1>
      <span className="title-bar__subtitle">Reduced density matrices on the Bloch sphere</span>
      <span className="title-bar__spacer" />
      <CircuitActions />
      <span className="title-bar__divider" aria-hidden="true" />
      <button
        type="button"
        className="icon-button"
        onClick={toggle}
        title={`Switch to ${next} theme`}
        aria-label={`Switch to ${next} theme`}
      >
        <span className="codicon codicon-color-mode" aria-hidden="true" />
      </button>
    </header>
  )
}
