// Opening a circuit file (V2-3): from the "Open file" button or dropped onto the code panel.
//
//   .qasm → QASM tab    .py → Qiskit tab    .txt → QASM if it has an `OPENQASM` line, else Qiskit
//
// Security (PLAN.md → Security rules): a file is untrusted input. Its size is checked BEFORE it
// is read; it is read with File.text() only, never executed and never sent anywhere; binary
// content is rejected. The text then goes through the normal parser of its tab, which has its
// own limits. Every failure is a clear notice; nothing is changed unless the file parses.
import { CODE_TAB_LABELS, openCode } from '../components/CodePanel/codeSync'
import { showNotice } from '../components/Notices/noticeStore'
import { useUiStore } from '../model/uiStore'
import { MAX_UPLOAD_BYTES, type CodeTab } from '../model/types'
import { MAX_REPORTED_PROBLEMS } from '../parser/qasm'

/** Extensions the picker offers (also the `accept` attribute of the file input). */
export const OPEN_FILE_ACCEPT = '.qasm,.py,.txt'

export type ReadFileResult = { tab: CodeTab; text: string } | { error: string }

/** The part of `File` we use (so tests can pass plain objects). */
export interface TextFile {
  name: string
  size: number
  text: () => Promise<string>
}

/** True for character codes 0–31 and 127 (control characters). */
const isControl = (code: number) => code < 32 || code === 127

/** File name as shown in messages: control characters removed, long names shortened. */
export function displayName(name: string): string {
  const clean = [...name].filter((ch) => !isControl(ch.charCodeAt(0))).join('')
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean
}

/** Lower-case extension including the dot, e.g. '.qasm', or '' if there is none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot).toLowerCase() : ''
}

/** A .txt file is QASM if any line starts with the `OPENQASM` header, otherwise Qiskit. */
export function sniffTab(text: string): CodeTab {
  return /^\s*OPENQASM\b/m.test(text) ? 'qasm' : 'qiskit'
}

/** Which tab a file name goes to; 'sniff' = decide from the text; null = not supported. */
export function tabForName(name: string): CodeTab | 'sniff' | null {
  switch (extensionOf(name)) {
    case '.qasm':
      return 'qasm'
    case '.py':
      return 'qiskit'
    case '.txt':
      return 'sniff'
    default:
      return null
  }
}

/** Tab, line feed, vertical tab, form feed, carriage return: the control characters text uses. */
const TEXT_CONTROLS = new Set([9, 10, 11, 12, 13])

/** True if the text contains NUL or other control characters that only binary files have. */
export function looksBinary(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 32 && !TEXT_CONTROLS.has(code)) return true
  }
  return false
}

/**
 * Checks and reads a file. Cheap checks (extension, size) come first, so an unsupported or
 * huge file is never read at all.
 */
export async function readCircuitFile(file: TextFile): Promise<ReadFileResult> {
  const name = displayName(file.name)
  const route = tabForName(file.name)
  if (route === null) {
    return { error: `Can't open "${name}": only .qasm, .py and .txt files are supported.` }
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      error:
        `"${name}" is too large (${Math.ceil(file.size / 1024)} KB); ` +
        `the limit is ${MAX_UPLOAD_BYTES / 1024} KB.`,
    }
  }
  let text: string
  try {
    text = await file.text()
  } catch {
    return { error: `Could not read "${name}".` }
  }
  // The size check above counts bytes; check the decoded text too (it is what the parser sees).
  if (text.length > MAX_UPLOAD_BYTES) {
    return { error: `"${name}" is too large; the limit is ${MAX_UPLOAD_BYTES / 1024} KB.` }
  }
  if (looksBinary(text)) {
    return { error: `"${name}" is not a text file.` }
  }
  // Drop the byte-order mark some editors write at the start.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return { tab: route === 'sniff' ? sniffTab(text) : route, text }
}

/**
 * Opens a file into its code tab: switches to the tab, parses the text through the normal
 * sync (source 'file') and says what happened in a notice.
 */
export async function openCircuitFile(file: TextFile): Promise<void> {
  const read = await readCircuitFile(file)
  if ('error' in read) {
    showNotice(read.error, { kind: 'warning' })
    return
  }
  const name = displayName(file.name)
  const label = CODE_TAB_LABELS[read.tab]
  useUiStore.getState().setCodeTab(read.tab)
  const { circuit, problems } = openCode(read.tab, read.text)
  const errors = problems.filter((p) => p.severity === 'error').length
  const warnings = problems.length - errors
  // The parsers stop after MAX_REPORTED_PROBLEMS and add one "Stopped after…" error.
  const errorText =
    problems.length > MAX_REPORTED_PROBLEMS
      ? `more than ${MAX_REPORTED_PROBLEMS} errors`
      : errors === 1
        ? '1 error'
        : `${errors} errors`
  if (!circuit) {
    showNotice(
      `"${name}" has ${errorText} (see the Problems tab). ` +
        `It is in the ${label} tab; the circuit was not changed.`,
      { kind: 'warning' },
    )
  } else if (warnings > 0) {
    showNotice(
      `Opened "${name}" in the ${label} tab with ` +
        `${warnings === 1 ? '1 warning' : `${warnings} warnings`} (see the Problems tab).`,
    )
  } else {
    showNotice(`Opened "${name}" in the ${label} tab.`)
  }
}
