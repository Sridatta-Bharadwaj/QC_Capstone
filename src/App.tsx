import { CircuitDndProvider } from './components/Canvas/CircuitDndProvider'
import { AppShell } from './components/Layout/AppShell'

export default function App() {
  // Drag-and-drop spans the sidebar (palette) and the canvas, so it wraps the whole shell.
  return (
    <CircuitDndProvider>
      <AppShell />
    </CircuitDndProvider>
  )
}
