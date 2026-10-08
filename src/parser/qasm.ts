// OpenQASM 2.0 → circuit model. Hand-written tokenizer + recursive-descent parser.
//
// Reads what the app itself writes, plus what real tools (e.g. Qiskit's qasm2.dumps) export:
//
//   OPENQASM 2.0;
//   include "qelib1.inc";
//   gate rot(theta) a { rz(theta) a; }      // custom gates: expanded inline at each call
//   qreg q[3];
//   creg c[3];                              // warning: classical bits are ignored
//   h q[0];
//   u3(pi/2,0,pi) q[1];                     // u/u1/u2/u3/p/sx/sxdg: drawn as rotations
//   cx q[0],q[1];
//   barrier q[0],q[1];                      // warning: ignored
//   measure q[0] -> c[0];                   // final measurement: warning, ignored
//
// Every problem carries a 1-based line/column range so the Problems tab and the Monaco
// squiggles point at the exact characters. After an error the parser skips to the next `;`
// and keeps going, so one pass reports as many problems as is reasonable.
//
// Security: the text may come from an uploaded file, so it is untrusted. Hard limits make
// hostile input fail fast: at most MAX_SOURCE_LENGTH characters, MAX_OPERATIONS gates,
// MAX_REPORTED_PROBLEMS problems, gate definitions nested MAX_GATE_DEPTH deep and
// MAX_EXPANSION_STEPS steps of expanding them. Angles go through the shared evaluator
// (model/angle.ts), never eval.
//
// Initial states (V2-2): gates between `// initial states` and `// end initial states` (right
// after the qreg) set the wires' start states instead of becoming operations; see prepBlock.ts.
//
// Auto-placement: written order = time order. Each gate is put in the first column after the
// last gate that touches any wire in its span, so independent gates share a column and
// dependent gates follow each other.
import { QASM_GATE_NAMES } from '../codegen/qasm'
import { evaluateAngle, QASM_PI_NAMES } from '../model/angle'
import { assignOperationIds } from '../model/circuit'
import {
  GATES,
  MAX_OPERATIONS,
  MAX_QUBITS,
  type Circuit,
  type GateType,
  type Operation,
  type InitialState,
  type Problem,
} from '../model/types'
import {
  commentSpan,
  findPrepBlock,
  isInPrepBlock,
  resolveInitialStates,
  type PrepCall,
  type PrepSyntax,
  type SourceComment,
  type Span,
} from './prepBlock'
import {
  FINAL_MEASUREMENT_MESSAGE,
  MAX_SOURCE_LENGTH,
  TOO_MANY_GATES_MESSAGE,
  gateAfterMeasurementMessage,
  tooLongMessage,
} from './messages'

export interface ParseOptions {
  /**
   * The circuit currently shown. Gates that are unchanged (same gate, qubits and angle, matched
   * in time order) keep their ids, so a gate selected on the canvas stays selected while typing.
   */
  previous?: Circuit
}

export interface ParseResult {
  /** The parsed circuit, or null if there is at least one error. Warnings don't block. */
  circuit: Circuit | null
  problems: Problem[]
}

// ---------------------------------------------------------------------------
// Gate names
// ---------------------------------------------------------------------------

/** QASM name → gate. `CX` is the OpenQASM 2.0 built-in CNOT, `cx` the qelib1.inc one. */
const GATE_BY_NAME: Record<string, GateType> = {
  ...Object.fromEntries(
    (Object.entries(QASM_GATE_NAMES) as [GateType, string][]).map(([gate, name]) => [name, gate]),
  ),
  CX: 'CX',
}

const SUPPORTED_NAMES = Object.values(QASM_GATE_NAMES)

/**
 * Real qelib1.inc gates that this app does not implement (yet). (u, u1, u2, u3, p, sx, sxdg
 * are read as rotations, see REWRITES.)
 */
const KNOWN_UNSUPPORTED = new Set([
  'u0',
  'cy',
  'ch',
  'crx',
  'cry',
  'crz',
  'cp',
  'cu',
  'cu1',
  'cu3',
  'csx',
  'cswap',
  'rxx',
  'rzz',
  'rccx',
  'rc3x',
  'c3x',
  'c3sqrtx',
  'c4x',
])

