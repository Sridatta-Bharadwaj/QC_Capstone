// Notices in the bottom-right corner above the status bar, like VS Code notifications:
// small, bordered, dismissible, not modal. role="status" so screen readers announce them.
import { useEffect, useRef } from 'react'
import { dismissNotice, useNoticeStore, type Notice } from './noticeStore'
import './NoticeArea.css'

/** Read-only link field (clipboard fallback): selected on mount so Ctrl+C copies it. */
function LinkField({ link }: { link: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className="notice__link"
      type="text"
      readOnly
      value={link}
      aria-label="Shareable link"
      onFocus={(e) => e.currentTarget.select()}
    />
  )
}

function NoticeItem({ notice }: { notice: Notice }) {
  return (
    <div className={`notice notice--${notice.kind}`} role="status" data-testid="notice">
      <div className="notice__row">
        <span
          className={`codicon ${notice.kind === 'warning' ? 'codicon-warning' : 'codicon-info'} notice__icon`}
          aria-hidden="true"
        />
        <span className="notice__text">{notice.message}</span>
        <button
          type="button"
          className="icon-button notice__close"
          aria-label="Dismiss notice"
          title="Dismiss"
          onClick={() => dismissNotice(notice.id)}
        >
          <span className="codicon codicon-close" aria-hidden="true" />
        </button>
      </div>
      {notice.link !== undefined && <LinkField link={notice.link} />}
    </div>
  )
}

export function NoticeArea() {
  const notices = useNoticeStore((s) => s.notices)
  if (notices.length === 0) return null
  return (
    <div className="notice-area">
      {notices.map((n) => (
        <NoticeItem key={n.id} notice={n} />
      ))}
    </div>
  )
}
