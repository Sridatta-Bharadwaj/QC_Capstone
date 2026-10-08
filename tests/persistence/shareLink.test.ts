import { describe, expect, it } from 'vitest'
import { circuitsEqual } from '../../src/model/circuit'
import { PRESETS } from '../../src/model/presets'
import { INITIAL_STATES, MAX_OPERATIONS, MAX_URL_BYTES, type Circuit } from '../../src/model/types'
import { decodeBase64Url, encodeBase64Url } from '../../src/persistence/base64url'
import {
  decodeCircuitHash,
  encodeCircuitHash,
  HASH_PREFIX,
  isCircuitHash,
  shareUrl,
  toCompact,
} from '../../src/persistence/shareLink'
import { mulberry32, randomCircuit } from '../engine/helpers'

/** `#c=` + base64url of an arbitrary JSON string (to craft hostile links). */
const hashOf = (json: string) => HASH_PREFIX + encodeBase64Url(json)

function roundTrip(c: Circuit): Circuit {
  const encoded = encodeCircuitHash(c)
  if ('error' in encoded) throw new Error(encoded.error)
  expect(isCircuitHash(encoded.hash)).toBe(true)
  const decoded = decodeCircuitHash(encoded.hash)
  if ('error' in decoded) throw new Error(decoded.error)
  return decoded.circuit
}

function expectError(hash: string): string {
  const result = decodeCircuitHash(hash)
  expect('error' in result, JSON.stringify(result)).toBe(true)
  return (result as { error: string }).error
}

describe('base64url', () => {
  it('round-trips UTF-8 text, including non-ASCII', () => {
    for (const text of ['', 'a', 'ab', 'abc', '{"x":"|ψ⟩ ⊗ π"}', '\u{1F600}'.repeat(3)]) {
      const encoded = encodeBase64Url(text)
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(decodeBase64Url(encoded)).toBe(text)
    }
  })

  it('rejects characters outside the base64url alphabet, padding and bad lengths', () => {
    expect(decodeBase64Url('ab+c')).toBeNull()
    expect(decodeBase64Url('ab/c')).toBeNull()
    expect(decodeBase64Url('YQ==')).toBeNull()
    expect(decodeBase64Url('a b')).toBeNull()
    expect(decodeBase64Url('abcde')).toBeNull() // length 1 mod 4
  })

  it('rejects malformed UTF-8', () => {
    // 0xff is never valid in UTF-8.
    expect(decodeBase64Url('_w')).toBeNull()
  })
})

describe('shareable link: encode/decode', () => {
  it.each(PRESETS.map((p) => [p.id, p.circuit] as const))('round-trips preset %s', (_, c) => {
    expect(circuitsEqual(roundTrip(c), c)).toBe(true)
  })

  it('round-trips 200 random circuits with random initial states', () => {
    const rand = mulberry32(42)
    for (let i = 0; i < 200; i++) {
      const n = 1 + Math.floor(rand() * 6)
      const c = randomCircuit(rand, n, Math.floor(rand() * 25))
      c.initialStates = c.initialStates.map(
        () => INITIAL_STATES[Math.floor(rand() * INITIAL_STATES.length)],
      )
      const back = roundTrip(c)
      expect(circuitsEqual(back, c)).toBe(true)
      // Angles survive exactly (JSON keeps full double precision).
      for (const op of c.operations) {
        if (op.angle === undefined) continue
        const match = back.operations.find((o) => o.column === op.column && o.gate === op.gate)
        expect(match?.angle).toBe(op.angle)
      }
    }
  })

  it('uses compact keys and omits all-|0⟩ initial states', () => {
    const preset = PRESETS[0].circuit
    const compact = toCompact({ ...preset, initialStates: preset.initialStates.map(() => '0') })
    expect(Object.keys(compact).sort()).toEqual(['n', 'o', 'v'])
    expect(toCompact({ numQubits: 1, initialStates: ['+'], operations: [] }).s).toEqual(['+'])
  })

  it('refuses to encode a circuit whose link would exceed MAX_URL_BYTES', () => {
    const rand = mulberry32(7)
    const big = randomCircuit(rand, 6, MAX_OPERATIONS)
    const result = encodeCircuitHash(big)
    expect('error' in result).toBe(true)
    expect((result as { error: string }).error).toMatch(/too large/)
  })

  it('builds the share URL from the current page, replacing any hash', () => {
    expect(shareUrl('#c=abc', 'http://x/app/?q=1#old')).toBe('http://x/app/?q=1#c=abc')
    expect(shareUrl('#c=abc', 'file:///D:/dist/index.html')).toBe(
      'file:///D:/dist/index.html#c=abc',
    )
  })
})

