// The "initial states" block, shared by the QASM and Qiskit parsers (PLAN.md → V2-2).
//
//   qreg q[2];                 qc = QuantumCircuit(2)
//   // initial states          # initial states
//   x q[0];                    qc.x(0)
//   h q[0];                    qc.h(0)
//   // end initial states      # end initial states
//
// The marker comments are the one place where comments matter: gates between them are read as
// "this wire starts in state …" (→ `Circuit.initialStates`), not as circuit operations. Without
// the markers the very same gates are ordinary operations on the canvas.
//
// Each parser does the language-specific part (finding comments, parsing the gate lines,
// checking the block sits right after the register) and hands the rest to this module:
//  - `findPrepBlock`: pairs up the begin/end markers and reports misplaced ones;
//  - `resolveInitialStates`: turns the gates inside the block into one start state per qubit,
//    or reports why they are not a valid preparation.
import {
  PREP_BLOCK_BEGIN,
  PREP_BLOCK_END,
  PREP_GATES,
  PREP_SEQUENCES,
  stateForSequence,
} from '../codegen/prep'
import {
  DEFAULT_INITIAL_STATE,
  type GateType,
  type InitialState,
  type Problem,
} from '../model/types'

/** A 1-based source range. */
export interface Span {
  line: number
  column: number
  endLine: number
  endColumn: number
}

/** A line comment as the tokenizer saw it, including its `//` or `#`. */
export interface SourceComment {
  text: string
  line: number
  column: number
  endColumn: number
}

/** A matched pair of markers. Gates on the lines strictly between them are preparation gates. */
export interface PrepBlock {
  begin: SourceComment
  end: SourceComment
}

/** One gate written inside the block (already parsed and range-checked by the parser). */
export interface PrepCall {
  gate: GateType
  qubits: number[]
  span: Span
}

/** How a language writes things, for the messages. */
export interface PrepSyntax {
  /** e.g. `// initial states` / `# initial states` */
  beginMarker: string
  endMarker: string
  gateName: (gate: GateType) => string
  qubitName: (qubit: number) => string
}

export type ReportProblem = (message: string, span: Span) => void

