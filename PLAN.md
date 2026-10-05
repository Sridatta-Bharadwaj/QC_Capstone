# QC Capstone — Project Plan

## Problem statement
Develop a tool/app that accepts a multi-qubit quantum circuit, isolates single-qubit
reduced density matrices using partial tracing, and visualizes each qubit's mixed
state on the Bloch sphere.

## Final deliverables
1. **Presentation:** a complete briefing on how the system works (architecture, math pipeline, partial trace, verification).
2. **Live demo** to the professor.

The app must therefore be demo-safe: deployed online **and** runnable locally from a build, with no network dependency at runtime (fonts and icons bundled, no CDNs).

## Concept
A browser app styled like VS Code:

```
┌──────────┬──────────────────────────────────┬──────────────────┐
│ GATES    │  PLAYGROUND (circuit canvas)     │  CODE            │
│ palette  │  drag & drop gates onto wires    │  [QASM] [Qiskit] │
│ + PRESETS│                                  │  (Monaco editor) │
│          ├──────────────────────────────────┴──────────────────┤
│          │ [Bloch Spheres] [Density Matrices] [Partial Trace Steps] [Problems] │
└──────────┴─────────────────────────────────────────────────────┘
 Status bar: qubit count │ entangled qubits │ purity per qubit
```

| Region | VS Code analogue | Content |
|---|---|---|
| Left sidebar | Explorer | Gate palette (drag source) + preset circuits (Bell, GHZ, W, product states) |
| Center | Editor | Circuit canvas: qubit wires, drag/drop gates, add/remove qubit, clear |
| Right panel | Chat panel | Code: **QASM tab (editable, two-way sync)** + **Qiskit tab (read-only, generated)** |
| Bottom panel | Terminal | Tabs: Bloch Spheres · Density Matrices · Partial Trace Steps · Problems |
| Status bar | Status bar | Qubit count, which qubits are entangled, purity per qubit |

Bottom panel must be resizable and default to ~40% height (spheres are the main output).
Clicking a sphere jumps to that qubit's reduced ρ and its derivation.

## Key decisions
| Decision | Choice | Rationale |
|---|---|---|
| Where math runs | Browser, TypeScript, in a **Web Worker** | Live updates on every drop/keystroke with no network latency; UI never freezes; deploys as a static site |
| Verification | Python + Qiskit script comparing results | Independent proof the hand-written math is correct |
| Code language (editable) | **OpenQASM 2.0 subset** | Flat instruction list → clean two-way mapping. Qiskit Python is arbitrary code (loops etc.), can't map back cleanly |
| Qiskit code | Generated, read-only | Gives Python output without the parsing problem |
| Sync architecture | Single **circuit model (JSON)** as source of truth; canvas, editor, math all derive from it | Prevents sync bugs |
| Qubit cap | **6**, as a single config constant (`MAX_QUBITS`) | **Readability/teaching decision, not memory.** Engine is n-agnostic. Real browser limit ≈ 25 qubits (statevector = 2ⁿ complex numbers). Above 6, full ρ (64×64) and step-by-step trace views are unreadable |
| Reduced ρ computation | Two paths: **(a) direct from statevector** (O(2ⁿ) per qubit, used for spheres) and **(b) explicit ρ = \|ψ⟩⟨ψ\| then partial trace** (O(4ⁿ), used for the teaching "steps" view and as a cross-check) | Shows the textbook method while staying efficient |
| Measurement | Not in v1 | Mid-circuit measurement changes the math (pure → mixed via collapse) |

## Design guidelines (must not look AI-generated)
The app should look like a **developer tool**, not a landing page. Reference: VS Code, Figma, Linear.

**Hard rules: never do these**
- ❌ Purple/violet gradients. No gradients on surfaces, buttons or text at all.
- ❌ Glassmorphism, frosted blur, glowing shadows, neon "quantum" glows, particle backgrounds.
- ❌ Emoji or ✨ sparkle icons in the UI.
- ❌ Big pill-shaped buttons, oversized rounded cards (radius > 6px), heavy drop shadows.
- ❌ Marketing copy ("Unleash the power of quantum…"). Labels are plain and technical: "Add qubit", "Reduced density matrix — q1".
- ❌ Centered hero sections or a splash page. The app opens straight into the workspace.

