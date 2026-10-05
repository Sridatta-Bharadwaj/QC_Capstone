// VS Code-style workspace: sidebar | (canvas | code) over bottom panel, plus title and status bars.
import { Group, Panel, Separator } from 'react-resizable-panels'
import { BottomPanel } from '../BottomPanel/BottomPanel'
import { CanvasView } from '../Canvas/CanvasView'
import { CodePanel } from '../CodePanel/CodePanel'
import { Sidebar } from '../Sidebar/Sidebar'
import { StatusBar } from '../StatusBar/StatusBar'
import { TitleBar } from '../TitleBar/TitleBar'
import './AppShell.css'

export function AppShell() {
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
            <Group orientation="vertical" id="layout-main">
              <Panel id="top" defaultSize="60" minSize="20">
                <Group orientation="horizontal" id="layout-top">
                  <Panel id="canvas" defaultSize="64" minSize="30" className="app-shell__canvas">
                    <CanvasView />
                  </Panel>
                  <Separator className="app-shell__separator app-shell__separator--v" />
                  <Panel id="code" defaultSize="36" minSize={220} className="app-shell__code">
                    <CodePanel />
                  </Panel>
                </Group>
              </Panel>
              <Separator className="app-shell__separator app-shell__separator--h" />
              <Panel id="bottom" defaultSize="40" minSize={120} className="app-shell__bottom">
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
