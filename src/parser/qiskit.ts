// Qiskit Python (straight-line subset) → circuit model. Python is NEVER executed: this is a
// hand-written tokenizer plus a statement parser that only understands a small, flat subset.
//
// Supported program shape (exactly what the app itself writes, plus comments/whitespace):
//
//   from math import pi
//   from qiskit import QuantumCircuit
//
//   qc = QuantumCircuit(2)        # any variable name; QuantumCircuit(n, m) also accepted
//   qc.h(0)
//   qc.rx(pi/2, 1)                # angles: numbers, pi / np.pi / math.pi, + - * /, ( )
//   qc.h([0, 1])                  # a list applies a single-qubit gate to each qubit
//   qc.cx(control_qubit=0, target_qubit=1)
//
//   state = Statevector(qc)       # "analysis tail": other top-level code is ignored
//
// Rules (PLAN.md → V2-1):
//  - Only top-level lines that call a method on the circuit variable change the circuit.
//  - Other top-level lines (imports, `state = Statevector(qc)`, `print(qc)`, comprehensions
//    that only read the circuit…) are ignored silently.
//  - A gate call inside a for/while/if/def/with block, a comprehension or any other
//    expression is an error: we can't know how often (or whether) it runs without running it.
//  - Final measurements are ignored with a warning; a gate after a measurement on the same
//    qubit is an error (mid-circuit measurement is not supported).
//
// Every problem carries a 1-based line/column range (for the Problems tab and Monaco squiggles)
// and `tab: 'qiskit'`.
//
// How it works, in three steps:
//  1. tokenize: characters → tokens, grouped into *logical lines* (Python joins lines inside
//     brackets and after a trailing backslash). Comments are collected separately.
//  2. read statements: classify each logical line and turn gate calls into `GateCall`s.
//  3. place: each gate goes in the first column after the last gate on any wire in its span
//     (`earliestFreeColumn`), so written order = time order, like the QASM parser.
// A later "initial-state prep block" pass (V2-2) can sit between steps 2 and 3: it gets the
// comments (with line numbers) and the GateCall list (each with its line).
import { QISKIT_METHODS } from '../codegen/qiskit'
import { evaluateAngle, QISKIT_PI_NAMES } from '../model/angle'
import { assignOperationIds, defaultInitialStates, earliestFreeColumn } from '../model/circuit'
import {
  GATES,
  MAX_OPERATIONS,
  MAX_QUBITS,
  MAX_UPLOAD_BYTES,
  type GateType,
  type Operation,
  type Problem,
} from '../model/types'
import { suggestGateName, type ParseOptions, type ParseResult } from './qasm'

export type { ParseOptions, ParseResult }

/** Longest source we read (characters). Same budget as an uploaded file. */
export const MAX_QISKIT_SOURCE_LENGTH = MAX_UPLOAD_BYTES

export const STRAIGHT_LINE_MESSAGE =
  'Only straight-line Qiskit code is supported: write one gate call per line.'

export const FINAL_MEASUREMENT_MESSAGE =
  'Final measurements ignored: showing the state just before measurement'

// ---------------------------------------------------------------------------
// Method names
// ---------------------------------------------------------------------------

/** QuantumCircuit method → gate. Includes Qiskit's aliases `i`, `cnot` and `toffoli`. */
const GATE_BY_METHOD: ReadonlyMap<string, GateType> = new Map([
  ...(Object.entries(QISKIT_METHODS) as [GateType, string][]).map(
    ([gate, method]) => [method, gate] as [string, GateType],
  ),
  ['i', 'I'],
  ['cnot', 'CX'],
  ['toffoli', 'CCX'],
])

const SUPPORTED_METHODS = Object.values(QISKIT_METHODS)

/**
 * Parameter names of each gate, in positional order (the names Qiskit itself uses, so
 * `qc.cx(control_qubit=0, target_qubit=1)` works).
 */
function parameterNames(gate: GateType): string[] {
  if (GATES[gate].parametric) return ['theta', 'qubit']
  switch (gate) {
    case 'CX':
    case 'CZ':
      return ['control_qubit', 'target_qubit']
    case 'SWAP':
      return ['qubit1', 'qubit2']
    case 'CCX':
      return ['control_qubit1', 'control_qubit2', 'target_qubit']
    default:
      return ['qubit']
  }
}

/** 'a b c' → Set {'a', 'b', 'c'}: keeps long name lists compact. */
function words(text: string): Set<string> {
  return new Set(text.trim().split(/\s+/))
}

const MEASURE_METHODS = new Set(['measure', 'measure_all', 'measure_active'])

