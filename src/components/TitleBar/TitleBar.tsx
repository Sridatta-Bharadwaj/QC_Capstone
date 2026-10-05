import { useThemeStore } from '../../theme/themeStore'
import './TitleBar.css'

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
