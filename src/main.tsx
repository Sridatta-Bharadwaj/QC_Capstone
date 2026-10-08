import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Fonts and icons are bundled locally (no CDN) so the app works offline.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@vscode/codicons/dist/codicon.css'

import './styles/tokens.css'
import './styles/global.css'

import App from './App'
import { AppCrashScreen, ErrorBoundary } from './components/common/ErrorBoundary'
import { installFileDropGuard } from './files/dropGuard'
import { installHistoryShortcuts } from './history/shortcuts'
import { STORAGE_KEY } from './persistence/autosave'
import { initPersistence } from './persistence/startup'
import { initTheme } from './theme/themeStore'

initTheme()
// Before the first render: load the shared link / saved circuit (no flash of the default
// circuit), then start undo history and autosave.
initPersistence()
installHistoryShortcuts()
// A file dropped outside the code panel is opened instead of replacing the page.
installFileDropGuard()

/** Last resort after a crash: forget the saved circuit (it may be what crashes) and reload. */
function resetWorkspace(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked: the reload alone still helps.
  }
  location.replace(location.pathname)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* A crash anywhere outside the panel boundaries shows a recovery screen, never a blank page. */}
    <ErrorBoundary fallback={() => <AppCrashScreen onReset={resetWorkspace} />}>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