**Do this instead**
- **Neutral surfaces** (greys) with **one restrained accent colour** (e.g. a muted teal or amber), used only for selection, focus and active tabs.
- **Fixed semantic colours** for Bloch axes: x = red, y = green, z = blue (physics convention), used consistently in spheres and matrices.
- **Typography:** IBM Plex Sans (UI) + IBM Plex Mono or JetBrains Mono (code, matrices, numbers). Bundled locally. Tabular numbers for matrices.
- **Icons:** `@vscode/codicons` for UI chrome. Gates drawn as small square boxes with text labels (H, X, Rz), like standard circuit diagrams.
- **Density:** compact, 4px spacing scale, 1px borders, small radius (2–4px). Information-dense, like an IDE.
- **Motion:** minimal and functional (panel resize, hover). No bouncing or decorative animation.

## Theming (light / dark)
- Toggle in the title bar / status bar (codicon sun/moon). Default = OS preference (`prefers-color-scheme`).
- All colours are **CSS variables** (design tokens) defined per theme. No hard-coded colours in components.
- The theme must also switch **Monaco** (`vs` / `vs-dark` or custom themes) and the **Three.js Bloch scene** (background, sphere wireframe, labels).
- Remember the choice in `localStorage` (wrapped in try/catch; falls back to OS preference).
- Both themes must pass contrast checks (WCAG AA for text).

## Skeleton loaders
Use skeletons only where something **actually loads**. Fake loading delays are themselves "AI slop".
| Where | Why it loads | Skeleton |
|---|---|---|
| Code panel | Monaco is ~2 MB and lazy-loaded | Grey lines mimicking code |
| Bloch spheres | Three.js / WebGL init | Circle placeholder per qubit with label bars |
| Bloch spheres / matrices during compute | Worker computing | Shown only if compute takes > ~150 ms (avoids flicker at small n) |
| Density Matrices / Trace Steps tabs | Lazy-loaded tab content | Grid of grey cells |
| Initial app load | JS bundle | Skeleton of the 4-panel layout (not a spinner, not a splash) |

Skeletons are built from one shared `<Skeleton>` component that uses theme tokens and a subtle shimmer that respects `prefers-reduced-motion`.

## Tech stack
- **Vite + React + TypeScript**
- **zustand** — circuit model store
- **@dnd-kit** — drag and drop
- **@monaco-editor/react** — code editor (same editor VS Code uses)
- **react-three-fiber + drei** — 3D Bloch spheres
- **react-resizable-panels** — VS Code-style resizable layout
- **Vitest** — unit tests for the math engine
- **Python + Qiskit** — verification script only (`verify/`)

## Gate set (v1)
Single-qubit: I, H, X, Y, Z, S, S†, T, T†, Rx(θ), Ry(θ), Rz(θ) (angle input)
Multi-qubit: CNOT (CX), CZ, SWAP, Toffoli (CCX)

## Math pipeline (runs in worker on every model change)
1. Circuit model → statevector: start in |0…0⟩, apply each gate's matrix in column order.
2. For each qubit k: reduced ρₖ (2×2) — direct method from amplitudes.
3. ρₖ → Bloch vector r = (Tr(ρₖX), Tr(ρₖY), Tr(ρₖZ)); |r| = 1 pure, |r| < 1 mixed.
4. Extras: purity Tr(ρₖ²), entangled flag (|r| < 1 − ε).
5. For the Density Matrices / Partial Trace Steps tabs: explicit full ρ and traced-out steps.

## Sync rules (two-way code ↔ circuit)
- Every model change is tagged with its **source** (`canvas` | `editor` | `preset`).
- Change from **editor** → update canvas + math, **do not** regenerate editor text (avoids cursor jumps / deleting what the user is typing).
- Change from **canvas/preset** → regenerate editor text (formatting is normalized; comments lost — accepted in v1).
- Editor parse is **debounced ~300 ms**. On parse error: keep last valid circuit, show error in Problems tab + Monaco squiggle.
- Gates from code are auto-placed: each gate goes in the earliest column where all its qubits are free.