/** What each qubit argument means, used in arity messages. */
const ARGUMENT_HINT: Partial<Record<GateType, string>> = {
  CX: ' (control, target)',
  CZ: ' (control, target)',
  CCX: ' (control, control, target)',
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenKind = 'ident' | 'number' | 'string' | 'symbol'

interface Token {
  kind: TokenKind
  text: string
  /** Offsets into the source (end exclusive). */
  start: number
  end: number
  /** 1-based position of the first character. */
  line: number
  column: number
  /** 1-based column just past the last character (tokens never span lines). */
  endColumn: number
}

const IDENT_START = /[A-Za-z_π]/
const IDENT_PART = /[A-Za-z0-9_π]/
const NUMBER = /(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y
const SINGLE_SYMBOLS = new Set([';', ',', '[', ']', '(', ')', '{', '}', '+', '-', '*', '/', '^'])

/** Names used in the initial-states block messages. */
const QASM_PREP_SYNTAX: PrepSyntax = {
  beginMarker: '// initial states',
  endMarker: '// end initial states',
  gateName: (gate) => QASM_GATE_NAMES[gate],
  qubitName: (qubit) => `q[${qubit}]`,
}

/** Statements that are not gates (none of them may sit inside the initial states block). */
const NON_GATE_KEYWORDS = new Set([
  'OPENQASM',
  'include',
  'qreg',
  'creg',
  'measure',
  'reset',
  'if',
  'barrier',
  'gate',
  'opaque',
])

/** Line comments are collected into `comments` (only the initial-states markers use them). */
function tokenize(source: string, problems: Problem[], comments: SourceComment[] = []): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let lineStart = 0 // offset of the first character of the current line
  const col = (offset: number) => offset - lineStart + 1

  const push = (kind: TokenKind, start: number, end: number) =>
    tokens.push({
      kind,
      text: source.slice(start, end),
      start,
      end,
      line,
      column: col(start),
      endColumn: col(end),
    })

  while (i < source.length) {
    const ch = source[i]

    if (ch === '\n') {
      i += 1
      line += 1
      lineStart = i
      continue
    }
    if (/\s/.test(ch)) {
      i += 1
      continue
    }

    // Line comment: skip to the end of the line (but remember it for the block markers).
    if (ch === '/' && source[i + 1] === '/') {
      const start = i
      while (i < source.length && source[i] !== '\n') i += 1
      const text = source.slice(start, i).replace(/\r$/, '')
      comments.push({ text, line, column: col(start), endColumn: col(start + text.length) })
      continue
    }

    // Block comment: may span lines.
    if (ch === '/' && source[i + 1] === '*') {
      const startLine = line
      const startColumn = col(i)
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') {
          line += 1
          lineStart = i + 1
        }
        i += 1
      }
      if (i >= source.length) {
        problems.push({
          severity: 'error',
          message: "Unterminated comment: '/*' has no closing '*/'.",
          line: startLine,
          column: startColumn,
          endLine: startLine,
          endColumn: startColumn + 2,
        })
      } else {
        i += 2
      }
      continue
    }

    if (IDENT_START.test(ch)) {
      const start = i
      while (i < source.length && IDENT_PART.test(source[i])) i += 1
      push('ident', start, i)
      continue
    }

    NUMBER.lastIndex = i
    const number = NUMBER.exec(source)
    if (number) {
      push('number', i, i + number[0].length)
      i += number[0].length
      continue
    }

    if (ch === '"') {
      const start = i
      i += 1
      while (i < source.length && source[i] !== '"' && source[i] !== '\n') i += 1
      if (source[i] === '"') {
        i += 1
        push('string', start, i)
      } else {
        problems.push({
          severity: 'error',
          message: 'Unterminated string: missing closing ".',
          line,
          column: col(start),
          endLine: line,
          endColumn: col(i),
        })
        push('string', start, i)
      }
      continue
    }

    const two = source.slice(i, i + 2)
    if (two === '->' || two === '==') {
      push('symbol', i, i + 2)
      i += 2
      continue
    }
    if (SINGLE_SYMBOLS.has(ch)) {
      push('symbol', i, i + 1)
      i += 1
      continue
    }

    problems.push({
      severity: 'error',
      message: `Unexpected character '${ch}'.`,
      line,
      column: col(i),
      endLine: line,
      endColumn: col(i) + 1,
    })
    i += 1
  }
  return tokens
}

// ---------------------------------------------------------------------------
// Suggestions for unknown gate names
// ---------------------------------------------------------------------------

/** Edit distance (insert / delete / substitute = 1). Names are short, so O(a·b) is fine. */
function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost))
    }
    prev = row
  }
  return prev[b.length]
}

/** Closest supported gate name, or null if nothing is reasonably close. */
export function suggestGateName(name: string): string | null {
  const lower = name.toLowerCase()
  if (lower in GATE_BY_NAME) return lower
  const maxDistance = name.length <= 1 ? 0 : name.length <= 3 ? 1 : 2
  let best: string | null = null
  let bestDistance = Infinity
  for (const candidate of SUPPORTED_NAMES) {
    const d = levenshtein(lower, candidate)
    if (d < bestDistance) {
      best = candidate
      bestDistance = d
    }
  }
  return bestDistance <= maxDistance ? best : null
}

// ---------------------------------------------------------------------------
// Gates a statement can call
// ---------------------------------------------------------------------------

/**
 * Real-world single-qubit gates (qelib1.inc and Qiskit exports) that the app draws as its own
 * rotations. Each rewrite is exact up to a global phase e^{iα}: a global phase multiplies |ψ⟩
 * by a number of size 1, so ρ = |ψ⟩⟨ψ| — and every reduced ρ, Bloch vector and purity — is
 * unchanged. (No gate here is ever controlled, where the phase would matter.)
 *
 *   u3(θ,φ,λ) = U(θ,φ,λ) = u(θ,φ,λ) ≅ Rz(φ)·Ry(θ)·Rz(λ)   (time order: rz(λ), ry(θ), rz(φ))
 *   u2(φ,λ) = u3(π/2,φ,λ)
 *   u1(λ) = p(λ) = diag(1, e^{iλ}) ≅ Rz(λ)
 *   sx = √X ≅ Rx(π/2),  sxdg ≅ Rx(−π/2)
 */
interface Rewrite {
  params: number
  /** What the gate is drawn as, for the warning. */
  shownAs: string
  /** The app gates in time order; zero-angle rotations are dropped. */
  expand: (params: number[]) => [GateType, number][]
}

const u3 = ([theta, phi, lambda]: number[]): [GateType, number][] => [
  ['RZ', lambda],
  ['RY', theta],
  ['RZ', phi],
]

const REWRITES: Record<string, Rewrite> = {
  u3: { params: 3, shownAs: 'rz, ry, rz', expand: u3 },
  u: { params: 3, shownAs: 'rz, ry, rz', expand: u3 },
  U: { params: 3, shownAs: 'rz, ry, rz', expand: u3 },
  u2: {
    params: 2,
    shownAs: 'rz, ry, rz',
    expand: ([phi, lambda]) => u3([Math.PI / 2, phi, lambda]),
  },
  u1: { params: 1, shownAs: 'rz', expand: ([lambda]) => [['RZ', lambda]] },
  p: { params: 1, shownAs: 'rz', expand: ([lambda]) => [['RZ', lambda]] },
  sx: { params: 0, shownAs: 'rx(pi/2)', expand: () => [['RX', Math.PI / 2]] },
  sxdg: { params: 0, shownAs: 'rx(-pi/2)', expand: () => [['RX', -Math.PI / 2]] },
}

/** Deepest nesting of gate definitions (a gate whose body calls a gate whose body calls …). */
export const MAX_GATE_DEPTH = 16

/**
 * Most gate-body statements visited while expanding definitions. Ops are capped at
 * MAX_OPERATIONS anyway; this also stops gates that expand to nothing (empty bodies, zero
 * angles) from being repeated exponentially.
 */
export const MAX_EXPANSION_STEPS = 10 * MAX_OPERATIONS

/** Parsing stops after this many problems (e.g. a 10 000-line file of garbage). */
export const MAX_REPORTED_PROBLEMS = 200

