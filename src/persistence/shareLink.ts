// Shareable link: the whole circuit lives in the URL hash as `#c=<base64url(JSON)>`.
//
// The JSON uses a small, versioned compact format so links stay short:
//
//   { "v": 1,                       format version
//     "n": 2,                       number of qubits
//     "s": ["+", "0"],              initial states (omitted when every wire starts in |0⟩)
//     "o": [["H", 0, [0]],          operations: [gate, column, qubits, angle?]
//           ["RZ", 1, [1], 0.785],
//           ["CX", 2, [0, 1]]] }
//
// Decoding treats the hash as hostile: the length is checked before any work, the alphabet
// is strict, JSON.parse is guarded, unknown keys are rejected, and the expanded circuit
// goes through validateCircuit (the same schema as localStorage and files).
import { MAX_OPERATIONS, MAX_URL_BYTES, type Circuit } from '../model/types'
import { validateCircuit, type ValidationResult } from '../model/validate'
import { decodeBase64Url, encodeBase64Url } from './base64url'

export const SHARE_FORMAT_VERSION = 1
/** The hash prefix of a shared circuit. */
export const HASH_PREFIX = '#c='

type CompactOp = [gate: string, column: number, qubits: number[], angle?: number]

interface CompactCircuit {
  v: number
  n: number
  s?: string[]
  o: CompactOp[]
}

/** Circuit → compact JSON object (ids dropped: they are regenerated on load). */
export function toCompact(circuit: Circuit): CompactCircuit {
  const compact: CompactCircuit = {
    v: SHARE_FORMAT_VERSION,
    n: circuit.numQubits,
    o: [...circuit.operations]
      .sort((a, b) => a.column - b.column || a.qubits[0] - b.qubits[0])
      .map((op) =>
        op.angle === undefined
          ? [op.gate, op.column, [...op.qubits]]
          : [op.gate, op.column, [...op.qubits], op.angle],
      ),
  }
  if (circuit.initialStates.some((s) => s !== '0')) compact.s = [...circuit.initialStates]
  return compact
}

const ALLOWED_KEYS = new Set(['v', 'n', 's', 'o'])

/**
 * Untrusted compact value → the plain circuit shape validateCircuit expects, or an error.
 * Only checks the compact layer (keys, version, tuple shape); validateCircuit does the rest.
 */
function expandCompact(value: unknown): { circuit: unknown } | { error: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: 'Link does not contain a circuit.' }
  }
  const obj = value as Record<string, unknown>
  // Own keys only. JSON.parse makes "__proto__" an ordinary own key, so it lands here too.
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) return { error: 'Link contains unexpected fields.' }
  }
  if (obj.v !== SHARE_FORMAT_VERSION) {
    return { error: 'Link was made by a different version of the app.' }
  }
  const ops = obj.o
  if (!Array.isArray(ops)) return { error: 'Link does not contain a circuit.' }
  if (ops.length > MAX_OPERATIONS) {
    return { error: `Link has too many gates (${ops.length}); the limit is ${MAX_OPERATIONS}.` }
  }
  const operations: Record<string, unknown>[] = []
  for (const op of ops) {
    if (!Array.isArray(op) || op.length < 3 || op.length > 4) {
      return { error: 'Link contains a malformed gate.' }
    }
    const [gate, column, qubits, angle] = op as unknown[]
    operations.push(op.length === 4 ? { gate, column, qubits, angle } : { gate, column, qubits })
  }
  return {
    circuit: {
      numQubits: obj.n,
      ...(Object.hasOwn(obj, 's') ? { initialStates: obj.s } : {}),
      operations,
    },
  }
}

export type EncodeResult = { hash: string } | { error: string }

/** Circuit → `#c=…`, or an error when the link would exceed MAX_URL_BYTES. */
export function encodeCircuitHash(circuit: Circuit): EncodeResult {
  const hash = HASH_PREFIX + encodeBase64Url(JSON.stringify(toCompact(circuit)))
  if (hash.length > MAX_URL_BYTES) {
    const kb = (hash.length / 1024).toFixed(1)
    return {
      error: `This circuit is too large to share as a link (${kb} KB; the limit is ${MAX_URL_BYTES / 1024} KB).`,
    }
  }
  return { hash }
}

/** True if the hash looks like a shared circuit (`#c=…`), whether or not it is valid. */
export function isCircuitHash(hash: string): boolean {
  return hash.startsWith(HASH_PREFIX)
}

/**
 * `#c=…` → validated Circuit or a one-line error. Never throws.
 * Call only when `isCircuitHash(hash)` is true.
 */
export function decodeCircuitHash(hash: string): ValidationResult {
  try {
    // Size limit first, before decoding or parsing anything.
    if (hash.length > MAX_URL_BYTES) {
      return { error: `Link is too large (the limit is ${MAX_URL_BYTES / 1024} KB).` }
    }
    if (!isCircuitHash(hash)) return { error: 'Link does not contain a circuit.' }
    const json = decodeBase64Url(hash.slice(HASH_PREFIX.length))
    if (json === null) return { error: 'Link is damaged (not valid base64url).' }
    let parsed: unknown
    try {
      parsed = JSON.parse(json)
    } catch {
      return { error: 'Link is damaged (not valid JSON).' }
    }
    const expanded = expandCompact(parsed)
    if ('error' in expanded) return expanded
    const validated = validateCircuit(expanded.circuit)
    if ('error' in validated) return { error: `Link is not a valid circuit: ${validated.error}` }
    return validated
  } catch {
    return { error: 'Link is not a valid circuit.' }
  }
}

/** The full shareable URL for the current page (anything after '#' is replaced). */
export function shareUrl(hash: string, href: string): string {
  const hashAt = href.indexOf('#')
  return (hashAt === -1 ? href : href.slice(0, hashAt)) + hash
}
