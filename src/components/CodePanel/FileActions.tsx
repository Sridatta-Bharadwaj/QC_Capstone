// Code panel toolbar buttons for files (V2-3): "Open file" and the "Download" menu.
//
// Download menu keyboard: a standard menu button. Enter / Space / ArrowDown open it with the
// first item focused; ArrowUp / ArrowDown / Home / End move; Enter / Space pick; Escape closes
// and returns focus to the button; Tab closes. Portalled to <body> with fixed coordinates so
// the panel's overflow never clips it.
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { exportBlochPng } from '../../files/blochPngExport'
import { downloadCode } from '../../files/download'
import { OPEN_FILE_ACCEPT, openCircuitFile } from '../../files/openFile'
import { useCircuitStore } from '../../model/store'
import { showNotice } from '../Notices/noticeStore'

/** Hidden file input behind a toolbar icon. */
export function OpenFileButton() {
  const input = useRef<HTMLInputElement>(null)
  const label = 'Open file (.qasm, .py, .txt)'
  return (
    <>
      <button
        type="button"
        className="icon-button"
        title={label}
        aria-label={label}
        onClick={() => input.current?.click()}
      >
        <span className="codicon codicon-folder-opened" aria-hidden="true" />
      </button>
      <input
        ref={input}
        type="file"
        accept={OPEN_FILE_ACCEPT}
        hidden
        data-testid="open-file-input"
        onChange={(e) => {
          const file = e.target.files?.[0]
          // Reset so choosing the same file again still fires a change event.
          e.target.value = ''
          if (file) void openCircuitFile(file)
        }}
      />
    </>
  )
}

interface DownloadItem {
  id: 'qasm' | 'py' | 'png'
  label: string
  detail: string
}

const ITEMS: DownloadItem[] = [
  { id: 'qasm', label: 'OpenQASM 2.0', detail: '.qasm' },
  { id: 'py', label: 'Qiskit Python', detail: '.py' },
  { id: 'png', label: 'Bloch spheres', detail: '.png' },
]

async function download(id: DownloadItem['id']) {
  if (id === 'png') {
    const result = await exportBlochPng()
    if ('error' in result) showNotice(result.error, { kind: 'warning' })
    else showNotice(`Downloaded ${result.filename}`)
    return
  }
  const filename = downloadCode(id, useCircuitStore.getState().circuit)
  showNotice(`Downloaded ${filename}`)
}

export function DownloadMenu() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<{ right: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()

  const openMenu = (focus: number) => {
    setActive(focus)
    setOpen(true)
  }

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  const choose = (id: DownloadItem['id']) => {
    close(true)
    void download(id)
  }

  // Right-align the menu under the button (the button sits at the right edge of the panel).
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPosition({ right: window.innerWidth - rect.right, top: rect.bottom + 2 })
  }, [open])

  useEffect(() => {
    if (open) itemRefs.current[active]?.focus()
  }, [open, active, position])

  // Click outside, scrolling or resizing closes the menu (its fixed position would go stale).
  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false)
    }
    const onResize = () => close(false)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu(0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu(ITEMS.length - 1)
    }
  }

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = ITEMS.length - 1
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActive((a) => (a === last ? 0 : a + 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActive((a) => (a === 0 ? last : a - 1))
        break
      case 'Home':
        e.preventDefault()
        setActive(0)
        break
      case 'End':
        e.preventDefault()
        setActive(last)
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        choose(ITEMS[active].id)
        break
      case 'Escape':
        e.preventDefault()
        e.stopPropagation()
        close(true)
        break
      case 'Tab':
        close(false)
        break
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        title="Download"
        aria-label="Download"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close(false) : openMenu(0))}
        onKeyDown={onButtonKeyDown}
      >
        <span className="codicon codicon-cloud-download" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label="Download"
            className="file-menu"
            style={
              position ? { right: position.right, top: position.top } : { visibility: 'hidden' }
            }
            onKeyDown={onMenuKeyDown}
          >
            {ITEMS.map((item, k) => (
              <button
                key={item.id}
                ref={(el) => {
                  itemRefs.current[k] = el
                }}
                type="button"
                role="menuitem"
                tabIndex={k === active ? 0 : -1}
                className="file-menu__item"
                onClick={() => choose(item.id)}
                onMouseEnter={() => setActive(k)}
              >
                <span className="file-menu__label">{item.label}</span>
                <span className="file-menu__detail">{item.detail}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
