// Rotation angles as text, shared by the canvas angle input, code generation and both code
// parsers (QASM and Qiskit).
//
// parseAngle accepts a constant angle expression: numbers, a name for π, + - * / and
// parentheses, e.g. "pi/2", "-3*pi/4", "0.25", "2*(pi/3)". Which names mean π depends on the
// language: QASM writes `pi` (we also accept `π`); Python code may write `pi`, `np.pi`,
// `numpy.pi` or `math.pi` (see QISKIT_PI_NAMES).
// formatAngle writes radians back as a short, exact-looking expression when the angle is
// a simple multiple of π/k, otherwise as a plain decimal.
//
// Security: the text may come from a file or a URL, so it is never executed. It is read by a
// small hand-written tokenizer and recursive-descent parser with hard limits on length and
// nesting depth, so hostile input fails fast instead of overflowing the stack.

/** Names that mean π in OpenQASM 2.0 (and in the canvas angle input). */
export const QASM_PI_NAMES: readonly string[] = ['pi', 'π']

/** Names that mean π in Python / Qiskit code. */
export const QISKIT_PI_NAMES: readonly string[] = ['pi', 'np.pi', 'numpy.pi', 'math.pi']

/** Longest angle expression we read (characters). Real angles are a few dozen at most. */
export const MAX_ANGLE_LENGTH = 1000

/** Deepest nesting of parentheses / unary signs we follow before giving up. */
export const MAX_ANGLE_DEPTH = 64

export interface AngleOptions {
  /** Names that stand for π. Default: QASM_PI_NAMES. */
  piNames?: readonly string[]
}

export type AngleResult = { value: number } | { error: string }

/** Parses an angle expression in radians. Returns null if the text is not a valid expression. */
export function parseAngle(text: string, options: AngleOptions = {}): number | null {
  const result = evaluateAngle(text, options)
  return 'value' in result ? result.value : null
}

/**
 * Like parseAngle, but says why an expression was rejected (too long, nested too deeply,
 * not a finite number, or simply not a valid expression).
 */
export function evaluateAngle(text: string, options: AngleOptions = {}): AngleResult {
  if (text.length > MAX_ANGLE_LENGTH)
    return { error: `Angle expression is too long (over ${MAX_ANGLE_LENGTH} characters).` }
  const tokens = tokenize(text, options.piNames ?? QASM_PI_NAMES)
  if (tokens === null || tokens.length === 0) return { error: 'Invalid angle expression.' }
  let pos = 0
  // Set when the nesting limit is hit, so every level of the recursion stops at once.
  let tooDeep = false

  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  // Grammar (lowest to highest precedence):
  //   expr   := term (('+' | '-') term)*
  //   term   := unary (('*' | '/') unary)*
  //   unary  := ('-' | '+') unary | atom
  //   atom   := number | PI | '(' expr ')'
  // `depth` counts how many unary signs / parentheses we are inside. Each function returns
  // null on any error.
  function expr(depth: number): number | null {
    let value = term(depth)
    while (value !== null && (peek() === '+' || peek() === '-')) {
      const op = next()
      const rhs = term(depth)
      if (rhs === null) return null
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  function term(depth: number): number | null {
    let value = unary(depth)
    while (value !== null && (peek() === '*' || peek() === '/')) {
      const op = next()
      const rhs = unary(depth)
      if (rhs === null) return null
      value = op === '*' ? value * rhs : value / rhs
    }
    return value
  }

  function unary(depth: number): number | null {
    if (depth > MAX_ANGLE_DEPTH) {
      tooDeep = true
      return null
    }
    if (peek() === '-' || peek() === '+') {
      const op = next()
      const value = unary(depth + 1)
      if (value === null) return null
      return op === '-' ? -value : value
    }
    return atom(depth)
  }

  function atom(depth: number): number | null {
    const token = next()
    if (token === undefined) return null
    if (token === PI) return Math.PI
    if (token === '(') {
      const value = expr(depth + 1)
      if (value === null || next() !== ')') return null
      return value
    }
    const n = Number(token)
    return /^[0-9.]/.test(token) && Number.isFinite(n) ? n : null
  }

  const value = expr(0)
  if (tooDeep)
    return { error: `Angle expression is nested too deeply (over ${MAX_ANGLE_DEPTH} levels).` }
  if (value === null || pos !== tokens.length) return { error: 'Invalid angle expression.' }
  // e.g. 1/0 or 1e308*10: not a usable angle.
  if (!Number.isFinite(value)) return { error: 'Angle is not a finite number.' }
  return { value }
}

/** Token standing for π, whichever name was written. */
const PI = 'PI'

/**
 * Splits the text into numbers, π names and the symbols + - * / ( ).
 * Returns null on any other character or on a name that is not a π name.
 */
function tokenize(text: string, piNames: readonly string[]): string[] | null {
  const tokens: string[] = []
  // number | name (may be dotted, e.g. np.pi) | symbol. Sticky (`y`): each match starts at
  // `index`, so nothing is skipped.
  const re =
    /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_π][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)|([-+*/()]))/y
  let index = 0
  const source = text.trim()
  while (index < source.length) {
    re.lastIndex = index
    const m = re.exec(source)
    if (!m) return null
    if (m[2] !== undefined) {
      if (!piNames.includes(m[2])) return null
      tokens.push(PI)
    } else {
      tokens.push(m[1] ?? m[3])
    }
    index = re.lastIndex
  }
  return tokens
}

/** Largest denominator tried when recognising p·π/q. */
const MAX_DENOMINATOR = 16
const TOLERANCE = 1e-9

/**
 * Formats radians as text that parseAngle (and OpenQASM / Python with `pi` defined) can read.
 * Simple multiples of π come out as "pi/2", "-3*pi/4", "2*pi", "0"; anything else as a decimal.
 */
export function formatAngle(radians: number, piSymbol = 'pi'): string {
  if (Math.abs(radians) < TOLERANCE) return '0'
  const ratio = radians / Math.PI
  for (let q = 1; q <= MAX_DENOMINATOR; q++) {
    const p = Math.round(ratio * q)
    if (p !== 0 && Math.abs(ratio * q - p) < TOLERANCE * q) {
      const sign = p < 0 ? '-' : ''
      const abs = Math.abs(p)
      const numerator = abs === 1 ? piSymbol : `${abs}*${piSymbol}`
      return q === 1 ? `${sign}${numerator}` : `${sign}${numerator}/${q}`
    }
  }
  // Up to 12 significant digits (round-trips to ~1e-12), trailing zeros removed.
  return Number(radians.toPrecision(12)).toString()
}

/** Significant digits used when an angle is drawn inside a gate box. */
const SHORT_DIGITS = 4

/**
 * Short angle label for the gate boxes on the canvas (they are only ~40 px wide):
 * simple multiples of π as "π/2", "−3π/4"; anything else to 4 significant digits
 * ("1.911"). Uses a real minus sign (U+2212). The full value goes in a tooltip.
 */
export function formatAngleShort(radians: number): string {
  const exact = formatAngle(radians, 'π')
  const text = /π/.test(exact) || exact === '0' ? exact.replace('*', '') : formatDecimal(radians)
  return text.replace('-', '−')
}

function formatDecimal(radians: number): string {
  return Number(radians.toPrecision(SHORT_DIGITS)).toString()
}
