# QC Capstone — Reduced density matrices on the Bloch sphere

A browser tool that takes a multi-qubit quantum circuit, simulates it, isolates each qubit's
reduced density matrix ρₖ by partial tracing, and shows every qubit's (possibly mixed) state on
its own Bloch sphere. A pure, unentangled qubit sits on the sphere surface; a qubit entangled with
the rest is mixed and its Bloch vector shrinks inside the sphere (to the centre for a Bell pair).
The UI is laid out like an IDE: gate palette, circuit canvas, code editor, output panel.

![Workspace with a Bell state, light theme](docs/screenshots/workspace-bell-light.png)

## Features

- **Circuit canvas**: drag gates from the palette onto qubit wires, move and delete them, edit
  control/target qubits and rotation angles (`pi/2`, `-3*pi/4`, `0.25`), add or remove qubits
  (1–6).
- **Gate set**: I, H, X, Y, Z, S, S†, T, T†, Rx(θ), Ry(θ), Rz(θ), CX, CZ, SWAP, CCX (Toffoli).
- **Presets**: |+⟩, a product state, a partially entangled pair, Bell Φ⁺, GHZ, W.
- **Bloch spheres**: one per qubit, with (x, y, z), |r| and purity Tr(ρ²). Fixed axis colours
  x = red, y = green, z = blue.
- **Code panel**: OpenQASM 2.0 (editable, two-way sync with the canvas) and Qiskit Python
  (generated, read-only, runnable).
- **Problems tab**: QASM parse errors with exact line/column, editor squiggles, click to jump.
  On an error the last valid circuit is kept.
- **Density Matrices tab**: reduced ρₖ, the Bloch vector read off it, purity, and the full
  ρ = |ψ⟩⟨ψ| (up to 4 qubits); hovering an entry of ρₖ outlines the full-ρ entries it is summed
  from.
- **Partial Trace Steps tab**: the textbook partial trace for the selected qubit, step by step,
  with a check that it equals the fast direct method.
- **Status bar**: qubit count, entangled qubits, purity per qubit.
- Light and dark themes (follows the OS until you choose), skeleton loaders only where something
  actually loads, and no network access at runtime.

| Density matrices (dark)                                               | Partial trace steps (dark)                                                   |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| ![Density Matrices tab, W state](docs/screenshots/density-w-dark.png) | ![Partial Trace Steps tab, W state](docs/screenshots/trace-steps-w-dark.png) |

![QASM with errors in the Problems tab](docs/screenshots/qasm-problems-light.png)

## Running locally

Requirements: Node.js 20 or newer (developed on Node 24), npm.

```sh
npm ci
npm run dev            # development server, http://localhost:5173
```

Production build, served locally. Fonts, icons, Monaco, three.js and the Web Workers are all
bundled, so this works with no internet connection:

```sh
npm run build
npm run preview        # http://localhost:4173
```

Checks (the same ones CI runs on every push):

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

Deployment is not set up yet.

## Verification against Qiskit

`verify/` runs the same circuits in Qiskit and compares them with this app's engine: 137 fixed
circuits (presets, basis states, Bell and GHZ states, every gate, rotations, Toffoli layouts) and
240 seeded random circuits of 1–6 qubits. All 377 agree: the largest difference in any reduced
density matrix entry is 2.1 × 10⁻¹⁵ (Qiskit 2.5.2).

```sh
python -m venv verify/.venv
verify/.venv/Scripts/python -m pip install -r verify/requirements.txt   # macOS/Linux: verify/.venv/bin/python
npm run verify
```

See [verify/README.md](verify/README.md) for details, including qubit ordering.

## How it works

**One source of truth.** The circuit is a plain JSON model (`src/model/types.ts`) held in a
zustand store. The canvas, the QASM/Qiskit code and the math are all derived from it. Every
change is tagged with its source (`canvas`, `editor`, `preset`): edits typed in the editor update
the canvas and the math but never rewrite the editor text; canvas and preset changes regenerate
the code.

**Math pipeline** (`src/engine/`, pure TypeScript, runs in a Web Worker):

1. Statevector simulation from |0…0⟩, applying gates column by column.
2. For each qubit, the reduced density matrix ρₖ (2×2) by the **direct method**:
   ρₖ[a][b] = Σ ψ(a, rest) · conj(ψ(b, rest)) over the other qubits' basis states. This is O(2ⁿ).
3. Bloch vector r = (2·Re ρ₀₁, −2·Im ρ₀₁, ρ₀₀ − ρ₁₁), length |r|, purity Tr(ρₖ²). A qubit is
   flagged as entangled when |r| < 1.
4. For the teaching tabs, the **explicit method**: build the full ρ = |ψ⟩⟨ψ| (2ⁿ×2ⁿ) and trace
   out the other qubits. This is O(4ⁿ). Both methods are tested to agree to 10⁻¹⁰.

The worker keeps the UI responsive; stale results are dropped, and a "computing" state appears
only if a result takes longer than 150 ms.

**Qubit ordering.** The engine uses the textbook (big-endian) convention: a basis state reads
|q0 q1 … qₙ₋₁⟩, so q0 is the most significant bit. Qiskit is little-endian (q0 is the least
significant bit); the verification script accounts for this.

**Why at most 6 qubits.** This is a readability choice, not a memory limit: the engine works for
any n. A statevector has 2ⁿ entries, so a browser could handle roughly 25 qubits, but past 6 the
full density matrix (64×64) and the step-by-step trace stop being readable. That exponential
growth is also the reason quantum hardware is interesting at all.

**Why QASM is the editable language.** OpenQASM 2.0 is a flat list of instructions, so it maps
to and from the circuit model cleanly. Qiskit Python can contain arbitrary code (loops,
functions), so it is generated read-only.

## Project structure

```
src/
  engine/       statevector simulator, partial trace (direct + explicit), Bloch vector, purity
  worker/       Web Worker wrapper around the engine and the store bridge
  model/        circuit types, zustand stores, placement helpers, presets, angle parsing
  codegen/      circuit → OpenQASM 2.0, circuit → Qiskit Python
  parser/       OpenQASM 2.0 subset → circuit, with positioned errors
  components/   Sidebar, Canvas, CodePanel (Monaco), Bloch, Teaching, BottomPanel, StatusBar
  styles/       design tokens (light/dark CSS variables) and global styles
tests/          Vitest tests for the engine, parser, codegen, sync, canvas and UI panels
verify/         Python + Qiskit cross-check of the engine
```

## Tech stack

Vite, React, TypeScript, zustand, @dnd-kit, Monaco editor, three.js with react-three-fiber and
drei, react-resizable-panels, IBM Plex Sans/Mono and VS Code codicons (bundled), Vitest,
ESLint, Prettier. Verification: Python, Qiskit, NumPy.
