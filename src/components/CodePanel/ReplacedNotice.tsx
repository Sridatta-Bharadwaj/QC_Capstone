// One-line notice shown after a canvas or preset change overwrote QASM text that had errors.
// The text is not lost: the regeneration is a single undo step in the editor, so Ctrl+Z
// brings it back. Shown in the code panel and the Problems tab; cleared by the next editor
// edit or by its close button (see qasmSync.ts).
import { dismissReplacedNotice, useQasmText } from './qasmSync'
import './ReplacedNotice.css'

export const REPLACED_MESSAGE =
  'Code with errors was replaced by a canvas edit. Press Ctrl+Z in the editor to get it back.'

export function ReplacedNotice() {
  const visible = useQasmText((s) => s.replacedByCanvas)
  if (!visible) return null
  return (
    <div className="replaced-notice" role="status" data-testid="replaced-notice">
      <span className="codicon codicon-info replaced-notice__icon" aria-hidden="true" />
      <span className="replaced-notice__text">{REPLACED_MESSAGE}</span>
      <button
        type="button"
        className="icon-button replaced-notice__close"
        aria-label="Dismiss notice"
        title="Dismiss"
        onClick={dismissReplacedNotice}
      >
        <span className="codicon codicon-close" aria-hidden="true" />
      </button>
    </div>
  )
}
