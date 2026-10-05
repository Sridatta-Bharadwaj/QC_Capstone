// Light/dark theme. Default = OS preference; an explicit choice is remembered in localStorage.
// The resolved theme is applied as <html data-theme="…"> (CSS tokens) and read by
// Monaco and the Three.js Bloch scene via `useThemeStore`.
import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'qc-theme'

function readStoredTheme(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Storage unavailable (private mode, blocked). The choice just won't persist.
  }
}

function systemTheme(): Theme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
}

interface ThemeState {
  theme: Theme
  /** True once the user picked a theme; then OS changes are ignored. */
  explicit: boolean
  setTheme: (theme: Theme) => void
  toggle: () => void
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const stored = typeof window === 'undefined' ? null : readStoredTheme()
  return {
    theme: stored ?? systemTheme(),
    explicit: stored !== null,
    setTheme: (theme) => {
      writeStoredTheme(theme)
      applyTheme(theme)
      set({ theme, explicit: true })
    },
    toggle: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),
  }
})

/** Call once at startup: applies the theme and follows OS changes until the user picks one. */
export function initTheme(): void {
  applyTheme(useThemeStore.getState().theme)
  if (typeof window.matchMedia !== 'function') return
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (useThemeStore.getState().explicit) return
    const theme: Theme = e.matches ? 'dark' : 'light'
    applyTheme(theme)
    useThemeStore.setState({ theme })
  })
}
