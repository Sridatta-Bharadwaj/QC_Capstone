# Qiskit verification (M2)

Independent check that the app's TypeScript math engine (`src/engine/`) computes
the right statevectors and single-qubit reduced density matrices.

## What it proves

For 377 circuits (all presets, hand-picked known states, every gate in several
layouts, and 240 seeded random circuits on 1–6 qubits), the engine and
[Qiskit](https://www.ibm.com/quantum/qiskit) agree on:

1. **Reduced density matrix ρₖ of every qubit.** Engine: direct method from
   the amplitudes. Qiskit: `partial_trace(state, [all other qubits])`.
2. **The full statevector**, after converting between the two qubit orderings
   (see [Endianness](#endianness)).
3. **Bloch vector** r = (Tr(ρX), Tr(ρY), Tr(ρZ)) and **purity** Tr(ρ²).

Tolerance: max absolute difference ≤ 1e-9 per entry. The observed differences
are around 1e-15, which is floating-point rounding.

### Why it is independent

- The two sides share no code. Qiskit has its own gate definitions, its own
  simulator (`Statevector`) and its own `partial_trace`, written by IBM in
  Python and Rust.
- The only thing passed between them is the circuit description (gate name,
  qubits, angle, column). The Python script rebuilds each circuit with Qiskit's
  own `QuantumCircuit` methods (`h`, `cx`, `rz`, ...).
- The random circuits use seeded random gates, qubits (in random control/target
  order) and angles in [−2π, 2π). Gates share columns, and the operations array
  is shuffled, so both sides must apply the same time ordering (by column, then
  by lowest qubit).
- A negative control: with the endianness fix disabled, 198 of the 377
  statevectors mismatch. The comparison really does detect errors.

## How to run

Requires Node (already set up for the app) and Python 3.10+.

```bash
# 1. one-time: create the virtual environment and install Qiskit
python -m venv verify/.venv

# activate it
verify\.venv\Scripts\activate         # Windows (cmd / PowerShell)
source verify/.venv/Scripts/activate  # Windows (Git Bash)
source verify/.venv/bin/activate      # macOS / Linux

pip install -r verify/requirements.txt

# 2. export the engine's results -> verify/out/engine_results.json
npm run verify:export

# 3. compare with Qiskit (exit code 1 if anything differs)
python verify/verify.py
```

Or run steps 2 and 3 together with `npm run verify`. This works on every OS and
uses `verify/.venv`'s Python automatically, so you do not need to activate the venv.

`verify/.venv/` and `verify/out/` are gitignored.

| File               | Role                                                               |
| ------------------ | ------------------------------------------------------------------ |
| `export-engine.ts` | Builds the test circuits, runs the engine (`analyze`), writes JSON |
| `verify.py`        | Rebuilds each circuit in Qiskit and compares; prints the table     |
| `run-python.ts`    | Cross-platform launcher used by `npm run verify`                   |
| `requirements.txt` | Pinned `qiskit` and `numpy` versions used for the results below    |

## Endianness

Both programs call the qubits q0, q1, …, q(n−1). They disagree on **where each
qubit's bit sits in the index of the 2ⁿ amplitudes**:

|        | Ordering                                                  | Bit of qubit k in basis index i |
| ------ | --------------------------------------------------------- | ------------------------------- |
| Engine | big-endian (textbook): q0 is the **most** significant bit | `(i >> (n − 1 − k)) & 1`        |
| Qiskit | little-endian: q0 is the **least** significant bit        | `(i >> k) & 1`                  |

**Example**, 2 qubits, X on q1, so q0 = 0 and q1 = 1:

|        | Written as       | Amplitude 1 at index |
| ------ | ---------------- | -------------------- |
| Engine | \|q0 q1⟩ = \|01⟩ | `0b01` = **1**       |
| Qiskit | \|q1 q0⟩ = \|10⟩ | `0b10` = **2**       |

The physical state is the same, but it sits at a different position in the
array. To compare statevectors, `verify.py` reverses the bit string of every
Qiskit index (`to_big_endian`). This is the same as Qiskit's
`Statevector.reverse_qargs()`. The script also asserts this exact |01⟩ example
at start-up (`endianness_self_test`).

**Reduced density matrices need no conversion.** `partial_trace` takes qubit
_labels_, and q1 means the same qubit in both programs. A single-qubit ρ is
just a 2×2 matrix in that qubit's own |0⟩, |1⟩ basis, so there is no bit order
left to disagree about.

There is also no global-phase adjustment. The engine's gate matrices match
Qiskit's conventions (e.g. Rz(θ) = diag(e^{−iθ/2}, e^{iθ/2})), so the
statevectors agree exactly, not only up to a phase.

## Results

Run on 2026-10-06 with Qiskit 2.5.2, numpy 2.5.3, Python 3.13 (Windows 11),
random seed 20261006, tolerance 1e-9.

| Category                                             | Circuits |   max \|Δρ\| |   max \|Δψ\| |   max \|Δr\| | max \|Δpurity\| | Result   |
| ---------------------------------------------------- | -------: | -----------: | -----------: | -----------: | --------------: | -------- |
| presets                                              |        5 |     8.88e-16 |     2.22e-16 |     8.88e-16 |        1.78e-15 | PASS     |
| single-qubit states (\|0⟩ \|1⟩ \|+⟩ \|−⟩ \|i⟩ \|−i⟩) |        6 |     2.22e-16 |     1.11e-16 |     4.44e-16 |        8.88e-16 | PASS     |
| Bell states (Φ±, Ψ±)                                 |        4 |     2.22e-16 |     1.11e-16 |     0.00e+00 |        4.44e-16 | PASS     |
| GHZ (3–6 qubits)                                     |        4 |     2.22e-16 |     1.11e-16 |     0.00e+00 |        4.44e-16 | PASS     |
| single gates (each fixed gate, 3 settings)           |       27 |     3.33e-16 |     2.22e-16 |     4.44e-16 |        9.99e-16 | PASS     |
| rotations (Rx/Ry/Rz × 11 angles × 2 inputs)          |       66 |     4.44e-16 |     2.22e-16 |     4.44e-16 |        1.22e-15 | PASS     |
| CX layouts                                           |        6 |     4.44e-16 |     1.11e-16 |     4.44e-16 |        8.88e-16 | PASS     |
| CZ layouts                                           |        4 |     8.88e-16 |     3.33e-16 |     8.88e-16 |        1.78e-15 | PASS     |
| SWAP layouts                                         |        5 |     4.44e-16 |     1.11e-16 |     4.44e-16 |        8.88e-16 | PASS     |
| Toffoli layouts                                      |       10 |     6.66e-16 |     2.22e-16 |     5.55e-16 |        1.11e-15 | PASS     |
| random n=1                                           |       40 |     1.44e-15 |     7.71e-16 |     1.33e-15 |        3.11e-15 | PASS     |
| random n=2                                           |       40 |     1.22e-15 |     5.58e-16 |     1.33e-15 |        3.00e-15 | PASS     |
| random n=3                                           |       40 |     1.55e-15 |     5.98e-16 |     1.55e-15 |        3.33e-15 | PASS     |
| random n=4                                           |       40 |     1.33e-15 |     2.78e-16 |     1.33e-15 |        2.66e-15 | PASS     |
| random n=5                                           |       40 |     1.55e-15 |     4.97e-16 |     1.78e-15 |        3.66e-15 | PASS     |
| random n=6                                           |       40 |     2.11e-15 |     5.66e-16 |     2.11e-15 |        4.22e-15 | PASS     |
| **Total**                                            |  **377** | **2.11e-15** | **7.71e-16** | **2.11e-15** |    **4.22e-15** | **PASS** |

Random circuits have 1–24 gates each, drawn from all 16 gate types (CCX only
when n ≥ 3, two-qubit gates only when n ≥ 2).
