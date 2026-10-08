// One-line notice shown after a change from elsewhere (canvas, preset, the other code tab…)
// overwrote a code tab's text that had errors. The text is not lost: the regeneration is a
// single undo step in that editor, so Ctrl+Z brings it back. Shown in the code panel and the
// Problems tab; cleared by the next edit in that tab or by its close button (see codeSync.ts).
import type { CodeTab } from '../../model/types'
import { codeTextStores, dismissReplacedNotice, replacedMessage } from './codeSync'
import './ReplacedNotice.css'

export function ReplacedNotice({ tab }: { tab: CodeTab }) {
  const replacedBy = codeTextStores[tab]((s) => s.replacedBy)
  if (replacedBy === null) return null
  return (
    <div className="replaced-notice" role="status" data-testid="replaced-notice">
      <span className="codicon codicon-info replaced-notice__icon" aria-hidden="true" />
      <span className="replaced-notice__text">{replacedMessage(tab, replacedBy)}</span>
      <button
        type="button"
        className="icon-button replaced-notice__close"
        aria-label="Dismiss notice"
        title="Dismiss"
        onClick={() => dismissReplacedNotice(tab)}
      >
        <span className="codicon codicon-close" aria-hidden="true" />
      </button>
    </div>
  )
}