/** Methods that only read the circuit (or return a new one): a statement like `qc.draw()`. */
const READ_ONLY_METHODS = words(`
  draw depth size width count_ops num_nonlocal_gates num_tensor_factors num_unitary_factors
  copy inverse reverse_bits reverse_ops decompose to_gate to_instruction qasm has_register
`)

/** Real QuantumCircuit methods that change the circuit but that this app doesn't support. */
const UNSUPPORTED_METHODS = words(`
  u p r sx sxdg cy ch cs csdg csx crx cry crz cp cu ccz cswap fredkin iswap dcx ecr rxx ryy
  rzz rzx rccx rcccx mcx mcp mcrx mcry mcrz reset initialize prepare_state unitary append
  compose add_register delay global_phase if_test while_loop for_loop switch
`)

/**
 * True for a method call that may change the circuit, so it must not be hidden inside a block
 * or an expression. Everything except the known read-only methods counts: for an unknown
 * method we can't tell, so we don't guess.
 */
function mayChangeCircuit(method: string): boolean {
  return !READ_ONLY_METHODS.has(method)
}

/** Python keywords that start a compound statement (the line ends with ':' and a block follows). */
const COMPOUND_KEYWORDS = words(`
  for while if elif else def class with try except finally async match case
`)

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenKind = 'name' | 'number' | 'string' | 'op'

interface Token {
  kind: TokenKind
  text: string
  /** Offsets into the source (end exclusive). */
  start: number
  end: number
  /** 1-based position of the first character. */
  line: number
  column: number
  /** 1-based position just past the last character (a triple-quoted string may span lines). */
  endLine: number
  endColumn: number
}

/** One logical line: physical lines joined inside brackets or after a trailing backslash. */
interface LogicalLine {
  tokens: Token[]
  /** Column (0-based) of the first token: 0 = top level. */
  indent: number
}

/** A `# …` comment (kept for the V2-2 initial-state block markers). */
export interface Comment {
  text: string
  line: number
}

interface Tokenized {
  lines: LogicalLine[]
  comments: Comment[]
}