/** Exact message for any OpenQASM 3.x file. */
export const QASM3_MESSAGE = 'OpenQASM 3.0 is not supported yet. Export as OpenQASM 2.0.'

/** A gate defined in the file with `gate name(params) qubits { body }`. */
interface GateDefinition {
  name: string
  /** Formal parameter names, e.g. ['theta']. */
  params: string[]
  /** Number of formal qubit arguments. */
  arity: number
  body: BodyCall[]
  /** 1 + the depth of the deepest defined gate its body calls. */
  depth: number
  /** The definition had errors (already reported): calls to it are skipped silently. */
  broken: boolean
}

/** What a gate name refers to. */
type Callee =
  | { kind: 'app'; gate: GateType }
  | { kind: 'rewrite'; name: string; rewrite: Rewrite }
  | { kind: 'defined'; def: GateDefinition }

/** One statement inside a gate body, resolved when the definition is read. */
interface BodyCall {
  callee: Callee
  /** Angle expressions as tokens; formal parameters are substituted when expanded. */
  params: Token[][]
  /** Indices into the definition's formal qubits. */
  qubits: number[]
}

/** Where a top-level gate statement is in the source: errors during its expansion point here. */
interface CallSite {
  name: Token
  last: Token
}

function calleeArity(callee: Callee): number {
  if (callee.kind === 'app') return GATES[callee.gate].arity
  if (callee.kind === 'rewrite') return 1
  return callee.def.arity
}

