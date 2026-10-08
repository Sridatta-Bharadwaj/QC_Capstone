// Small app-wide notices ("Link copied", "Saved circuit was invalid…"), shown by <NoticeArea>.
// Messages are plain strings rendered as React text nodes, never as HTML.
import { create } from 'zustand'

export type NoticeKind = 'info' | 'warning'

export interface Notice {
  id: number
  kind: NoticeKind
  message: string
  /** A URL to show in a read-only, auto-selected field (clipboard fallback for Copy link). */
  link?: string
}

export interface ShowNoticeOptions {
  kind?: NoticeKind
  link?: string
  /** Auto-dismiss after this many ms. Default: info 4 s, warnings and links stay until closed. */
  timeoutMs?: number
}

/** Older notices are dropped past this many, so the area never grows. */
export const MAX_NOTICES = 3

interface NoticeState {
  notices: Notice[]
}

export const useNoticeStore = create<NoticeState>(() => ({ notices: [] }))

let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export function dismissNotice(id: number): void {
  clearTimeout(timers.get(id))
  timers.delete(id)
  useNoticeStore.setState((s) => ({ notices: s.notices.filter((n) => n.id !== id) }))
}

/** Shows a notice and returns its id. Showing the same message again replaces the old one. */
export function showNotice(message: string, options: ShowNoticeOptions = {}): number {
  const kind = options.kind ?? 'info'
  for (const n of useNoticeStore.getState().notices) {
    if (n.message === message) dismissNotice(n.id)
  }
  const notice: Notice = { id: nextId++, kind, message, link: options.link }
  const kept = [...useNoticeStore.getState().notices, notice]
  for (const old of kept.slice(0, Math.max(0, kept.length - MAX_NOTICES))) dismissNotice(old.id)
  useNoticeStore.setState((s) => ({ notices: [...s.notices, notice] }))

  const timeout = options.timeoutMs ?? (kind === 'info' && !options.link ? 4000 : undefined)
  if (timeout !== undefined) {
    timers.set(
      notice.id,
      setTimeout(() => dismissNotice(notice.id), timeout),
    )
  }
  return notice.id
}

/** Removes every notice (tests). */
export function clearNotices(): void {
  for (const n of useNoticeStore.getState().notices) dismissNotice(n.id)
}
