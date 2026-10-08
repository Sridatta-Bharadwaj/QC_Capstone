// QASM-tab shortcuts over the shared two-tab sync in codeSync.ts (kept so existing imports work).
import { applyCode, codeTextStores, editCode } from './codeSync'

export { PARSE_DEBOUNCE_MS, hasPendingParse } from './codeSync'

/** The QASM tab's text store. */
export const useQasmText = codeTextStores.qasm

/** Parses QASM now and applies it (see codeSync.ts). */
export function applyQasm(text: string): void {
  applyCode('qasm', text)
}

/** Called by the editor on every user edit of the QASM text. */
export function editQasm(text: string): void {
  editCode('qasm', text)
}