const NAME_START = /[\p{L}_]/u
const NAME_PART = /[\p{L}\p{N}_]/u
const NUMBER = /(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?[jJ]?/y
/** String prefixes like r"…", f'…', rb"…" (case-insensitive). */
const STRING_PREFIX = /(?:[rRbBuUfF]{1,2})(?=['"])/y
const OPERATORS_3 = new Set(['**=', '//=', '>>=', '<<=', '...'])
const OPERATORS_2 = new Set('** // == != <= >= -> += -= *= /= %= &= |= ^= @= := << >>'.split(' '))
const OPERATORS_1 = new Set('+-*/%@&|^~<>=.,:;()[]{}'.split(''))
const CLOSING: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

function tokenize(source: string, problems: Problem[]): Tokenized {
  const lines: LogicalLine[] = []
  const comments: Comment[] = []
  let current: Token[] = []
  /** Open brackets of the current logical line (a stack, never recursion). */
  const brackets: Token[] = []

  let i = 0
  let line = 1
  let lineStart = 0 // offset of the first character of the current physical line
  const col = (offset: number) => offset - lineStart + 1

  const error = (message: string, l: number, c: number, endC = c + 1) =>
    problems.push({
      severity: 'error',
      message,
      tab: 'qiskit',
      line: l,
      column: c,
      endLine: l,
      endColumn: endC,
    })

  const push = (kind: TokenKind, start: number, end: number, startLine = line, startCol?: number) =>
    current.push({
      kind,
      text: source.slice(start, end),
      start,
      end,
      line: startLine,
      column: startCol ?? col(start),
      endLine: line,
      endColumn: col(end),
    })

  const endLogicalLine = () => {
    if (current.length > 0) lines.push({ tokens: current, indent: current[0].column - 1 })
    current = []
  }

  while (i < source.length) {
    const ch = source[i]

    if (ch === '\n' || ch === '\r') {
      // \r\n counts as one line break.
      i += ch === '\r' && source[i + 1] === '\n' ? 2 : 1
      line += 1
      lineStart = i
      // Inside brackets the logical line continues (Python's implicit line joining).
      if (brackets.length === 0) endLogicalLine()
      continue
    }
    if (ch === ' ' || ch === '\t' || ch === '\f') {
      i += 1
      continue
    }

    if (ch === '#') {
      const start = i
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i += 1
      comments.push({ text: source.slice(start, i), line })
      continue
    }

    // Explicit line joining: a backslash right before the line break.
    if (ch === '\\') {
      const nextCh = source[i + 1]
      if (nextCh === '\n' || nextCh === '\r') {
        i += nextCh === '\r' && source[i + 2] === '\n' ? 3 : 2
        line += 1
        lineStart = i
        continue
      }
      error(
        "Unexpected '\\': a line continuation must be the last character on the line.",
        line,
        col(i),
      )
      i += 1
      continue
    }

    // Strings (possibly with a prefix like f or r, possibly triple-quoted and multi-line).
    STRING_PREFIX.lastIndex = i
    const prefix = STRING_PREFIX.exec(source)
    if (ch === '"' || ch === "'" || prefix) {
      const start = i
      const startLine = line
      const startCol = col(i)
      i += prefix ? prefix[0].length : 0
      const quote = source[i]
      const triple = source[i + 1] === quote && source[i + 2] === quote
      const delimiter = triple ? quote.repeat(3) : quote
      i += delimiter.length
      let closed = false
      while (i < source.length) {
        const c = source[i]
        if (c === '\\') {
          // Skip the escaped character. An escaped line break continues the string.
          const escaped = source[i + 1]
          i += escaped === '\r' && source[i + 2] === '\n' ? 3 : 2
          if (escaped === '\n' || escaped === '\r') {
            line += 1
            lineStart = i
          }
          continue
        }
        if (source.startsWith(delimiter, i)) {
          i += delimiter.length
          closed = true
          break
        }
        if (c === '\n' || c === '\r') {
          if (!triple) break // a plain string can't span lines
          i += c === '\r' && source[i + 1] === '\n' ? 2 : 1
          line += 1
          lineStart = i
          continue
        }
        i += 1
      }
      if (!closed) {
        error(
          triple
            ? `Unterminated string: ${delimiter} has no closing ${delimiter}.`
            : `Unterminated string: missing closing ${quote}.`,
          startLine,
          startCol,
          startCol + delimiter.length,
        )
      }
      push('string', start, Math.min(i, source.length), startLine, startCol)
      continue
    }

    if (NAME_START.test(ch)) {
      const start = i
      while (i < source.length && NAME_PART.test(source[i])) i += 1
      push('name', start, i)
      continue
    }

    NUMBER.lastIndex = i
    const number = NUMBER.exec(source)
    if (number) {
      push('number', i, i + number[0].length)
      i += number[0].length
      continue
    }

    const three = source.slice(i, i + 3)
    const two = source.slice(i, i + 2)
    const opLength = OPERATORS_3.has(three)
      ? 3
      : OPERATORS_2.has(two)
        ? 2
        : OPERATORS_1.has(ch)
          ? 1
          : 0
    if (opLength > 0) {
      push('op', i, i + opLength)
      i += opLength
      const token = current[current.length - 1]
      if (ch === '(' || ch === '[' || ch === '{') {
        brackets.push(token)
      } else if (ch in CLOSING && opLength === 1) {
        const open = brackets.pop()
        if (!open) error(`Unmatched '${ch}'.`, token.line, token.column)
        else if (open.text !== CLOSING[ch])
          error(
            `'${ch}' does not match '${open.text}' on line ${open.line}.`,
            token.line,
            token.column,
          )
      }
      continue
    }

    error(`Unexpected character '${ch}'.`, line, col(i))
    i += 1
  }

  for (const open of brackets) error(`'${open.text}' was never closed.`, open.line, open.column)
  brackets.length = 0
  endLogicalLine()
  return { lines, comments }
}

// ---------------------------------------------------------------------------
// Small token helpers
// ---------------------------------------------------------------------------

const isOp = (t: Token | undefined, text: string) => t?.kind === 'op' && t.text === text
const isName = (t: Token | undefined, text?: string) =>
  t?.kind === 'name' && (text === undefined || t.text === text)

/** Index of the bracket that closes the one at `openIndex` (same statement), or -1. */
function matchingClose(tokens: Token[], openIndex: number): number {
  let depth = 0
  for (let k = openIndex; k < tokens.length; k++) {
    const t = tokens[k]
    if (t.kind !== 'op') continue
    if (t.text === '(' || t.text === '[' || t.text === '{') depth += 1
    else if (t.text === ')' || t.text === ']' || t.text === '}') {
      depth -= 1
      if (depth === 0) return k
    }
  }
  return -1
}

/** Splits tokens at commas that are not inside brackets. Empty pieces are kept (as []). */
function splitTopLevel(tokens: Token[], separator: string): Token[][] {
  const parts: Token[][] = [[]]
  let depth = 0
  for (const t of tokens) {
    if (t.kind === 'op') {
      if (t.text === '(' || t.text === '[' || t.text === '{') depth += 1
      else if (t.text === ')' || t.text === ']' || t.text === '}') depth -= 1
      else if (t.text === separator && depth === 0) {
        parts.push([])
        continue
      }
    }
    parts[parts.length - 1].push(t)
  }
  return parts
}

/**
 * Rebuilds an expression's text from its tokens (comments and line breaks dropped). A space
 * is kept only between two names/numbers, so "2 pi" stays invalid while "np . pi" → "np.pi".
 */
function tokensText(tokens: Token[]): string {
  let out = ''
  tokens.forEach((t, k) => {
    const prev = tokens[k - 1]
    const wordy = (x: Token) => x.kind === 'name' || x.kind === 'number'
    if (prev && wordy(prev) && wordy(t)) out += ' '
    out += t.text
  })
  return out
}

/** Shortens long user text for an error message. */
function excerpt(text: string, max = 40): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/** One argument of a call: `value` or `name=value`. */
interface Argument {
  keyword?: Token
  value: Token[]
  first: Token
  last: Token
}

/** A gate call read from the code, before it is placed in a column. */
interface GateCall {
  gate: GateType
  qubits: number[]
  angle?: number
  /** Where it was written (for error messages, and for the V2-2 prep-block pass). */
  first: Token
  last: Token
}

/** A statement at the top level (not inside a block). */
interface TopStatement {
  tokens: Token[]
  /** True for a compound statement header (`for …:`, `if …:`, `def …:` …). */
  compound: boolean
}

export function parseQiskit(source: string, options: ParseOptions = {}): ParseResult {
  const problems: Problem[] = []

  function report(severity: Problem['severity'], message: string, from: Token, to: Token = from) {
    problems.push({
      severity,
      message,
      tab: 'qiskit',
      line: from.line,
      column: from.column,
      endLine: to.endLine,
      endColumn: to.endColumn,
    })
  }
  const error = (message: string, from: Token, to?: Token) => report('error', message, from, to)
  const warning = (message: string, from: Token, to?: Token) => report('warning', message, from, to)
  const errorAtStart = (message: string) =>
    problems.push({
      severity: 'error',
      message,
      tab: 'qiskit',
      line: 1,
      column: 1,
      endLine: 1,
      endColumn: 2,
    })

  // Hard size limit first: we never even tokenize huge input.
  if (source.length > MAX_QISKIT_SOURCE_LENGTH) {
    errorAtStart(
      `The code is too long (${Math.ceil(source.length / 1024)} KB); the limit is ` +
        `${MAX_QISKIT_SOURCE_LENGTH / 1024} KB.`,
    )
    return { circuit: null, problems }
  }

  const { lines } = tokenize(source, problems)

  // Lines where the tokenizer already reported a syntax error (unmatched bracket, bad
  // character…). Statements touching them are skipped, so one typo gives one error.
  const syntaxErrorLines = new Set(problems.map((p) => p.line))
  const hasSyntaxError = (tokens: Token[]) =>
    tokens.some((t) => syntaxErrorLines.has(t.line) || syntaxErrorLines.has(t.endLine))

  // --- 1. Sort logical lines into top-level statements and block contents ------------------

  const top: TopStatement[] = []
  /** Lines inside a block (indented under a compound statement). */
  const blockLines: LogicalLine[] = []
  let sawCompound = false
  for (const logical of lines) {
    if (logical.indent > 0) {
      // Indented code is only valid inside a block (after a line like `for …:`).
      if (sawCompound) blockLines.push(logical)
      else
        error('Unexpected indentation: top-level code must start at column 1.', logical.tokens[0])
      continue
    }
    const first = logical.tokens[0]
    if (isName(first) && COMPOUND_KEYWORDS.has(first.text)) {
      sawCompound = true
      top.push({ tokens: logical.tokens, compound: true })
      continue
    }
    // `a; b` on one line = two statements.
    for (const part of splitTopLevel(logical.tokens, ';')) {
      if (part.length > 0) top.push({ tokens: part, compound: false })
    }
  }

  // --- 2. Find the circuit variable: the first `<name> = QuantumCircuit(...)` --------------

  /** Index of the `QuantumCircuit` name token if the statement is `<name> = QuantumCircuit(…)`. */
  function creationCallIndex(tokens: Token[]): number {
    if (!isName(tokens[0]) || !isOp(tokens[1], '=')) return -1
    if (isName(tokens[2], 'QuantumCircuit')) return 2
    // Also `qiskit.QuantumCircuit(…)`.
    if (isName(tokens[2], 'qiskit') && isOp(tokens[3], '.') && isName(tokens[4], 'QuantumCircuit'))
      return 4
    return -1
  }

  const creationStatement = top.find((s) => !s.compound && creationCallIndex(s.tokens) >= 0)
  const circuitName: string | null = creationStatement ? creationStatement.tokens[0].text : null

  /**
   * First `<circuit>.<method>(` call that may change the circuit, anywhere inside these tokens. Returns the circuit
   * name token and the method token (the part to underline), or null.
   */
  function findMutatingCall(tokens: Token[]): { from: Token; to: Token } | null {
    if (circuitName === null) return null
    for (let k = 0; k + 3 < tokens.length; k++) {
      if (
        isName(tokens[k], circuitName) &&
        !isOp(tokens[k - 1], '.') &&
        isOp(tokens[k + 1], '.') &&
        isName(tokens[k + 2]) &&
        isOp(tokens[k + 3], '(') &&
        mayChangeCircuit(tokens[k + 2].text)
      ) {
        return { from: tokens[k], to: tokens[k + 2] }
      }
    }
    return null
  }

  const straightLineError = (at: { from: Token; to: Token }) =>
    error(STRAIGHT_LINE_MESSAGE, at.from, at.to)

  // Gate calls inside blocks: we can't know how often they run → error.
  for (const logical of blockLines) {
    const call = findMutatingCall(logical.tokens)
    if (call) straightLineError(call)
  }

  // --- 3. Read the top-level statements in order -------------------------------------------

  let numQubits: number | null = null
  let created: Token | null = null
  const calls: GateCall[] = []
  /** Measured qubit → the `measure` token, for "gate after measurement" errors. */
  const measured = new Map<number, Token>()
  let tooManyGates = false

  /** Parses `(args)` of a call whose `(` is at `openIndex`. Null after reporting an error. */
  function readArguments(tokens: Token[], openIndex: number, what: string): Argument[] | null {
    const closeIndex = matchingClose(tokens, openIndex)
    if (closeIndex < 0) return null // unclosed bracket, already reported by the tokenizer
    if (closeIndex !== tokens.length - 1) {
      error(
        `Unexpected '${excerpt(tokensText(tokens.slice(closeIndex + 1)))}' after ${what}. ` +
          'Write one plain call per line.',
        tokens[closeIndex + 1],
        tokens[tokens.length - 1],
      )
      return null
    }
    const inner = tokens.slice(openIndex + 1, closeIndex)
    if (inner.length === 0) return []
    const parts = splitTopLevel(inner, ',')
    // Python allows one trailing comma: f(a, b,)
    if (parts.length > 1 && parts[parts.length - 1].length === 0) parts.pop()
    const args: Argument[] = []
    let sawKeyword = false
    for (const part of parts) {
      if (part.length === 0) {
        error(`Expected an argument in ${what}.`, tokens[openIndex], tokens[closeIndex])
        return null
      }
      if (isName(part[0]) && isOp(part[1], '=')) {
        sawKeyword = true
        if (part.length === 2) {
          error(`Missing a value after '${part[0].text}='.`, part[0], part[1])
          return null
        }
        args.push({
          keyword: part[0],
          value: part.slice(2),
          first: part[0],
          last: part[part.length - 1],
        })
      } else {
        if (sawKeyword) {
          error(
            'A positional argument cannot follow a keyword argument.',
            part[0],
            part[part.length - 1],
          )
          return null
        }
        args.push({ value: part, first: part[0], last: part[part.length - 1] })
      }
    }
    return args
  }

  /** A whole number token like `2` (no sign, no decimals). */
  const wholeNumber = (value: Token[]): number | null =>
    value.length === 1 && value[0].kind === 'number' && /^\d+$/.test(value[0].text)
      ? Number(value[0].text)
      : null

  /**
   * Reads a qubit argument: `3`, or (when `allowList`) `[0, 1, 2]`, or (when `allowRange`)
   * `range(3)` / `range(1, 3)`. Checks the range against the circuit. Null after an error.
   */
  function readQubits(
    arg: Argument,
    what: string,
    allowList: boolean,
    allowRange = false,
  ): number[] | null {
    const { value } = arg
    const single = wholeNumber(value)
    let qubits: number[] | null = single === null ? null : [single]

    if (qubits === null && allowList && isOp(value[0], '[') && isOp(value[value.length - 1], ']')) {
      const items = splitTopLevel(value.slice(1, -1), ',')
      if (items.length > 1 && items[items.length - 1].length === 0) items.pop()
      const numbers = items.map(wholeNumber)
      if (items.length === 1 && items[0].length === 0) {
        error(`${what}: the qubit list is empty.`, arg.first, arg.last)
        return null
      }
      if (numbers.every((n) => n !== null)) qubits = numbers as number[]
    }

    if (
      qubits === null &&
      allowRange &&
      isName(value[0], 'range') &&
      isOp(value[1], '(') &&
      isOp(value[value.length - 1], ')')
    ) {
      const bounds = splitTopLevel(value.slice(2, -1), ',').map(wholeNumber)
      if ((bounds.length === 1 || bounds.length === 2) && bounds.every((b) => b !== null)) {
        const [from, to] = bounds.length === 1 ? [0, bounds[0] as number] : (bounds as number[])
        // Bounded by the circuit size check below; cap the loop so hostile input stays cheap.
        qubits = []
        for (let q = from; q < to && qubits.length <= MAX_QUBITS; q++) qubits.push(q)
      }
    }

    if (qubits === null) {
      const isNegative = isOp(value[0], '-') && wholeNumber(value.slice(1)) !== null
      error(
        isNegative
          ? `${what}: qubit indices must be 0 or more (negative indices are not supported).`
          : allowList
            ? `${what}: a qubit must be a whole number like 0, or a list like [0, 1].`
            : `${what}: a qubit must be a whole number like 0.`,
        arg.first,
        arg.last,
      )
      return null
    }
    if (numQubits !== null) {
      for (const q of qubits) {
        if (q >= numQubits) {
          error(
            `Qubit ${q} is out of range: the circuit has ${numQubits} qubit${numQubits === 1 ? '' : 's'} ` +
              `(0 to ${numQubits - 1}).`,
            arg.first,
            arg.last,
          )
          return null
        }
      }
    }
    return qubits
  }

  /** `<name> = QuantumCircuit(n[, m])` */
  function readCreation(tokens: Token[], callIndex: number) {
    const target = tokens[0]
    const call = tokens[callIndex]
    if (created) {
      error(
        `Only one circuit per file is supported ('${circuitName}' was already created on line ${created.line}).`,
        target,
        tokens[tokens.length - 1],
      )
      return
    }
    created = target
    if (!isOp(tokens[callIndex + 1], '(')) {
      error(`Create the circuit with ${target.text} = QuantumCircuit(2).`, call)
      return
    }
    const args = readArguments(tokens, callIndex + 1, 'QuantumCircuit(...)')
    if (!args) return
    const usage = `Use ${target.text} = QuantumCircuit(n) with a whole number of qubits, e.g. QuantumCircuit(2).`
    const positional = args.filter((a) => !a.keyword)
    for (const a of args) {
      // `name="bell"` is harmless; any other keyword (or a register object) is not supported.
      if (a.keyword && a.keyword.text !== 'name') {
        error(`QuantumCircuit: unsupported argument '${a.keyword.text}'. ${usage}`, a.first, a.last)
      }
    }
    if (positional.length === 0) {
      error(`QuantumCircuit needs the number of qubits. ${usage}`, call, tokens[tokens.length - 1])
      return
    }
    if (positional.length > 2) {
      error(
        'QuantumCircuit takes at most 2 numbers: qubits and classical bits.',
        positional[2].first,
        positional[positional.length - 1].last,
      )
    }
    const n = wholeNumber(positional[0].value)
    if (n === null) {
      error(
        `Registers and expressions are not supported here. ${usage}`,
        positional[0].first,
        positional[0].last,
      )
      return
    }
    if (n < 1) {
      error('A circuit needs at least 1 qubit.', positional[0].first, positional[0].last)
    } else if (n > MAX_QUBITS) {
      error(
        `This app shows at most ${MAX_QUBITS} qubits (a teaching cap: beyond that the density ` +
          `matrices and trace steps become unreadable). Use QuantumCircuit(${MAX_QUBITS}) or fewer.`,
        positional[0].first,
        positional[0].last,
      )
    }
    // Keep the declared size even if too large, so later range checks stay meaningful.
    if (n >= 1) numQubits = n
    if (positional.length >= 2) {
      const m = positional[1]
      if (wholeNumber(m.value) === null) {
        error(`Classical bits must be a whole number, e.g. QuantumCircuit(2, 2).`, m.first, m.last)
      } else {
        warning(
          'Classical bits are ignored: measurement results are not part of this app.',
          m.first,
          m.last,
        )
      }
    }
  }

  /** Error if a gate acts on a qubit that was measured earlier. */
  function checkNotMeasured(qubits: number[], from: Token, to: Token): boolean {
    for (const q of qubits) {
      const at = measured.get(q)
      if (at) {
        error(
          `Gate after a measurement: qubit ${q} was measured on line ${at.line}. ` +
            'Only final measurements are supported (they are ignored).',
          from,
          to,
        )
        return false
      }
    }
    return true
  }

  /** Adds a gate call, enforcing the operation limit. */
  function addCall(call: GateCall) {
    if (calls.length >= MAX_OPERATIONS) {
      error(`Too many gates: a circuit can have at most ${MAX_OPERATIONS}.`, call.first, call.last)
      tooManyGates = true
      return
    }
    calls.push(call)
  }

  /** `<circuit>.<method>(args)` as a whole statement. */
  function readMethodCall(tokens: Token[]) {
    const variable = tokens[0]
    const methodToken = tokens[2]
    const method = methodToken.text
    const label = `${variable.text}.${method}`
    const last = tokens[tokens.length - 1]

    if (READ_ONLY_METHODS.has(method)) return // e.g. qc.draw(): doesn't change the circuit
    if (!created) {
      error(
        `'${variable.text}' is used before ${variable.text} = QuantumCircuit(...) creates it.`,
        variable,
        methodToken,
      )
      return
    }

    if (method === 'barrier') {
      warning("'barrier' is ignored: it has no effect on the state.", variable, last)
      return
    }

    if (MEASURE_METHODS.has(method)) {
      let qubits: number[]
      if (method === 'measure') {
        const args = readArguments(tokens, 3, `${label}(...)`)
        if (!args) return
        const qubitArg =
          args.find((a) => a.keyword?.text === 'qubit') ?? args.find((a) => !a.keyword)
        if (!qubitArg) {
          error(`${label} needs a qubit, e.g. ${label}(0, 0).`, variable, last)
          return
        }
        const read = readQubits(qubitArg, label, true, true)
        if (!read) return
        qubits = read
      } else {
        // measure_all / measure_active: every qubit.
        qubits = Array.from({ length: numQubits ?? 0 }, (_, q) => q)
      }
      for (const q of qubits) if (!measured.has(q)) measured.set(q, variable)
      warning(FINAL_MEASUREMENT_MESSAGE, variable, last)
      return
    }

    const gate = GATE_BY_METHOD.get(method)
    if (gate === undefined) {
      if (UNSUPPORTED_METHODS.has(method)) {
        error(
          `'${label}' is not supported in this app. Supported gates: ${SUPPORTED_METHODS.join(', ')}.`,
          variable,
          methodToken,
        )
      } else {
        const suggestion = suggestGateName(method)
        const hint = suggestion ? ` Did you mean '${variable.text}.${suggestion}'?` : ''
        error(`Unknown method '${label}'.${hint}`, variable, methodToken)
      }
      return
    }

    const args = readArguments(tokens, 3, `${label}(...)`)
    if (!args) return
    const names = parameterNames(gate)
    const signature = `${label}(${names.join(', ')})`

    // Bind positional arguments in order, then keywords by name.
    const bound = new Map<string, Argument>()
    let ok = true
    args.forEach((arg, k) => {
      if (!ok) return
      if (!arg.keyword) {
        if (k >= names.length) {
          error(
            `${label} takes ${names.length} argument${names.length === 1 ? '' : 's'}: ${signature}; got ${args.length}.`,
            arg.first,
            args[args.length - 1].last,
          )
          ok = false
          return
        }
        bound.set(names[k], arg)
        return
      }
      const name = arg.keyword.text
      if (!names.includes(name)) {
        error(`${label} has no argument '${name}'. Expected ${signature}.`, arg.keyword)
        ok = false
      } else if (bound.has(name)) {
        error(`${label}: argument '${name}' is given twice.`, arg.keyword)
        ok = false
      } else {
        bound.set(name, arg)
      }
    })
    if (!ok) return
    const missing = names.filter((n) => !bound.has(n))
    if (missing.length > 0) {
      error(
        `${label} needs ${names.length} argument${names.length === 1 ? '' : 's'}: ${signature}; ` +
          `missing ${missing.join(', ')}.`,
        variable,
        last,
      )
      return
    }

    // Angle (rotations only).
    let angle: number | undefined
    if (GATES[gate].parametric) {
      const theta = bound.get('theta') as Argument
      const text = tokensText(theta.value)
      const result = evaluateAngle(text, { piNames: QISKIT_PI_NAMES })
      if ('error' in result) {
        const reason =
          result.error === 'Invalid angle expression.'
            ? `Invalid angle '${excerpt(text)}'. Use numbers, pi (or np.pi, math.pi), + - * / and parentheses.`
            : result.error
        error(reason, theta.first, theta.last)
        return
      }
      angle = result.value
    }

    // Qubits. A list is allowed only for single-qubit gates (one gate per entry).
    const singleQubit = GATES[gate].arity === 1
    const qubitNames = names.filter((n) => n !== 'theta')
    const qubitLists: number[][] = []
    for (const name of qubitNames) {
      const arg = bound.get(name) as Argument
      if (!singleQubit && isOp(arg.value[0], '[')) {
        error(
          `${label}: lists of qubits are only supported for single-qubit gates. Write one ${method} per line.`,
          arg.first,
          arg.last,
        )
        return
      }
      const qubits = readQubits(arg, label, singleQubit)
      if (!qubits) return
      qubitLists.push(qubits)
    }

    if (singleQubit) {
      for (const q of qubitLists[0]) {
        if (!checkNotMeasured([q], variable, last)) return
        addCall({
          gate,
          qubits: [q],
          ...(angle === undefined ? {} : { angle }),
          first: variable,
          last,
        })
        if (tooManyGates) return
      }
      return
    }
    const qubits = qubitLists.map((list) => list[0])
    const duplicate = qubits.find((q, k) => qubits.indexOf(q) !== k)
    if (duplicate !== undefined) {
      error(
        `${label} uses qubit ${duplicate} more than once; qubits must be distinct.`,
        variable,
        last,
      )
      return
    }
    if (!checkNotMeasured(qubits, variable, last)) return
    addCall({ gate, qubits, first: variable, last })
  }

  const ASSIGNMENT_OPS = new Set('= += -= *= /= //= %= **= @= &= |= ^= >>= <<= :='.split(' '))

  for (const statement of top) {
    if (tooManyGates) break // bail out: no more work on hostile input
    const { tokens } = statement
    if (hasSyntaxError(tokens)) continue
    const first = tokens[0]

    if (statement.compound) {
      // e.g. `for k in range(3): qc.h(k)` on one line, or the header of an indented block.
      const call = findMutatingCall(tokens)
      if (call) straightLineError(call)
      continue
    }
    // Imports: the supported ones (QuantumCircuit, pi, numpy) and any others are ignored.
    if (isName(first, 'import') || isName(first, 'from')) continue

    const callIndex = creationCallIndex(tokens)
    if (callIndex >= 0) {
      readCreation(tokens, callIndex)
      continue
    }

    // `<name>.<method>(...)` as a whole statement.
    if (isName(first) && isOp(tokens[1], '.') && isName(tokens[2]) && isOp(tokens[3], '(')) {
      if (first.text === circuitName) {
        readMethodCall(tokens)
        continue
      }
      if (GATE_BY_METHOD.has(tokens[2].text) || MEASURE_METHODS.has(tokens[2].text)) {
        // Looks like a gate call on something that isn't the circuit.
        error(
          circuitName === null
            ? `'${first.text}' is not a circuit: create it first, e.g. ${first.text} = QuantumCircuit(2).`
            : `'${first.text}' is not the circuit: gates go on '${circuitName}'.`,
          first,
          tokens[2],
        )
        continue
      }
      // Some other object's method (plt.show(), state.draw('latex'), …): ignored below,
      // unless a gate call on the circuit hides in its arguments.
    }

    // Reassigning the circuit variable (qc = …, qc += …) can't be followed without running code.
    if (
      circuitName !== null &&
      isName(first, circuitName) &&
      tokens[1]?.kind === 'op' &&
      ASSIGNMENT_OPS.has(tokens[1].text)
    ) {
      error(
        `Reassigning '${circuitName}' is not supported: build the circuit with one gate call per line.`,
        first,
        tokens[1],
      )
      continue
    }

    // Anything else (state = Statevector(qc), print(qc), rho = [... for k in ...]) is ignored,
    // unless a gate call hides inside it.
    const hidden = findMutatingCall(tokens)
    if (hidden) straightLineError(hidden)
  }

  if (lines.length === 0) {
    errorAtStart(
      'Empty program: create a circuit, e.g. qc = QuantumCircuit(2), then add gates like qc.h(0).',
    )
  } else if (!created) {
    errorAtStart('No circuit found: create one, e.g. qc = QuantumCircuit(2).')
  }

  // Report in text order (block errors were found in a separate pass above). Stable sort.
  problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0))

  const hasError = problems.some((p) => p.severity === 'error')
  if (hasError || numQubits === null) return { circuit: null, problems }

  // --- 4. Place the gates: written order = time order --------------------------------------
  const placed: Operation[] = []
  for (const call of calls) {
    const column = earliestFreeColumn({ operations: placed }, call.qubits)
    placed.push({
      id: '', // real ids are assigned below
      gate: call.gate,
      column,
      qubits: call.qubits,
      ...(call.angle === undefined ? {} : { angle: call.angle }),
    })
  }
  const n: number = numQubits
  return {
    circuit: {
      numQubits: n,
      initialStates: defaultInitialStates(n),
      operations: assignOperationIds(
        placed.map(({ gate, column, qubits, angle }) => ({
          gate,
          column,
          qubits,
          ...(angle === undefined ? {} : { angle }),
        })),
        options.previous,
      ),
    },
    problems,
  }
}
