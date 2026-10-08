import { CircuitDndProvider } from './components/Canvas/CircuitDndProvider'
import { AppShell } from './components/Layout/AppShell'
import { NoticeArea } from './components/Notices/NoticeArea'
import { useEngineBridge } from './worker/useEngineBridge'

export default function App() {
  // Keeps useResultsStore in sync with the circuit (the math runs in a Web Worker).
  useEngineBridge()
  // Drag-and-drop spans the sidebar (palette) and the canvas, so it wraps the whole shell.
  return (
    <CircuitDndProvider>
      <AppShell />
      <NoticeArea />
    </CircuitDndProvider>
  )
}
