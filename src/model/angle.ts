// Rotation angles as text, shared by the canvas angle input, code generation and the QASM parser.
//
// parseAngle accepts what OpenQASM 2.0 allows for a constant angle: numbers, `pi` (or `π`),
// + - * / and parentheses, e.g. "pi/2", "-3*pi/4", "0.25", "2*(pi/3)".
// formatAngle writes radians back as a short, exact-looking expression when the angle is
// a simple multiple of π/k, otherwise as a plain decimal.

/** Parses an angle expression in radians. Returns null if the text is not a valid expression. */
export function parseAngle(text: string): number | null {
  const tokens = tokenize(text)
  if (tokens === null || tokens.length === 0) return null
  let pos = 0

  const peek = () => tokens[pos]
  const next = () => tokens[pos++]

  // Grammar (lowest to highest precedence):
  //   expr   := term (('+' | '-') term)*
  //   term   := unary (('*' | '/') unary)*
  //   unary  := ('-' | '+') unary | atom
  //   atom   := number | 'pi' | '(' expr ')'
  function expr(): number | null {
    let value = term()
    while (value !== null && (peek() === '+' || peek() === '-')) {
      const op = next()
      const rhs = term()
      if (rhs === null) return null
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  function term(): number | null {
    let value = unary()
    while (value !== null && (peek() === '*' || peek() === '/')) {
      const op = next()
      const rhs = unary()
      if (rhs === null) return null
      value = op === '*' ? value * rhs : value / rhs
    }
    return value
  }

  function unary(): number | null {
    if (peek() === '-' || peek() === '+') {
      const op = next()
      const value = unary()
      if (value === null) return null
      return op === '-' ? -value : value
    }
    return atom()
  }

  function atom(): number | null {
    const token = next()
    if (token === undefined) return null
    if (token === 'pi') return Math.PI
    if (token === '(') {
      const value = expr()
      if (next() !== ')') return null
      return value
    }
    const n = Number(token)
    return Number.isFinite(n) && /^[0-9.]/.test(token) ? n : null
  }

  const value = expr()
  if (value === null || pos !== tokens.length || !Number.isFinite(value)) return null
  return value
}

function tokenize(text: string): string[] | null {
  const tokens: string[] = []
  const re = /\s*(?:(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|(pi|π)|([-+*/()]))/y
  let index = 0
  const source = text.trim()
  while (index < source.length) {
    re.lastIndex = index
    const m = re.exec(source)
    if (!m) return null
    tokens.push(m[1] ?? (m[2] ? 'pi' : m[3]))
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