describe('shareable link: hostile input', () => {
  it('rejects an oversize hash before decoding it', () => {
    const hash = HASH_PREFIX + 'A'.repeat(MAX_URL_BYTES)
    expect(expectError(hash)).toMatch(/too large/)
  })

  it('rejects malformed base64url', () => {
    expect(expectError('#c=not*base64')).toMatch(/base64url/)
    expect(expectError('#c=abcde')).toMatch(/base64url/)
  })

  it('rejects bad JSON', () => {
    expect(expectError(hashOf('{"v":1,'))).toMatch(/JSON/)
    expect(expectError(hashOf('undefined'))).toMatch(/JSON/)
  })

  it('rejects a wrong or missing version', () => {
    expect(expectError(hashOf('{"v":2,"n":1,"o":[]}'))).toMatch(/version/)
    expect(expectError(hashOf('{"n":1,"o":[]}'))).toMatch(/version/)
  })

  it('rejects non-objects and malformed gates', () => {
    for (const json of ['null', '[]', '42', '"c"', '{"v":1,"n":1,"o":{}}']) {
      expectError(hashOf(json))
    }
    expect(expectError(hashOf('{"v":1,"n":1,"o":[["H",0]]}'))).toMatch(/malformed/)
    expect(expectError(hashOf('{"v":1,"n":1,"o":["H"]}'))).toMatch(/malformed/)
  })

  it('rejects valid JSON that is not a valid circuit', () => {
    const cases = [
      '{"v":1,"n":0,"o":[]}', // no qubits
      '{"v":1,"n":7,"o":[]}', // above MAX_QUBITS
      '{"v":1,"n":2,"o":[["FOO",0,[0]]]}', // unknown gate
      '{"v":1,"n":2,"o":[["H",0,[5]]]}', // qubit out of range
      '{"v":1,"n":2,"o":[["RX",0,[0]]]}', // missing angle
      '{"v":1,"n":2,"o":[["H",0,[0]],["X",0,[0]]]}', // overlap
      '{"v":1,"n":2,"o":[["CX",0,[1,1]]]}', // repeated qubit
      '{"v":1,"n":2,"s":["0"],"o":[]}', // wrong number of initial states
      '{"v":1,"n":1,"s":["2"],"o":[]}', // unknown initial state
    ]
    for (const json of cases) expect(expectError(hashOf(json)), json).toMatch(/not a valid/)
  })

  it('rejects too many gates', () => {
    const ops = Array.from({ length: MAX_OPERATIONS + 1 }, (_, i) => ['H', i, [0]])
    expect(decodeCircuitHash(hashOf(JSON.stringify({ v: 1, n: 1, o: ops })))).toHaveProperty(
      'error',
    )
  })

  it('rejects prototype-pollution keys without polluting anything', () => {
    const cases = [
      '{"v":1,"n":1,"o":[],"__proto__":{"polluted":true}}',
      '{"v":1,"n":1,"o":[],"constructor":{"prototype":{"polluted":true}}}',
      '{"__proto__":{"v":1,"n":1,"o":[]}}',
    ]
    for (const json of cases) expect(expectError(hashOf(json)), json).toMatch(/unexpected/)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('never throws on random garbage', () => {
    const rand = mulberry32(3)
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    for (let i = 0; i < 300; i++) {
      const len = Math.floor(rand() * 200)
      let s = ''
      for (let j = 0; j < len; j++) s += alphabet[Math.floor(rand() * alphabet.length)]
      expect(() => decodeCircuitHash(HASH_PREFIX + s)).not.toThrow()
    }
  })
})
