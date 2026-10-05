// Syntax highlighting for OpenQASM 2.0 in Monaco (a Monarch tokenizer: regex rules → token names).
// Pure data, no Monaco runtime import, so it can be unit-tested in Node.
import type { languages } from 'monaco-editor/editor/editor.api'
import { QASM_GATE_NAMES } from '../../codegen/qasm'

export const QASM_LANGUAGE_ID = 'qasm'

export const QASM_KEYWORDS = [
  'OPENQASM',
  'include',
  'qreg',
  'creg',
  'gate',
  'opaque',
  'measure',
  'reset',
  'barrier',
  'if',
]

/** Gates the app writes, plus the other qelib1.inc / built-in names so pasted code still reads well. */
export const QASM_GATES = [
  ...new Set([
    ...Object.values(QASM_GATE_NAMES),
    'U',
    'CX',
    'u1',
    'u2',
    'u3',
    'cy',
    'ch',
    'crz',
    'cu1',
    'cu3',
    'cswap',
    'rxx',
    'rzz',
  ]),
]

export const qasmMonarch: languages.IMonarchLanguage = {
  defaultToken: '',
  keywords: QASM_KEYWORDS,
  gates: QASM_GATES,
  constants: ['pi'],
  tokenizer: {
    root: [
      [/\/\/.*$/, 'comment'],
      [/"[^"]*"/, 'string'],
      [
        /[A-Za-z_]\w*/,
        {
          cases: {
            '@keywords': 'keyword',
            '@gates': 'gate',
            '@constants': 'constant',
            '@default': 'identifier',
          },
        },
      ],
      [/\d*\.\d+(?:[eE][-+]?\d+)?/, 'number.float'],
      [/\d+(?:\.\d*)?(?:[eE][-+]?\d+)?/, 'number'],
      [/[[\](),;]/, 'delimiter'],
      [/->|[-+*/^]|==/, 'operator'],
      [/\s+/, 'white'],
    ],
  },
}

export const qasmLanguageConfig: languages.LanguageConfiguration = {
  comments: { lineComment: '//' },
  brackets: [
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
  ],
  autoClosingPairs: [
    { open: '(', close: ')' },
    { open: '[', close: ']' },
    { open: '{', close: '}' },
    { open: '"', close: '"' },
  ],
}
