// OpenQASM 2.0 (subset) → circuit model. Hand-written tokenizer + recursive-descent parser.
//
// Supported program shape (exactly what the app itself writes, plus comments/whitespace):
//
//   OPENQASM 2.0;
//   include "qelib1.inc";
//   qreg q[3];
//   h q[0];
//   rz(pi/4) q[1];
//   cx q[0],q[1];
//
// Every problem carries a 1-based line/column range so the Problems tab and the Monaco
// squiggles point at the exact characters. After an error the parser skips to the next `;`
// and keeps going, so one pass reports as many problems as is reasonable.
//
// Initial states (V2-2): gates between `// initial states` and `// end initial states` (right
// after the qreg) set the wires' start states instead of becoming operations; see prepBlock.ts.
//
// Auto-placement: written order = time order. Each gate is put in the first column after the
// last gate that touches any wire in its span (`earliestFreeColumn`), so independent gates
// share a column and dependent gates follow each other.
import { QASM_GATE_NAMES } from '../codegen/qasm'
import { parseAngle } from '../model/angle'
import { assignOperationIds, earliestFreeColumn } from '../model/circuit'
import {
  GATES,
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

/** Real qelib1.inc / built-in gates that this app does not implement (yet). */
const KNOWN_UNSUPPORTED = new Set([
  'U',
  'u',
  'u0',
  'u1',
  'u2',
  'u3',
  'p',
  'sx',
  'sxdg',
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
// Parser
// ---------------------------------------------------------------------------

interface QubitArg {
  register: string
  index: number
  first: Token
  last: Token
}

interface Register {
  name: string
  size: number
}

/** Ops as parsed (no ids yet). */
type ParsedOp = Omit<Operation, 'id'>

export function parseQasm(source: string, options: ParseOptions = {}): ParseResult {
  const problems: Problem[] = []
  const comments: SourceComment[] = []
  const tokens = tokenize(source, problems, comments)
  let pos = 0

  let sawHeader = false
  let statementCount = 0
  // Held in an object because it is assigned inside nested functions (keeps TS narrowing honest).
  const state: { qreg: Register | null } = { qreg: null }
  const cregNames = new Set<string>()
  const ops: ParsedOp[] = []

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
    const name = peek()
    if (!name) {
      errorAtEnd('Expected a qubit like q[0].')
      return null
    }
    if (name.kind !== 'ident') {
      error(`Expected a qubit like q[0], found '${name.text}'.`, name)
      return null
    }
    next()
    if (!isSymbol(peek(), '[')) {
      error(
        `Use an indexed qubit like ${name.text}[0]; whole-register arguments are not supported in v1.`,
        name,
      )
      return null
    }
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
    return { register: name.text, index: Number(index.text), first: name, last: close as Token }
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
        `Only one qreg is supported in v1 (already declared ${existing.name}[${existing.size}]).`,
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
      `Classical register ${decl.register.name} is ignored: measurement is not part of v1.`,
      keyword,
      decl.last,
    )
    endStatement(decl.last)
  }

  /** Statement types we recognise but don't support: report and skip to `;`. */
  function unsupportedStatement(keyword: Token, message: string, severity: Problem['severity']) {
    skipStatement()
    // Underline the statement up to (not including) its `;`.
    const end = tokens[pos - 1]
    const last = end && isSymbol(end, ';') && end !== keyword ? tokens[pos - 2] : end
    report(severity, message, keyword, last ?? keyword)
  }

  /** `gate name(params) args { body }` / `opaque name args;` → error, skip the definition. */
  function gateDefinition(keyword: Token) {
    const name = tokens[pos + 1]
    error(
      'Custom gate definitions are not supported in v1; use the built-in gates instead.',
      keyword,
      name?.kind === 'ident' ? name : keyword,
    )
    next()
    // Skip to the closing brace of the body (or `;` for opaque).
    while (pos < tokens.length) {
      const t = next()
      if (isSymbol(t, ';') && keyword.text === 'opaque') return
      if (isSymbol(t, '{')) {
        while (pos < tokens.length && !isSymbol(next(), '}'));
        return
      }
    }
  }

  function parseGate(nameToken: Token) {
    next()
    const errorsBefore = problems.filter((p) => p.severity === 'error').length
    const gate = GATE_BY_NAME[nameToken.text]

    if (gate === undefined) {
      if (KNOWN_UNSUPPORTED.has(nameToken.text)) {
        error(
          `Gate '${nameToken.text}' is not supported in v1. Supported gates: ${SUPPORTED_NAMES.join(', ')}.`,
          nameToken,
        )
      } else {
        const suggestion = suggestGateName(nameToken.text)
        const hint = suggestion
          ? suggestion.toLowerCase() === nameToken.text.toLowerCase()
            ? ` Did you mean '${suggestion}'? Gate names are case-sensitive.`
            : ` Did you mean '${suggestion}'?`
          : ''
        error(`Unknown gate '${nameToken.text}'.${hint}`, nameToken)
      }
      skipStatement()
      return
    }
    const info = GATES[gate]
    let last = nameToken

    // --- optional `(angle)` ---
    let angle: number | undefined
    if (isSymbol(peek(), '(')) {
      const open = next() as Token
      let depth = 1
      let close: Token | undefined
      let commaAtTop: Token | undefined
      while (pos < tokens.length) {
        const t = peek() as Token
        if (isSymbol(t, ';')) break
        next()
        if (isSymbol(t, '(')) depth += 1
        else if (isSymbol(t, ')')) {
          depth -= 1
          if (depth === 0) {
            close = t
            break
          }
        } else if (isSymbol(t, ',') && depth === 1) commaAtTop ??= t
      }
      if (!close) {
        error("Missing ')' after the angle.", open, tokens[pos - 1] ?? open)
        skipStatement()
        return
      }
      last = close
      const exprText = source.slice(open.end, close.start).trim()
      if (!info.parametric) {
        error(`'${nameToken.text}' takes no angle parameter.`, open, close)
      } else if (exprText === '') {
        error(`'${nameToken.text}' needs an angle, e.g. ${nameToken.text}(pi/2) q[0];`, open, close)
      } else if (commaAtTop) {
        error(`'${nameToken.text}' takes exactly one angle.`, open, close)
      } else {
        const value = parseAngle(exprText)
        if (value === null) {
          error(
            `Invalid angle expression '${exprText}'. Use numbers, pi, + - * / and parentheses.`,
            tokens[tokens.indexOf(open) + 1],
            tokens[tokens.indexOf(close) - 1],
          )
        } else {
          angle = value
        }
      }
    } else if (info.parametric) {
      error(`'${nameToken.text}' needs an angle, e.g. ${nameToken.text}(pi/2) q[0];`, nameToken)
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
    if (args.length !== info.arity) {
      const from = args[0]?.first ?? nameToken
      const to = args[args.length - 1]?.last ?? last
      const plural = info.arity === 1 ? 'qubit' : 'qubits'
      error(
        `'${nameToken.text}' needs ${info.arity} ${plural}${ARGUMENT_HINT[gate] ?? ''}, got ${args.length}.`,
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

    const errorsAfter = problems.filter((p) => p.severity === 'error').length
    if (errorsAfter > errorsBefore) return

    const qubits = args.map((a) => a.index)
    if (isInPrepBlock(prepBlock, nameToken.line)) {
      // A preparation gate: it only says which state the wire starts in (checked below).
      prepCalls.push({
        gate,
        qubits,
        span: {
          line: nameToken.line,
          column: nameToken.column,
          endLine: last.line,
          endColumn: last.endColumn,
        },
      })
      return
    }
    firstGateLine ??= nameToken.line

    // Auto-placement: first column after the last gate touching this gate's span.
    const column = earliestFreeColumn({ operations: asOps(ops) }, qubits)
    ops.push({ gate, column, qubits, ...(angle === undefined ? {} : { angle }) })
  }

  // --- main loop --------------------------------------------------------------

  while (pos < tokens.length) {
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
        unsupportedStatement(
          t,
          "'measure' is not supported in v1: measurement is not part of this app yet.",
          'error',
        )
        break
      case 'reset':
        unsupportedStatement(t, "'reset' is not supported in v1.", 'error')
        break
      case 'if':
        unsupportedStatement(t, "'if' is not supported in v1 (it needs measurement).", 'error')
        break
      case 'barrier':
        unsupportedStatement(t, "'barrier' is ignored: it has no effect on the state.", 'warning')
        break
      case 'gate':
      case 'opaque':
        gateDefinition(t)
        break
      default:
        parseGate(t)
    }
    statementCount += 1
  }

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

/** Parsed ops with placeholder ids, only for `earliestFreeColumn` (which ignores ids). */
function asOps(ops: ParsedOp[]): Operation[] {
  return ops.map((op, i) => ({ ...op, id: String(i) }))
}

/** Identity of a gate for id reuse: what it does, not where it sits. */

// Kept here for existing imports; the implementation lives with the model helpers.
export { circuitsEqual } from '../model/circuit'