## Folder structure (proposed)
```
src/
  engine/        # pure math: complex, gates, simulator, partialTrace, bloch  (no React)
  worker/        # Web Worker wrapper around engine
  model/         # circuit model types + zustand store
  codegen/       # model → QASM, model → Qiskit
  parser/        # QASM → model
  components/
    Sidebar/     # gate palette, presets
    Canvas/      # circuit playground
    CodePanel/   # Monaco, QASM/Qiskit tabs
    BottomPanel/ # Bloch spheres, density matrices, trace steps, problems
    StatusBar/
tests/           # Vitest tests for engine/codegen/parser
verify/          # Python + Qiskit verification script
```

## Milestones (v1)
- **M0 — Setup:** Vite/React/TS project, deps, VS Code-style resizable layout with empty panels, **design tokens (CSS variables) for light + dark**, theme toggle, bundled fonts + codicons, shared `<Skeleton>` component.
- **M1 — Math engine:** complex numbers, gate matrices, statevector simulator, reduced ρ (both methods), Bloch vector, purity. Vitest tests on known states (|0⟩, |+⟩, Bell, GHZ, product states).
- **M2 — Qiskit verification:** Python script runs same circuits (incl. random ones) in Qiskit, compares reduced ρ with engine output. ⚠ Qiskit uses little-endian qubit ordering.
- **M3 — Circuit model + canvas:** zustand store, gate palette, drag/drop onto wires, multi-qubit gate placement (control/target), angle input for rotations, add/remove qubit (≤ MAX_QUBITS), delete/move gates, presets.
- **M4 — Bloch spheres:** react-three-fiber sphere per qubit, vector arrow, axes labels, (x,y,z), |r|, purity. Click → select qubit.
- **M5 — Web Worker:** move engine into worker, wire to store, "computing…" state.
- **M6 — Code generation (one-way):** model → QASM and → Qiskit in Monaco. ✅ *Minimum complete project after this milestone.*
- **M7 — Two-way sync:** QASM parser → model, source tagging, debounce, Problems tab, auto-placement.
- **M8 — Teaching views:** Density Matrices tab, Partial Trace Steps tab (per selected qubit), status bar.
- **M9 — Polish & ship:** skeleton loaders wired in everywhere listed above, presets with descriptions, empty states, design review against the guidelines (both themes), deploy (GitHub Pages/Vercel), README.
- **M10 — Presentation & demo prep:** slide deck explaining the architecture, math pipeline, partial trace and verification; a scripted demo flow (e.g. single qubit → superposition → Bell state, where spheres shrink to the centre → GHZ → typing QASM live → theme toggle); backup plan (local build that runs offline, plus a screen recording of the demo).

## After v1 works
v1 is a checkpoint, not the end. Once the product works end to end:
1. Review it and pick stretch goals to plan and implement next.
2. Revisit the UI based on how the real product looks and feels. Layout and visual changes are expected at this point.

## Stretch goals (v2+)
**Tier 1 — natural next steps**
1. Measurement gates (mid-circuit collapse → mixed states, outcome histogram)
2. Step-through debugger: slider to view spheres after each circuit column
3. Rotation-angle sliders with live Bloch vector animation
4. Shareable URLs (circuit encoded in link) + PNG export

**Tier 2 — deeper physics**
5. Noise models (depolarizing, dephasing, amplitude damping) — needs a density-matrix simulator
6. Entanglement metrics: von Neumann entropy, two-qubit reduced ρ, concurrence
7. Real IBM hardware: state tomography to reconstruct reduced ρ from real measurements, compare vs ideal

**Tier 3 — editor polish**
8. Formatting-preserving sync (insert lines instead of regenerating)
9. Qiskit Python → circuit via Pyodide
10. Undo/redo, save/load .qasm files, guided tutorial mode
11. Raise cap with WASM performance pass

## Report talking points (collect as you go)
- Why the cap is 6 (readability) vs the real limit (~25, exponential 2ⁿ) — and why that limit is the reason quantum hardware matters.
- Direct O(2ⁿ) reduced-ρ method vs textbook O(4ⁿ) partial trace; same result, verified.
- Qiskit cross-verification results.
- Why QASM (not Python) for two-way sync.
