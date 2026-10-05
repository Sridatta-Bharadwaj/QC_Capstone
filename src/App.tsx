import { AppShell } from './components/Layout/AppShell'
import { useEngineBridge } from './worker/useEngineBridge'

export default function App() {
  // Keeps useResultsStore in sync with the circuit (the math runs in a Web Worker).
  useEngineBridge()
  return <AppShell />
}
