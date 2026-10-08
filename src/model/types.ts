// Circuit model: the single source of truth.
// The canvas, the code editor and the math engine all derive from a `Circuit`.
//
// CONTRACT FILE: other modules code against these types. Change only on `main`.

/** Readability/teaching cap, not a memory limit. The engine itself is n-agnostic. */
export const MAX_QUBITS = 6

/** Default qubit count for a fresh workspace. */
export const DEFAULT_QUBITS = 2

// Security limits (PLAN.md → v2 → Security rules). Every loader and parser enforces these.
/** At most this many operations per circuit (canvas, parsers, files, URL, localStorage). */
export const MAX_OPERATIONS = 500
/** Uploaded files larger than this are rejected before reading. */
export const MAX_UPLOAD_BYTES = 100 * 1024
/** The `#c=…` part of a shareable URL may be at most this long. */
export const MAX_URL_BYTES = 8 * 1024

/** Single-qubit gates without parameters. `Sdg` = S†, `Tdg` = T†. */
export type FixedSingleQubitGate = 'I' | 'H' | 'X' | 'Y' | 'Z' | 'S' | 'Sdg' | 'T' | 'Tdg'

/** Single-qubit rotations about the x, y, z axes. Need an angle (radians). */
export type RotationGate = 'RX' | 'RY' | 'RZ'

/** Multi-qubit gates. */
export type MultiQubitGate = 'CX' | 'CZ' | 'SWAP' | 'CCX'

export type GateType = FixedSingleQubitGate | RotationGate | MultiQubitGate

/**
 * One gate placed on the circuit.
 *
 * Qubit order inside `qubits`:
 *  - single-qubit gates: `[target]`
 *  - CX, CZ:             `[control, target]`   (CZ is symmetric, but we keep the convention)
 *  - CCX (Toffoli):      `[control1, control2, target]`
 *  - SWAP:               `[a, b]`
 *
 * A multi-qubit gate occupies every wire between its lowest and highest qubit
 * in its column (the vertical line crosses them), so no other gate may sit there.
 */
export interface Operation {
  /** Stable unique id (used as React key and for move/delete). */
  id: string
  gate: GateType
  /** Time step on the canvas, 0-based. Gates are applied in increasing column order. */
  column: number
  /** Qubit indices this gate acts on, see ordering above. All distinct, each in [0, numQubits). */
  qubits: number[]
  /** Rotation angle in radians. Required for RX/RY/RZ, absent otherwise. */
  angle?: number
}

/**
 * The single-qubit state a wire starts in (before any gate). The circuit starts in
 * the product state of these, e.g. ['+', '0'] = |+⟩ ⊗ |0⟩.
 *   '0' = |0⟩, '1' = |1⟩, '+' = (|0⟩+|1⟩)/√2, '-' = (|0⟩−|1⟩)/√2,
 *   'i' = (|0⟩+i|1⟩)/√2, '-i' = (|0⟩−i|1⟩)/√2
 */
export type InitialState = '0' | '1' | '+' | '-' | 'i' | '-i'

/** All initial states, in menu order. */
export const INITIAL_STATES: readonly InitialState[] = ['0', '1', '+', '-', 'i', '-i']

export const DEFAULT_INITIAL_STATE: InitialState = '0'

export interface Circuit {
  /** 1..MAX_QUBITS */
  numQubits: number
  /** Start state of each wire; length === numQubits. All '0' = the v1 behaviour |0…0⟩. */
  initialStates: InitialState[]
  /** Order in this array is not meaningful; `column` defines time order. At most MAX_OPERATIONS. */
  operations: Operation[]
}

/**
 * Who made a model change. Drives the two-way sync rules (PLAN.md → v2 → V2-0 / V2-1):
 * each code tab regenerates its text for every source except its own.
 *  - 'qasm'    → edit in the QASM tab: QASM text kept, Qiskit tab regenerated
 *  - 'qiskit'  → edit in the Qiskit tab: Qiskit text kept, QASM tab regenerated
 *  - 'canvas' | 'preset' | 'file' | 'url' | 'history' | 'restore' → both tabs regenerate
 *    ('restore' = loaded from localStorage at startup, 'history' = undo/redo,
 *     'file' = opened file, 'url' = shareable link)
 */
export type ChangeSource =
  'canvas' | 'qasm' | 'qiskit' | 'preset' | 'file' | 'url' | 'history' | 'restore'

/** The two code tabs. */
export type CodeTab = 'qasm' | 'qiskit'

/** Static metadata about each gate. */
export interface GateInfo {
  /** Label drawn in the gate box / palette, e.g. "H", "S†", "Rx". */
  label: string
  /** Number of qubits the gate acts on. */
  arity: 1 | 2 | 3
  /** True for RX/RY/RZ (needs `angle`). */
  parametric: boolean
  /** Number of control qubits (leading entries of `Operation.qubits`). */
  controls: 0 | 1 | 2
  /** Short plain-language description for tooltips. */
  description: string
}

export const GATES: Record<GateType, GateInfo> = {
  I: { label: 'I', arity: 1, parametric: false, controls: 0, description: 'Identity' },
  H: { label: 'H', arity: 1, parametric: false, controls: 0, description: 'Hadamard' },
  X: { label: 'X', arity: 1, parametric: false, controls: 0, description: 'Pauli-X (NOT)' },
  Y: { label: 'Y', arity: 1, parametric: false, controls: 0, description: 'Pauli-Y' },
  Z: { label: 'Z', arity: 1, parametric: false, controls: 0, description: 'Pauli-Z' },
  S: { label: 'S', arity: 1, parametric: false, controls: 0, description: 'Phase (√Z)' },
  Sdg: { label: 'S†', arity: 1, parametric: false, controls: 0, description: 'S-dagger' },
  T: { label: 'T', arity: 1, parametric: false, controls: 0, description: 'π/8 gate (√S)' },
  Tdg: { label: 'T†', arity: 1, parametric: false, controls: 0, description: 'T-dagger' },
  RX: { label: 'Rx', arity: 1, parametric: true, controls: 0, description: 'Rotation about x' },
  RY: { label: 'Ry', arity: 1, parametric: true, controls: 0, description: 'Rotation about y' },
  RZ: { label: 'Rz', arity: 1, parametric: true, controls: 0, description: 'Rotation about z' },
  CX: { label: 'CX', arity: 2, parametric: false, controls: 1, description: 'Controlled-NOT' },
  CZ: { label: 'CZ', arity: 2, parametric: false, controls: 1, description: 'Controlled-Z' },
  SWAP: { label: 'SWAP', arity: 2, parametric: false, controls: 0, description: 'Swap two qubits' },
  CCX: { label: 'CCX', arity: 3, parametric: false, controls: 2, description: 'Toffoli' },
}

export const GATE_TYPES = Object.keys(GATES) as GateType[]

/** A parse/validation problem shown in the Problems tab (and as a Monaco marker). */
export interface Problem {
  message: string
  severity: 'error' | 'warning'
  /** Which code tab the problem came from (shown in the Problems tab; click opens that tab). */
  tab?: CodeTab
  /** 1-based line/column in that tab's source, when known. */
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
}