function calleeParamCount(callee: Callee): number {
  if (callee.kind === 'app') return GATES[callee.gate].parametric ? 1 : 0
  if (callee.kind === 'rewrite') return callee.rewrite.params
  return callee.def.params.length
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface QubitArg {
  register: string
  index: number
  first: Token
  last: Token
}

/** `name` or `name[index]` (measure accepts whole registers). */
interface RegisterRef {
  name: Token
  index: number | null
  last: Token
}

interface Register {
  name: string
  size: number
}

/** Ops as parsed (no ids yet). */
type ParsedOp = Omit<Operation, 'id'>

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function parseQasm(source: string, options: ParseOptions = {}): ParseResult {
  const problems: Problem[] = []

  // Hard size limit first: huge input is never even tokenized.
  if (source.length > MAX_SOURCE_LENGTH) {
    problems.push({
      severity: 'error',
      message: tooLongMessage(source.length),
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 2,
    })
    return { circuit: null, problems }
  }

  const comments: SourceComment[] = []
  const tokens = tokenize(source, problems, comments)

  // OpenQASM 3 looks similar but is a different language: say so once instead of reporting
  // every line of it.
  if (
    tokens[0]?.text === 'OPENQASM' &&
    tokens[1]?.kind === 'number' &&
    /^3(\.|$)/.test(tokens[1].text)
  ) {
    const [keyword, version] = tokens
    return {
      circuit: null,
      problems: [
        {
          severity: 'error',
          message: QASM3_MESSAGE,
          line: keyword.line,
          column: keyword.column,
          endLine: version.line,
          endColumn: version.endColumn,
        },
      ],
    }
  }

  let pos = 0
  let sawHeader = false
  let statementCount = 0
  // Held in an object because it is assigned inside nested functions (keeps TS narrowing honest).
  const state: { qreg: Register | null; stopped: boolean } = { qreg: null, stopped: false }
  const cregNames = new Set<string>()
  const ops: ParsedOp[] = []
  /** Gates defined in the file, by name (QASM 2: a gate must be defined before it is used). */
  const definitions = new Map<string, GateDefinition>()
  /** Rewritten gate names already explained by a warning (one warning per name). */
  const explainedRewrites = new Set<string>()
  /** Measured qubit → line of its first `measure`, for "gate after measurement" errors. */
  const measured = new Map<number, number>()
  /** Placement: per wire, the first column after the last gate that blocks it. */
  const nextFreeColumn = new Map<number, number>()
  let expansionSteps = 0

  // --- initial states block (V2-2) -------------------------------------------
  const errorAtSpan = (message: string, span: Span) =>
    problems.push({ severity: 'error', message, ...span })
  const prepBlock = findPrepBlock(comments, QASM_PREP_SYNTAX, errorAtSpan)
  /** Gates written inside the block: they set start states, they are not operations. */
  const prepCalls: PrepCall[] = []
  /** Line of the qreg declaration and of the first ordinary gate, for the "at the top" rule. */
  let qregLine: number | null = null
  let firstGateLine: number | null = null

  // --- token helpers ---------------------------------------------------------

  const peek = (): Token | undefined => tokens[pos]
  const next = (): Token | undefined => tokens[pos++]
  const isSymbol = (t: Token | undefined, text: string) => t?.kind === 'symbol' && t.text === text
  const lastToken = tokens[tokens.length - 1]

  // --- problem helpers -------------------------------------------------------

  function report(severity: Problem['severity'], message: string, from: Token, to: Token = from) {
    problems.push({
      severity,
      message,
      line: from.line,
      column: from.column,
      endLine: to.line,
      endColumn: to.endColumn,
    })
  }
  const error = (message: string, from: Token, to?: Token) => report('error', message, from, to)
  const warning = (message: string, from: Token, to?: Token) => report('warning', message, from, to)

  /** Error when the text ends in the middle of a statement: point just past the last token. */
  function errorAtEnd(message: string) {
    const t = lastToken
    problems.push({
      severity: 'error',
      message,
      line: t?.line ?? 1,
      column: t?.endColumn ?? 1,
      endLine: t?.line ?? 1,
      endColumn: (t?.endColumn ?? 1) + 1,
    })
  }

  /** True if any problem from index `from` on is an error. */
  const errorsSince = (from: number) => problems.slice(from).some((p) => p.severity === 'error')

  /** Fail fast on hostile input: after MAX_REPORTED_PROBLEMS problems, stop parsing. */
  function checkProblemLimit(): boolean {
    if (state.stopped) return true
    if (problems.length <= MAX_REPORTED_PROBLEMS) return false
    problems.splice(MAX_REPORTED_PROBLEMS)
    const t = tokens[Math.min(pos, tokens.length - 1)]
    error(`Stopped after ${MAX_REPORTED_PROBLEMS} problems: fix the ones above first.`, t)
    state.stopped = true
    return true
  }

  /** Error recovery: skip everything up to and including the next `;`. */
  function skipStatement() {
    while (pos < tokens.length) {
      if (isSymbol(next(), ';')) return
    }
  }

  /**
   * Expects the `;` that ends a statement. If it is missing, reports it just after `last`.
   * When the next token is already on a later line we assume the user simply forgot the `;`
   * and carry on with that token as a new statement (one error instead of two).
   */
  function endStatement(last: Token): boolean {
    const t = peek()
    if (isSymbol(t, ';')) {
      next()
      return true
    }
    problems.push({
      severity: 'error',
      message: "Missing ';' at the end of the statement.",
      line: last.line,
      column: last.endColumn,
      endLine: last.line,
      endColumn: last.endColumn + 1,
    })
    if (t && t.line > last.line) return false
    skipStatement()
    return false
  }

  /** Reads `name[index]`. Reports and returns null on malformed input (caller skips the statement). */
  function parseQubitArg(): QubitArg | null {
    const ref = parseRegisterRef('Expected a qubit like q[0].')
    if (!ref) return null
    if (ref.index === null) {
      error(
        `Use an indexed qubit like ${ref.name.text}[0]; whole-register arguments are not supported.`,
        ref.name,
      )
      return null
    }
    return { register: ref.name.text, index: ref.index, first: ref.name, last: ref.last }
  }

  /** Reads `name` or `name[index]`. Reports and returns null on malformed input. */
  function parseRegisterRef(expected: string): RegisterRef | null {
    const name = peek()
    if (!name) {
      errorAtEnd(expected)
      return null
    }
    if (name.kind !== 'ident') {
      error(`${expected.slice(0, -1)}, found '${name.text}'.`, name)
      return null
    }
    next()
    if (!isSymbol(peek(), '[')) return { name, index: null, last: name }
    next()
    const index = peek()
    if (!index || index.kind !== 'number' || !/^\d+$/.test(index.text)) {
      if (index) error('Qubit index must be a non-negative whole number.', index)
      else errorAtEnd('Expected a qubit index.')
      return null
    }
    next()
    const close = peek()
    if (!isSymbol(close, ']')) {
      if (close) error("Missing ']' after the qubit index.", close)
      else errorAtEnd("Missing ']' after the qubit index.")
      return null
    }
    next()
    return { name, index: Number(index.text), last: close as Token }
  }

  /**
   * Reads `( expr, expr, … )` starting at the `(`. Returns the expressions as token lists (split
   * at top-level commas) and the closing `)`, or null after reporting a missing `)`.
   * Stops at `;`, `{` or `}` so a missing `)` never swallows the rest of the file.
   */
  function readParams(): { groups: Token[][]; open: Token; close: Token } | null {
    const open = next() as Token
    const groups: Token[][] = [[]]
    let depth = 1
    while (pos < tokens.length) {
      const t = peek() as Token
      if (isSymbol(t, ';') || isSymbol(t, '{') || isSymbol(t, '}')) break
      next()
      if (isSymbol(t, '(')) depth += 1
      else if (isSymbol(t, ')')) {
        depth -= 1
        if (depth === 0) return { groups, open, close: t }
      } else if (isSymbol(t, ',') && depth === 1) {
        groups.push([])
        continue
      }
      groups[groups.length - 1].push(t)
    }
    error("Missing ')' after the angle.", open, tokens[pos - 1] ?? open)
    return null
  }

  /** Evaluates an angle written as tokens; `bindings` replaces gate-definition parameters. */
  function evaluateTokens(group: Token[], bindings?: Map<string, number>) {
    // Each parameter becomes its value in parentheses, so `-a` with a = −1 reads "-(-1)".
    const text = bindings
      ? group
          .map((t) =>
            t.kind === 'ident' && bindings.has(t.text) ? `(${bindings.get(t.text)})` : t.text,
          )
          .join(' ')
      : source.slice(group[0].start, group[group.length - 1].end)
    return evaluateAngle(text)
  }

  /** The message for a rejected angle expression. */
  function angleMessage(exprText: string, reason: string): string {
    return reason === 'Invalid angle expression.'
      ? `Invalid angle expression '${exprText}'. Use numbers, pi, + - * / and parentheses.`
      : reason
  }

  /** What a gate name refers to, or null if unknown. */
  function lookupCallee(name: string): Callee | null {
    if (Object.hasOwn(GATE_BY_NAME, name)) return { kind: 'app', gate: GATE_BY_NAME[name] }
    if (Object.hasOwn(REWRITES, name)) return { kind: 'rewrite', name, rewrite: REWRITES[name] }
    const def = definitions.get(name)
    return def ? { kind: 'defined', def } : null
  }

  /** Error message for a gate name that is not known here. */
  function unknownGateMessage(name: string): string {
    if (KNOWN_UNSUPPORTED.has(name))
      return `Gate '${name}' is not supported yet. Supported gates: ${SUPPORTED_NAMES.join(', ')}, and u, u1, u2, u3, p, sx, sxdg.`
    const suggestion = suggestGateName(name)
    const hint = suggestion
      ? suggestion.toLowerCase() === name.toLowerCase()
        ? ` Did you mean '${suggestion}'? Gate names are case-sensitive.`
        : ` Did you mean '${suggestion}'?`
      : ''
    return `Unknown gate '${name}'.${hint}`
  }

  /** One warning per rewritten gate name, explaining what the canvas shows instead. */
  function explainRewrite(callee: Callee, at: Token) {
    if (callee.kind !== 'rewrite' || explainedRewrites.has(callee.name)) return
    explainedRewrites.add(callee.name)
    warning(
      `'${callee.name}' is shown as ${callee.rewrite.shownAs}: the same gate up to a global ` +
        'phase, which does not change any density matrix.',
      at,
    )
  }

  /** Checks the number of angle parameters for a call. Returns false after reporting. */
  function checkParamCount(callee: Callee, name: Token, count: number, from: Token, to: Token) {
    const expected = calleeParamCount(callee)
    if (count === expected) return true
    if (callee.kind === 'app') {
      if (expected === 0) error(`'${name.text}' takes no angle parameter.`, from, to)
      else if (count === 0)
        error(`'${name.text}' needs an angle, e.g. ${name.text}(pi/2) q[0];`, from, to)
      else error(`'${name.text}' takes exactly one angle.`, from, to)
    } else {
      error(`'${name.text}' needs ${plural(expected, 'parameter')}, got ${count}.`, from, to)
    }
    return false
  }

  // --- turning calls into operations ------------------------------------------

  /**
   * Adds one app gate at a call site: checks measurement and the operation limit, then either
   * records it as a preparation gate (inside the initial states block) or places it.
   * Returns false when the caller must stop expanding.
   */
  function pushOp(gate: GateType, qubits: number[], angle: number | undefined, site: CallSite) {
    for (const q of qubits) {
      const line = measured.get(q)
      if (line !== undefined) {
        const label = `${state.qreg?.name ?? 'q'}[${q}]`
        error(gateAfterMeasurementMessage(label, line), site.name, site.last)
        return false
      }
    }
    if (isInPrepBlock(prepBlock, site.name.line)) {
      // A preparation gate: it only says which state the wire starts in (checked below).
      prepCalls.push({
        gate,
        qubits,
        span: {
          line: site.name.line,
          column: site.name.column,
          endLine: site.last.line,
          endColumn: site.last.endColumn,
        },
      })
      return true
    }
    firstGateLine ??= site.name.line
    if (ops.length >= MAX_OPERATIONS) {
      error(TOO_MANY_GATES_MESSAGE, site.name, site.last)
      state.stopped = true
      return false
    }
    // Auto-placement: the first column after the last gate on any wire in this gate's span
    // (a multi-qubit gate blocks every wire between its lowest and highest qubit). Keeping
    // the next free column per wire makes this O(span) per gate instead of O(gates so far).
    const low = Math.min(...qubits)
    const high = Math.max(...qubits)
    let column = 0
    for (let w = low; w <= high; w++) column = Math.max(column, nextFreeColumn.get(w) ?? 0)
    for (let w = low; w <= high; w++) nextFreeColumn.set(w, column + 1)
    ops.push({ gate, column, qubits, ...(angle === undefined ? {} : { angle }) })
    return true
  }

  /**
   * Expands a call into app gates: app gates directly, rewrites into rotations, defined gates
   * by expanding their body with the parameters and qubits substituted.
   * Returns false when the caller must stop (an error was reported).
   */
  function emit(callee: Callee, params: number[], qubits: number[], site: CallSite): boolean {
    if (callee.kind === 'app') return pushOp(callee.gate, qubits, params[0], site)
    if (callee.kind === 'rewrite') {
      for (const [gate, angle] of callee.rewrite.expand(params)) {
        if (angle === 0) continue
        if (!pushOp(gate, qubits, angle, site)) return false
      }
      return true
    }
    const def = callee.def
    if (def.broken) return true // its errors are already reported
    const bindings = new Map(def.params.map((name, i) => [name, params[i]]))
    for (const call of def.body) {
      expansionSteps += 1
      if (expansionSteps > MAX_EXPANSION_STEPS) {
        error(
          `Gate definitions expand to too many steps (over ${MAX_EXPANSION_STEPS}).`,
          site.name,
          site.last,
        )
        state.stopped = true
        return false
      }
      const values: number[] = []
      for (const group of call.params) {
        const result = evaluateTokens(group, bindings)
        if ('error' in result) {
          error(`In gate '${def.name}': ${result.error}`, site.name, site.last)
          return false
        }
        values.push(result.value)
      }
      const actual = call.qubits.map((i) => qubits[i])
      if (!emit(call.callee, values, actual, site)) return false
    }
    return true
  }

  // --- statements ------------------------------------------------------------

  function parseHeader(keyword: Token) {
    next()
    const version = peek()
    if (!version || version.kind !== 'number') {
      error("Expected a version number: 'OPENQASM 2.0;'.", keyword, version ?? keyword)
      skipStatement()
      return
    }
    next()
    if (statementCount > 0 || sawHeader) {
      error("'OPENQASM 2.0;' must be the first statement, and appear only once.", keyword, version)
    } else if (Number(version.text) !== 2) {
      error(`Only OpenQASM 2.0 is supported (found version ${version.text}).`, version)
    }
    sawHeader = true
    endStatement(version)
  }

  function parseInclude(keyword: Token) {
    next()
    const file = peek()
    if (!file || file.kind !== 'string') {
      error('Expected a file name in quotes: include "qelib1.inc";', keyword, file ?? keyword)
      skipStatement()
      return
    }
    next()
    if (file.text !== '"qelib1.inc"') {
      warning(`Only "qelib1.inc" is supported; ${file.text} is ignored.`, keyword, file)
    }
    endStatement(file)
  }

  /** `qreg name[n];` or `creg name[n];` → name, size and last token, or null after reporting. */
  function parseRegisterDecl(keyword: Token): { register: Register; last: Token } | null {
    next()
    const name = peek()
    if (!name || name.kind !== 'ident') {
      error(`Expected a register name: ${keyword.text} q[2];`, keyword, name ?? keyword)
      skipStatement()
      return null
    }
    next()
    const open = peek()
    const size = tokens[pos + 1]
    const close = tokens[pos + 2]
    if (
      !isSymbol(open, '[') ||
      !size ||
      size.kind !== 'number' ||
      !/^\d+$/.test(size.text) ||
      !isSymbol(close, ']')
    ) {
      error(`Expected a size in brackets: ${keyword.text} ${name.text}[2];`, keyword, name)
      skipStatement()
      return null
    }
    pos += 3
    return { register: { name: name.text, size: Number(size.text) }, last: close }
  }

  function parseQreg(keyword: Token) {
    const decl = parseRegisterDecl(keyword)
    if (!decl) return
    qregLine ??= keyword.line
    const { register, last } = decl
    const existing = state.qreg
    if (existing) {
      error(
        `Only one qreg is supported (already declared ${existing.name}[${existing.size}]).`,
        keyword,
        last,
      )
    } else {
      if (register.size < 1) {
        error('A quantum register needs at least 1 qubit.', keyword, last)
      } else if (register.size > MAX_QUBITS) {
        error(
          `This app shows at most ${MAX_QUBITS} qubits (a teaching cap: beyond that the ` +
            `density matrices and trace steps become unreadable). Use ${register.name}[${MAX_QUBITS}] or fewer.`,
          keyword,
          last,
        )
      }
      // Remember the declared size even if too large, so later range checks stay meaningful.
      state.qreg = register
    }
    endStatement(last)
  }

  function parseCreg(keyword: Token) {
    const decl = parseRegisterDecl(keyword)
    if (!decl) return
    cregNames.add(decl.register.name)
    warning(
      `Classical register ${decl.register.name} is ignored: measurement results are not part of this app.`,
      keyword,
      decl.last,
    )
    endStatement(decl.last)
  }

  /**
   * `measure q[0] -> c[0];` or `measure q -> c;`. Measurements at the end are ignored with a
   * warning (the spheres show the state just before measuring); a later gate on a measured
   * qubit is an error, reported at that gate (see pushOp).
   */
  function parseMeasure(keyword: Token) {
    next()
    const errorsBefore = problems.length
    const qubit = parseRegisterRef('Expected a qubit like q[0].')
    if (!qubit) return skipStatement()
    if (!isSymbol(peek(), '->')) {
      error("Expected '->' and a classical bit: measure q[0] -> c[0];", keyword, qubit.last)
      return skipStatement()
    }
    next()
    const bit = parseRegisterRef('Expected a classical bit like c[0].')
    if (!bit) return skipStatement()
    endStatement(bit.last)

    const qreg = state.qreg
    if (!qreg || qubit.name.text !== qreg.name) {
      error(`Unknown quantum register '${qubit.name.text}'.`, qubit.name, qubit.last)
    } else if (qubit.index !== null && qubit.index >= qreg.size) {
      error(
        `Qubit ${qreg.name}[${qubit.index}] is out of range: ${qreg.name}[${qreg.size}] has ` +
          `indices 0 to ${qreg.size - 1}.`,
        qubit.name,
        qubit.last,
      )
    }
    if (!cregNames.has(bit.name.text)) {
      error(
        `Unknown classical register '${bit.name.text}'. Declare it first, e.g. creg ${bit.name.text}[1];`,
        bit.name,
        bit.last,
      )
    }
    if (errorsSince(errorsBefore) || !qreg || qreg.size > MAX_QUBITS) return

    const qubits =
      qubit.index === null ? Array.from({ length: qreg.size }, (_, q) => q) : [qubit.index]
    for (const q of qubits) if (!measured.has(q)) measured.set(q, keyword.line)
    warning(FINAL_MEASUREMENT_MESSAGE, keyword, bit.last)
  }

  /** Statement types we recognise but don't support: report and skip to `;`. */
  function unsupportedStatement(keyword: Token, message: string, severity: Problem['severity']) {
    skipStatement()
    // Underline the statement up to (not including) its `;`.
    const end = tokens[pos - 1]
    const last = end && isSymbol(end, ';') && end !== keyword ? tokens[pos - 2] : end
    report(severity, message, keyword, last ?? keyword)
  }

  /** Skips to just past the next `}` (error recovery inside a gate definition). */
  function skipDefinition() {
    while (pos < tokens.length) {
      if (isSymbol(next(), '}')) return
    }
  }

  /** Reads `a, b, c` (identifiers) up to a token that is not a comma-separated identifier. */
  function readIdentifiers(what: string): Token[] | null {
    const names: Token[] = []
    for (;;) {
      const t = peek()
      if (!t || t.kind !== 'ident') {
        if (t) error(`Expected ${what}, found '${t.text}'.`, t)
        else errorAtEnd(`Expected ${what}.`)
        return null
      }
      next()
      names.push(t)
      if (!isSymbol(peek(), ',')) return names
      next()
    }
  }

  /** Reports the first repeated name in a list (formal parameters / qubits must be distinct). */
  function checkDistinct(names: Token[], what: string): boolean {
    const seen = new Set<string>()
    for (const n of names) {
      if (seen.has(n.text)) {
        error(`${what} '${n.text}' is listed twice.`, n)
        return false
      }
      seen.add(n.text)
    }
    return true
  }

  /**
   * `gate name(p1, p2) a, b { body }`: the definition is checked now and expanded inline at
   * every call. A gate may only call gates defined before it (as in OpenQASM 2.0), so a
   * definition can never call itself, directly or through another gate.
   */
  function parseGateDefinition(keyword: Token) {
    next()
    const nameToken = peek()
    if (!nameToken || nameToken.kind !== 'ident') {
      if (nameToken)
        error(`Expected a gate name after 'gate', found '${nameToken.text}'.`, nameToken)
      else errorAtEnd("Expected a gate name after 'gate'.")
      return skipDefinition()
    }
    next()
    const name = nameToken.text
    const errorsBefore = problems.length

    // A file may carry its own copy of a built-in definition (e.g. qelib1.inc pasted in):
    // the built-in gate is used instead.
    const builtIn = Object.hasOwn(GATE_BY_NAME, name) || Object.hasOwn(REWRITES, name)
    if (builtIn) {
      warning(`Definition of '${name}' is ignored: the built-in gate is used.`, keyword, nameToken)
    } else if (definitions.has(name)) {
      error(`Gate '${name}' is already defined.`, keyword, nameToken)
    }

    // --- header: (params) and qubits ---
    let params: Token[] = []
    if (isSymbol(peek(), '(')) {
      next()
      if (!isSymbol(peek(), ')')) {
        const read = readIdentifiers('a parameter name')
        if (!read) return skipDefinition()
        params = read
      }
      if (!isSymbol(peek(), ')')) {
        error("Missing ')' after the gate parameters.", peek() ?? nameToken)
        return skipDefinition()
      }
      next()
    }
    const formals = readIdentifiers('a qubit name')
    if (!formals) return skipDefinition()
    checkDistinct(params, 'Parameter')
    checkDistinct(formals, 'Qubit')
    if (!isSymbol(peek(), '{')) {
      error(`Expected '{' to start the body of gate '${name}'.`, peek() ?? nameToken)
      return skipDefinition()
    }
    next()

    // --- body ---
    const paramNames = params.map((p) => p.text)
    const formalIndex = new Map(formals.map((f, i) => [f.text, i]))
    const body: BodyCall[] = []
    let depth = 1
    for (;;) {
      if (checkProblemLimit()) return
      const t = peek()
      if (!t) {
        errorAtEnd(`Missing '}' at the end of gate '${name}'.`)
        break
      }
      if (isSymbol(t, '}')) {
        next()
        break
      }
      const call = parseBodyStatement(name, paramNames, formalIndex)
      if (call) {
        body.push(call)
        if (call.callee.kind === 'defined') depth = Math.max(depth, call.callee.def.depth + 1)
      }
    }

    // A body that calls a broken gate is broken too; its error was reported at that gate.
    const callsBroken = body.some((c) => c.callee.kind === 'defined' && c.callee.def.broken)
    if (depth > MAX_GATE_DEPTH && !callsBroken) {
      error(
        `Gate '${name}' is nested too deeply: definitions may call each other at most ` +
          `${MAX_GATE_DEPTH} levels deep.`,
        keyword,
        nameToken,
      )
    }
    if (builtIn || definitions.has(name)) return
    const broken = callsBroken || errorsSince(errorsBefore)
    definitions.set(name, {
      name,
      params: paramNames,
      arity: formals.length,
      body,
      depth,
      broken,
    })
  }

  /** One statement inside a gate body: `name(exprs) a, b;` or `barrier a, b;`. */
  function parseBodyStatement(
    defName: string,
    paramNames: string[],
    formalIndex: Map<string, number>,
  ): BodyCall | null {
    const nameToken = next() as Token
    if (nameToken.kind !== 'ident') {
      error(`Unexpected '${nameToken.text}' in the body of gate '${defName}'.`, nameToken)
      skipBodyStatement()
      return null
    }
    if (nameToken.text === 'barrier') {
      skipBodyStatement()
      return null
    }
    const errorsBefore = problems.length
    let callee: Callee | null = null
    if (nameToken.text === defName) {
      error(
        `Gate '${defName}' calls itself: a gate cannot be defined in terms of itself.`,
        nameToken,
      )
    } else {
      callee = lookupCallee(nameToken.text)
      if (!callee) {
        const known = KNOWN_UNSUPPORTED.has(nameToken.text) || suggestGateName(nameToken.text)
        error(
          known
            ? unknownGateMessage(nameToken.text)
            : `Unknown gate '${nameToken.text}' in the definition of '${defName}'. ` +
                'A gate must be defined before it is used.',
          nameToken,
        )
      }
    }

    // (params): each may use the definition's parameters and pi.
    let groups: Token[][] = []
    let last = nameToken
    if (isSymbol(peek(), '(')) {
      const read = readParams()
      if (!read) {
        skipBodyStatement()
        return null
      }
      groups = read.groups.length === 1 && read.groups[0].length === 0 ? [] : read.groups
      last = read.close
      for (const group of groups) {
        if (group.length === 0) {
          error('Empty parameter.', read.open, read.close)
          continue
        }
        const unknown = group.find(
          (t) =>
            t.kind === 'ident' && !paramNames.includes(t.text) && !QASM_PI_NAMES.includes(t.text),
        )
        if (unknown) {
          error(`Unknown parameter '${unknown.text}' in gate '${defName}'.`, unknown)
          continue
        }
        // Syntax check now (every parameter = 1), so mistakes are underlined where they are.
        const trial = evaluateTokens(group, new Map(paramNames.map((p) => [p, 1])))
        if ('error' in trial && trial.error !== 'Angle is not a finite number.') {
          const text = source.slice(group[0].start, group[group.length - 1].end)
          error(angleMessage(text, trial.error), group[0], group[group.length - 1])
        }
      }
    }

    const qubitTokens = isSymbol(peek(), ';') ? [] : readIdentifiers('a qubit name')
    if (!qubitTokens) {
      skipBodyStatement()
      return null
    }
    if (qubitTokens.length > 0) last = qubitTokens[qubitTokens.length - 1]
    if (!isSymbol(peek(), ';')) {
      error("Missing ';' at the end of the statement.", last)
      skipBodyStatement()
      return null
    }
    next()

    const qubits: number[] = []
    for (const q of qubitTokens) {
      const index = formalIndex.get(q.text)
      if (index === undefined) error(`'${q.text}' is not a qubit of gate '${defName}'.`, q)
      else qubits.push(index)
    }
    checkDistinct(qubitTokens, 'Qubit')
    if (callee) {
      checkParamCount(callee, nameToken, groups.length, nameToken, last)
      const arity = calleeArity(callee)
      if (qubitTokens.length !== arity) {
        error(
          `'${nameToken.text}' needs ${plural(arity, 'qubit')}, got ${qubitTokens.length}.`,
          nameToken,
          last,
        )
      }
      explainRewrite(callee, nameToken)
    }
    if (!callee || errorsSince(errorsBefore)) return null
    return { callee, params: groups, qubits }
  }

  /** Error recovery inside a body: skip to just past `;`, or stop before `}`. */
  function skipBodyStatement() {
    while (pos < tokens.length) {
      const t = peek()
      if (isSymbol(t, '}')) return
      next()
      if (isSymbol(t, ';')) return
    }
  }

  /** `opaque name(params) qubits;` has no body, so it cannot be simulated. */
  function parseOpaque(keyword: Token) {
    const name = tokens[pos + 1]
    unsupportedStatement(
      keyword,
      `Opaque gate${name?.kind === 'ident' ? ` '${name.text}'` : ''} has no definition, so it ` +
        'cannot be simulated.',
      'error',
    )
  }

  function parseGate(nameToken: Token) {
    next()
    const errorsBefore = problems.length
    const callee = lookupCallee(nameToken.text)

    if (callee === null) {
      error(unknownGateMessage(nameToken.text), nameToken)
      skipStatement()
      return
    }
    let last = nameToken

    // --- optional `(angles)` ---
    const angles: number[] = []
    if (isSymbol(peek(), '(')) {
      const read = readParams()
      if (!read) {
        skipStatement()
        return
      }
      last = read.close
      const groups = read.groups.length === 1 && read.groups[0].length === 0 ? [] : read.groups
      if (checkParamCount(callee, nameToken, groups.length, read.open, read.close)) {
        for (const group of groups) {
          if (group.length === 0) {
            error('Empty parameter.', read.open, read.close)
            continue
          }
          const text = source.slice(group[0].start, group[group.length - 1].end)
          const result = evaluateTokens(group)
          if ('error' in result) {
            error(angleMessage(text, result.error), group[0], group[group.length - 1])
          } else {
            angles.push(result.value)
          }
        }
      }
    } else {
      checkParamCount(callee, nameToken, 0, nameToken, nameToken)
    }

    // --- qubit arguments ---
    const args: QubitArg[] = []
    if (!isSymbol(peek(), ';')) {
      for (;;) {
        const arg = parseQubitArg()
        if (!arg) {
          skipStatement()
          return
        }
        args.push(arg)
        last = arg.last
        if (!isSymbol(peek(), ',')) break
        next()
      }
    }
    endStatement(last)

    // --- semantic checks ---
    const arity = calleeArity(callee)
    if (args.length !== arity) {
      const from = args[0]?.first ?? nameToken
      const to = args[args.length - 1]?.last ?? last
      const hint = callee.kind === 'app' ? (ARGUMENT_HINT[callee.gate] ?? '') : ''
      error(
        `'${nameToken.text}' needs ${plural(arity, 'qubit')}${hint}, got ${args.length}.`,
        from,
        to,
      )
    }
    const qreg = state.qreg
    args.forEach((arg, i) => {
      const label = `${arg.register}[${arg.index}]`
      if (!qreg || arg.register !== qreg.name) {
        let message = `Unknown register '${arg.register}'.`
        if (cregNames.has(arg.register))
          message = `'${arg.register}' is a classical register; gates act on qubits.`
        else if (qreg) message += ` Did you mean '${qreg.name}'?`
        else message += ` Declare it first, e.g. qreg ${arg.register}[2];`
        error(message, arg.first, arg.last)
        return
      }
      if (arg.index >= qreg.size) {
        error(
          `Qubit ${label} is out of range: ${qreg.name}[${qreg.size}] has indices 0 to ${qreg.size - 1}.`,
          arg.first,
          arg.last,
        )
        return
      }
      if (args.slice(0, i).some((a) => a.register === arg.register && a.index === arg.index)) {
        error(
          `'${nameToken.text}' uses ${label} more than once; qubits must be distinct.`,
          arg.first,
          arg.last,
        )
      }
    })
    explainRewrite(callee, nameToken)

    // Only well-formed calls on a register within the cap become gates.
    if (errorsSince(errorsBefore) || !qreg || qreg.size > MAX_QUBITS) return
    emit(
      callee,
      angles,
      args.map((a) => a.index),
      { name: nameToken, last },
    )
  }

  // --- main loop --------------------------------------------------------------

  while (pos < tokens.length && !checkProblemLimit()) {
    const t = peek() as Token
    if (isSymbol(t, ';')) {
      next() // empty statement
      continue
    }
    if (!sawHeader && statementCount === 0 && t.text !== 'OPENQASM') {
      error("Missing header: the program must start with 'OPENQASM 2.0;'.", t)
      sawHeader = true // report once
    }
    if (t.kind === 'ident' && NON_GATE_KEYWORDS.has(t.text) && isInPrepBlock(prepBlock, t.line)) {
      error(
        `'${t.text}' cannot appear inside the initial states block: only preparation gates ` +
          '(x, h, s, sdg) go between the markers.',
        t,
      )
    }
    if (t.kind !== 'ident') {
      error(`Unexpected '${t.text}': expected a statement such as h q[0];`, t)
      skipStatement()
      statementCount += 1
      continue
    }
    switch (t.text) {
      case 'OPENQASM':
        parseHeader(t)
        break
      case 'include':
        parseInclude(t)
        break
      case 'qreg':
        parseQreg(t)
        break
      case 'creg':
        parseCreg(t)
        break
      case 'measure':
        parseMeasure(t)
        break
      case 'reset':
        unsupportedStatement(
          t,
          "'reset' is not supported: it is a measurement-like operation.",
          'error',
        )
        break
      case 'if':
        unsupportedStatement(t, "'if' is not supported (it needs measurement results).", 'error')
        break
      case 'barrier':
        unsupportedStatement(t, "'barrier' is ignored: it has no effect on the state.", 'warning')
        break
      case 'gate':
        parseGateDefinition(t)
        break
      case 'opaque':
        parseOpaque(t)
        break
      default:
        parseGate(t)
    }
    statementCount += 1
  }

  if (state.stopped) return { circuit: null, problems }

  if (tokens.length === 0) {
    problems.push({
      severity: 'error',
      message: "Empty program: start with 'OPENQASM 2.0;' and a register like 'qreg q[2];'.",
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 1,
    })
  } else if (!state.qreg) {
    const first = tokens[0]
    error("Missing quantum register: declare one, e.g. 'qreg q[2];'.", first)
  }

  // The block must sit at the top: after the register, before every ordinary gate.
  const qreg = state.qreg
  let initialStates: InitialState[] = []
  if (prepBlock) {
    const at = commentSpan(prepBlock.begin)
    if (qregLine === null || qregLine >= prepBlock.begin.line) {
      errorAtSpan(
        'The initial states block must come right after the register declaration (qreg q[n];).',
        at,
      )
    } else if (firstGateLine !== null && firstGateLine < prepBlock.begin.line) {
      errorAtSpan(
        `The initial states block must come before the first gate (line ${firstGateLine}), ` +
          'right after the register declaration.',
        at,
      )
    }
  }
  // A too-large register was already reported; don't build a huge state list for it.
  if (qreg && qreg.size <= MAX_QUBITS) {
    initialStates = resolveInitialStates(prepCalls, qreg.size, QASM_PREP_SYNTAX, errorAtSpan)
  }

  const hasError = problems.some((p) => p.severity === 'error')
  if (hasError || !qreg) return { circuit: null, problems }
  return {
    circuit: {
      numQubits: qreg.size,
      initialStates,
      operations: assignOperationIds(ops, options.previous),
    },
    problems,
  }
}

// Kept here for existing imports; the implementation lives with the model helpers.
export { circuitsEqual } from '../model/circuit'
