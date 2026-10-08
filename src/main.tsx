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
import { installFileDropGuard } from './files/dropGuard'
import { installHistoryShortcuts } from './history/shortcuts'
import { initPersistence } from './persistence/startup'
import { initTheme } from './theme/themeStore'

initTheme()
// Before the first render: load the shared link / saved circuit (no flash of the default
// circuit), then start undo history and autosave.
initPersistence()
installHistoryShortcuts()
// A file dropped outside the code panel is opened instead of replacing the page.
installFileDropGuard()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
