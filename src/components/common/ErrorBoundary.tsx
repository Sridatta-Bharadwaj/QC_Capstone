// Error boundaries: a crash in one part of the UI must never blank the whole page (a live
// demo depends on it). React only supports boundaries as class components.
//
// - <ErrorBoundary fallback={...}> is the generic building block (custom fallback, reset).
// - <PanelBoundary name="..."> wraps one workspace panel: the panel shows a short message
//   and a "Try again" button, and the rest of the app keeps working.
// - The root boundary in main.tsx uses <AppCrashScreen/>, which can also reset the saved
//   workspace (a corrupted circuit could otherwise crash again on every reload).
import { Component, type ErrorInfo, type ReactNode } from 'react'
import './ErrorBoundary.css'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Rendered instead of the children after an error. `reset` re-mounts the children. */
  fallback: (error: Error, reset: () => void) => ReactNode
  /** Called once per caught error (e.g. to log it). */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the console for debugging; nothing is sent anywhere.
    console.error('UI error caught by boundary:', error, info.componentStack)
    this.props.onError?.(error, info)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    return error ? this.props.fallback(error, this.reset) : this.props.children
  }
}

/** One workspace panel: on error, a compact message with a retry button. */
export function PanelBoundary({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(_error, reset) => (
        <div className="error-panel" role="alert">
          <span className="codicon codicon-warning error-panel__icon" aria-hidden="true" />
          <p className="error-panel__title">The {name} panel ran into a problem.</p>
          <p className="error-panel__text">The rest of the workspace still works.</p>
          <button type="button" className="error-panel__button" onClick={reset}>
            Try again
          </button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  )
}

interface AppCrashScreenProps {
  /** Clears the saved workspace (autosave) before reloading. */
  onReset: () => void
}

/** Whole-app fallback. Plain markup only, so it still renders if app state is broken. */
export function AppCrashScreen({ onReset }: AppCrashScreenProps) {
  return (
    <div className="error-app" role="alert">
      <div className="error-app__box">
        <p className="error-app__title">Something went wrong.</p>
        <p className="error-app__text">
          Reload the page to continue. If the problem comes back, reset the workspace: this clears
          the saved circuit and starts from an empty one.
        </p>
        <div className="error-app__actions">
          <button type="button" className="error-panel__button" onClick={() => location.reload()}>
            Reload
          </button>
          <button type="button" className="error-panel__button" onClick={onReset}>
            Reset workspace
          </button>
        </div>
      </div>
    </div>
  )
}
