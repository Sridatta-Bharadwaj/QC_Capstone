// The start-state label at the left end of a wire (|0⟩, |1⟩, |+⟩, …) and its menu.
//
// Every wire starts in one of six single-qubit states: the poles of the Bloch sphere's three
// axes. The circuit then starts in their product state, e.g. |+⟩ ⊗ |0⟩. The engine builds that
// state directly; the code tabs write it as a block of preparation gates (codegen/prep.ts).
//
// Keyboard: a standard menu button. Enter / Space / ArrowDown / ArrowUp open the menu with the
// current state focused; ArrowUp / ArrowDown / Home / End move; Enter / Space pick; Escape
// closes and returns focus to the button; Tab closes.
//
// The menu is portalled to <body> with fixed coordinates, so the canvas's scroll container
// never clips it (the bottom wire's menu would otherwise be cut off).
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useCircuitStore } from '../../model/store'
import { INITIAL_STATES, type InitialState } from '../../model/types'
import { MathText } from '../common/MathText'

/** Ket label of each state (real minus sign, not a hyphen). */
export const INITIAL_STATE_KETS: Record<InitialState, string> = {
  '0': '|0⟩',
  '1': '|1⟩',
  '+': '|+⟩',
  '-': '|−⟩',
  i: '|i⟩',
  '-i': '|−i⟩',
}

/** Where each state sits on the Bloch sphere (shown next to the ket in the menu). */
const BLOCH_DIRECTION: Record<InitialState, string> = {
  '0': '+z',
  '1': '−z',
  '+': '+x',
  '-': '−x',
  i: '+y',
  '-i': '−y',
}

interface InitialStatePickerProps {
  qubit: number
  state: InitialState
}

export function InitialStatePicker({ qubit, state }: InitialStatePickerProps) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const menuId = useId()
  const ket = INITIAL_STATE_KETS[state]

  const openMenu = (focus: number) => {
    setActive(focus)
    setOpen(true)
  }

  const close = (returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) buttonRef.current?.focus()
  }

  const choose = (next: InitialState) => {
    // Source 'canvas': history, autosave and both code tabs follow like any canvas edit.
    useCircuitStore.getState().setInitialState(qubit, next, 'canvas')
    close(true)
  }

  // Place the menu under the button (fixed coordinates, measured before paint).
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    setPosition({ left: rect.left, top: rect.bottom + 2 })
  }, [open])

  // Keep focus on the active item while the menu is open.
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
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) close(false)
    }
    const onResize = () => close(false)
    document.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const current = INITIAL_STATES.indexOf(state)

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu(current)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      openMenu(current)
    }
  }

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const last = INITIAL_STATES.length - 1
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
        choose(INITIAL_STATES[active])
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
        className="initial-state__button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Initial state of q${qubit}: ${ket}`}
        title={`Initial state of q${qubit}: ${ket}. Click to change.`}
        onClick={() => (open ? close(false) : openMenu(current))}
        onKeyDown={onButtonKeyDown}
      >
        <MathText text={ket} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={`Initial state of q${qubit}`}
            className="initial-state__menu"
            style={position ? { left: position.left, top: position.top } : { visibility: 'hidden' }}
            onKeyDown={onMenuKeyDown}
          >
            {INITIAL_STATES.map((option, k) => (
              <button
                key={option}
                ref={(el) => {
                  itemRefs.current[k] = el
                }}
                type="button"
                role="menuitemradio"
                aria-checked={option === state}
                aria-label={`${INITIAL_STATE_KETS[option]} (${BLOCH_DIRECTION[option]})`}
                tabIndex={k === active ? 0 : -1}
                className="initial-state__item"
                onClick={() => choose(option)}
                onMouseEnter={() => setActive(k)}
              >
                <span className="initial-state__check" aria-hidden="true">
                  {option === state ? <i className="codicon codicon-check" /> : null}
                </span>
                <span className="initial-state__ket">
                  <MathText text={INITIAL_STATE_KETS[option]} />
                </span>
                <span className="initial-state__axis">{BLOCH_DIRECTION[option]}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
