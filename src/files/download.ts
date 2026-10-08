// Downloads (V2-3): the circuit as .qasm / .py and the Bloch spheres as .png.
//
// Files are made in the browser and saved through a temporary object URL: nothing is sent
// anywhere. The code files are generated from the circuit model (codegen), not copied from
// the editor: the model is always valid, while the editor text may have errors in it.
import { toQasm, toQiskit } from '../codegen'
import type { Circuit } from '../model/types'

export type DownloadKind = 'qasm' | 'py' | 'png'

const pad = (n: number) => String(n).padStart(2, '0')

/** Local date and time, safe in a file name: e.g. 20261008-1530. */
export function fileTimestamp(date: Date = new Date()): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-` +
    `${pad(date.getHours())}${pad(date.getMinutes())}`
  )
}

/** circuit-20261008-1530.qasm, circuit-20261008-1530.py, bloch-spheres-20261008-1530.png */
export function downloadFilename(kind: DownloadKind, date: Date = new Date()): string {
  const stamp = fileTimestamp(date)
  return kind === 'png' ? `bloch-spheres-${stamp}.png` : `circuit-${stamp}.${kind}`
}

/** The text of a code download, generated from the circuit. */
export function codeFileText(kind: 'qasm' | 'py', circuit: Circuit): string {
  return kind === 'qasm' ? toQasm(circuit) : toQiskit(circuit)
}

/** MIME type of each download. */
export const DOWNLOAD_MIME: Record<DownloadKind, string> = {
  qasm: 'text/plain;charset=utf-8',
  py: 'text/x-python;charset=utf-8',
  png: 'image/png',
}

/** Saves a blob as a file: a temporary <a download> pointing at an object URL. */
/** Delay before the object URL of a download is released. */
export const REVOKE_DELAY_MS = 10_000

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  // Revoke only after the browser has had time to start the download (Firefox and Safari
  // read the blob asynchronously; revoking at once can cancel the download there).
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

/** Downloads the circuit as OpenQASM 2.0 or Qiskit Python; returns the file name. */
export function downloadCode(kind: 'qasm' | 'py', circuit: Circuit, date = new Date()): string {
  const filename = downloadFilename(kind, date)
  saveBlob(new Blob([codeFileText(kind, circuit)], { type: DOWNLOAD_MIME[kind] }), filename)
  return filename
}
