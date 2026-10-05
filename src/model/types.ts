// Circuit model: the single source of truth.
// The canvas, the code editor and the math engine all derive from a `Circuit`.
//
// CONTRACT FILE: other modules code against these types. Change only on `main`.

/** Readability/teaching cap, not a memory limit. The engine itself is n-agnostic. */
export const MAX_QUBITS = 6

/** Default qubit count for a fresh workspace. */
export const DEFAULT_QUBITS = 2

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

export interface Circuit {
  /** 1..MAX_QUBITS */
  numQubits: number
  /** Order in this array is not meaningful; `column` defines time order. */
  operations: Operation[]
}

/**
 * Who made a model change. Drives the two-way sync rules (PLAN.md → Sync rules):
 *  - 'editor'  → update canvas + math, do NOT regenerate editor text
 *  - 'canvas' / 'preset' → regenerate editor text
 */
export type ChangeSource = 'canvas' | 'editor' | 'preset'

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
  /** 1-based line/column in the QASM source, when known. */
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
}
