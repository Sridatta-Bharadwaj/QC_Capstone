// Window-level guard for files dropped OUTSIDE the code panel.
//
// Without it, dropping a file on the canvas, the spheres or the sidebar makes the browser
// navigate away from the app to show the file (losing nothing thanks to autosave, but it
// breaks a live demo). Here such a drop is caught and opened like a drop on the code panel.
// The code panel handles its own drops in the capture phase and stops them, so this listener
// only sees the rest.
import { showNotice } from '../components/Notices/noticeStore'
import { openCircuitFile } from './openFile'

function hasFiles(e: DragEvent): boolean {
  return e.dataTransfer?.types.includes('Files') ?? false
}

/** Installs the guard on `window`. Returns a function that removes it. */
export function installFileDropGuard(): () => void {
  const onDragOver = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault() // marks the whole window as a drop target, so the browser won't navigate
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    const files = e.dataTransfer?.files
    if (!files || files.length === 0) return
    if (files.length > 1) {
      showNotice('Drop one file at a time.', { kind: 'warning' })
      return
    }
    void openCircuitFile(files[0])
  }
  window.addEventListener('dragover', onDragOver)
  window.addEventListener('drop', onDrop)
  return () => {
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('drop', onDrop)
  }
}