/** 'begin' / 'end' if the comment is a block marker. Case and extra spaces don't matter. */
export function markerKind(commentText: string): 'begin' | 'end' | null {
  const body = commentText
    .replace(/^(\/\/|#)/, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
  if (body === PREP_BLOCK_BEGIN) return 'begin'
  if (body === PREP_BLOCK_END) return 'end'
  return null
}

export function commentSpan(comment: SourceComment): Span {
  return {
    line: comment.line,
    column: comment.column,
    endLine: comment.line,
    endColumn: comment.endColumn,
  }
}

/**
 * Finds the block. Reports an `end` marker without a `begin`, a second `begin` before the
 * `end`, a second block, and a block that never ends. Returns the first complete block, or null.
 */
export function findPrepBlock(
  comments: readonly SourceComment[],
  syntax: PrepSyntax,
  error: ReportProblem,
): PrepBlock | null {
  let open: SourceComment | null = null
  let block: PrepBlock | null = null
  for (const comment of comments) {
    const kind = markerKind(comment.text)
    if (kind === 'begin') {
      if (open) {
        error(
          `'${syntax.beginMarker}' again before '${syntax.endMarker}': close the first block first.`,
          commentSpan(comment),
        )
      } else if (block) {
        error(
          `Only one initial states block is allowed (the first one is on line ${block.begin.line}).`,
          commentSpan(comment),
        )
      } else {
        open = comment
      }
    } else if (kind === 'end') {
      if (open) {
        block = { begin: open, end: comment }
        open = null
      } else {
        error(
          `'${syntax.endMarker}' has no matching '${syntax.beginMarker}' before it.`,
          commentSpan(comment),
        )
      }
    }
  }
  if (open) {
    error(
      `Unterminated initial states block: add '${syntax.endMarker}' after the preparation gates.`,
      commentSpan(open),
    )
  }
  return block
}

/** True if `line` lies strictly between the two markers. */
export function isInPrepBlock(block: PrepBlock | null, line: number): boolean {
  return block !== null && line > block.begin.line && line < block.end.line
}

/** The accepted sequences, written out for error messages: "x (|1⟩), h (|+⟩), …". */
function sequencesHint(syntax: PrepSyntax): string {
  const ket: Record<InitialState, string> = {
    '0': '|0⟩',
    '1': '|1⟩',
    '+': '|+⟩',
    '-': '|−⟩',
    i: '|i⟩',
    '-i': '|−i⟩',
  }
  return (Object.entries(PREP_SEQUENCES) as [InitialState, readonly GateType[]][])
    .filter(([, gates]) => gates.length > 0)
    .map(([state, gates]) => `${gates.map(syntax.gateName).join(' then ')} (${ket[state]})`)
    .join(', ')
}

/** True if the gates are two or more complete preparation sequences back to back. */
function isSeveralSequences(gates: readonly GateType[]): boolean {
  // splits[k] = the first k gates can be cut into complete sequences (each 1 or 2 gates long).
  // A plain loop, not recursion: the block may be long on hostile input.
  const splits = [true]
  for (let k = 1; k <= gates.length; k++) {
    splits[k] =
      (splits[k - 1] && stateForSequence(gates.slice(k - 1, k)) !== null) ||
      (k >= 2 && splits[k - 2] && stateForSequence(gates.slice(k - 2, k)) !== null)
  }
  return gates.length >= 2 && splits[gates.length]
}

/**
 * The start state of every wire, from the gates inside the block. A wire with no gates starts in
 * |0⟩. Gates on different qubits commute, so each qubit's gates are collected in written order
 * even when they are interleaved with other qubits' gates. Problems are reported through `error`;
 * the result is only meaningful when nothing was reported.
 */
export function resolveInitialStates(
  calls: readonly PrepCall[],
  numQubits: number,
  syntax: PrepSyntax,
  error: ReportProblem,
): InitialState[] {
  const perQubit = new Map<number, PrepCall[]>()
  for (const call of calls) {
    const name = syntax.gateName(call.gate)
    if (call.qubits.length !== 1) {
      error(
        `'${name}' acts on ${call.qubits.length} qubits: the initial states block may only ` +
          'prepare single qubits. Move it below the block to make it part of the circuit.',
        call.span,
      )
      continue
    }
    if (!PREP_GATES.has(call.gate)) {
      error(
        `'${name}' is not a preparation gate. Inside the initial states block use: ${sequencesHint(syntax)}.`,
        call.span,
      )
      continue
    }
    const q = call.qubits[0]
    if (q < 0 || q >= numQubits) continue // already reported by the parser
    perQubit.set(q, [...(perQubit.get(q) ?? []), call])
  }

  const states: InitialState[] = Array.from({ length: numQubits }, () => DEFAULT_INITIAL_STATE)
  for (const [q, qubitCalls] of perQubit) {
    const gates = qubitCalls.map((c) => c.gate)
    const state = stateForSequence(gates)
    if (state !== null) {
      states[q] = state
      continue
    }
    const first = qubitCalls[0].span
    const last = qubitCalls[qubitCalls.length - 1].span
    const span: Span = {
      line: first.line,
      column: first.column,
      endLine: last.endLine,
      endColumn: last.endColumn,
    }
    const written = gates.map(syntax.gateName).join(', ')
    error(
      isSeveralSequences(gates)
        ? `${syntax.qubitName(q)} is prepared more than once (${written}). Each qubit gets one ` +
            `preparation: ${sequencesHint(syntax)}.`
        : `${written} on ${syntax.qubitName(q)} is not a preparation sequence. ` +
            `Use: ${sequencesHint(syntax)}.`,
      span,
    )
  }
  return states
}

/** Problem helper: an error with this span (and an optional tab). */
export function problemAt(message: string, span: Span, tab?: Problem['tab']): Problem {
  return { severity: 'error', message, ...(tab ? { tab } : {}), ...span }
}
