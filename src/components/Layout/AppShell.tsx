// VS Code-style workspace: sidebar | (canvas | code) over bottom panel, plus title and status bars.
import { useRef } from 'react'
import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { useCircuitStore } from '../../model/store'
import { BottomPanel } from '../BottomPanel/BottomPanel'
import { CanvasView } from '../Canvas/CanvasView'
import { CodePanel } from '../CodePanel/CodePanel'
import { Sidebar } from '../Sidebar/Sidebar'
import { StatusBar } from '../StatusBar/StatusBar'
import { TitleBar } from '../TitleBar/TitleBar'
import { useCanvasFit } from './canvasFit'
import './AppShell.css'

export function AppShell() {
  // The circuit / bottom split follows the qubit count until the user drags it (canvasFit.ts).
  const numQubits = useCircuitStore((s) => s.circuit.numQubits)
  const topPanel = usePanelRef()
  const canvasPanel = useRef<HTMLDivElement>(null)
  const onMainLayoutChanged = useCanvasFit(topPanel, canvasPanel, numQubits)

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-shell__body">
        <Group orientation="horizontal" id="layout-root">
          <Panel id="sidebar" defaultSize="16" minSize={160} className="app-shell__sidebar">
            <Sidebar />
          </Panel>
          <Separator className="app-shell__separator app-shell__separator--v" />
          <Panel id="main" minSize="40">
            <Group orientation="vertical" id="layout-main" onLayoutChanged={onMainLayoutChanged}>
              <Panel id="top" defaultSize="55" minSize="20" panelRef={topPanel}>
                <Group orientation="horizontal" id="layout-top">
                  <Panel
                    id="canvas"
                    defaultSize="64"
                    minSize="30"
                    className="app-shell__canvas"
                    elementRef={canvasPanel}
                  >
                    <CanvasView />
                  </Panel>
                  <Separator className="app-shell__separator app-shell__separator--v" />
                  <Panel id="code" defaultSize="36" minSize={220} className="app-shell__code">
                    <CodePanel />
                  </Panel>
                </Group>
              </Panel>
              <Separator className="app-shell__separator app-shell__separator--h" />
              <Panel id="bottom" defaultSize="45" minSize={120} className="app-shell__bottom">
                <BottomPanel />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
      <StatusBar />
    </div>
  )
}
