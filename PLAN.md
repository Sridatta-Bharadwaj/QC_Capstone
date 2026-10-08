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

---

# v2

## Goal
Turn v1 into the version that gets deployed and shown to the professor: both code tabs editable, file upload/download, demo safety (autosave, undo, shareable links), stronger teaching (initial states, step-through, live rotations, multi-qubit partial trace), and the UI fixes found in the v1 review. After v2 comes a **security audit + production-readiness pass**, then **deployment**, so all v2 code must already follow the security rules below.

## Priority (if time runs out, ship in this order)
1. V2-1 Editable Qiskit tab
2. V2-8 UI fixes
3. V2-4 Autosave, undo/redo, shareable URL
4. V2-2 Initial-state picker
5. V2-3 Upload / download
6. V2-5 Step-through debugger
7. V2-6 Rotation sliders + animated Bloch vectors
8. V2-7 Keep-any-subset partial trace

## Security rules (apply to every v2 milestone; audited afterwards)
- **Never** use `eval`, `new Function`, or `setTimeout(string)`. The angle evaluator is a hand-written tokenizer + recursive-descent parser.
- **Never** render user-controlled text as HTML (`dangerouslySetInnerHTML`, `innerHTML`). Text from files, the URL, localStorage and the editors is rendered as React text nodes only.
- **All external input is untrusted and validated**: uploaded files, the URL hash, localStorage. Validate with a schema (shape, types, ranges, qubit indices < numQubits ≤ MAX_QUBITS, known gate names, finite angles). Invalid input → a clear message, never a crash or a partial state.
- **Size limits**: uploaded files ≤ 100 KB; URL-encoded circuits ≤ 8 KB; at most 500 operations per circuit; parsers bail out with an error past these limits (no unbounded loops or recursion on hostile input).
- Uploaded files are read as text only (`File.text()`), never executed, never sent anywhere.
- No new network requests at runtime; the app must still work fully offline.
- No secrets, tokens or personal data anywhere in the repo.
- New dependencies only if necessary; prefer small, maintained packages; pin versions in package-lock.json.

## V2-0: Contracts (lead, on main first)
- `ChangeSource`: `'canvas' | 'qasm' | 'qiskit' | 'preset' | 'file' | 'url' | 'history' | 'restore'`. Code tabs regenerate for every source except their own (`'qasm'` keeps QASM text, `'qiskit'` keeps Qiskit text).
- `Circuit` gains `initialStates: InitialState[]` (length = numQubits) with `InitialState = '0' | '1' | '+' | '-' | 'i' | '-i'`, default `'0'`. Update helpers, presets, `circuitsEqual`, add/remove qubit.
- Engine API additions (stubs + signatures):
  - `simulate(circuit)` starts from the product state given by `initialStates`.
  - `simulateSteps(circuit) → StepResult[]`: per-qubit Bloch vector, purity and reduced ρ after column 0..lastColumn (step 0 = initial state).
  - `reducedDensityMatrixSubset(state, keep: number[]) → Matrix` (2^k × 2^k), plus `vonNeumannEntropy(rho)`.
- Worker protocol: requests for steps and subset results.
- `src/model/validate.ts`: `validateCircuit(unknown) → { circuit } | { error }`, used by persistence, URL and file loading.
- `src/model/historyStore.ts` interface: `push(circuit, source)`, `undo()`, `redo()`, `canUndo`, `canRedo`.

## V2-1: Editable Qiskit tab (two-way sync for both code tabs)
Both code tabs are editable and stay in sync with the canvas and with each other. Python is never executed: a hand-written parser handles a **straight-line subset** of Qiskit.

**Supported subset**
- `from qiskit import QuantumCircuit`, `from math import pi`, `import numpy as np`, `from numpy import pi`. Other import lines are ignored.
- `<name> = QuantumCircuit(n)` or `QuantumCircuit(n, m)` (classical bits ignored with a warning). Any variable name is allowed. Exactly one circuit.
- Gate calls on that variable, one per line: `h x y z s sdg t tdg id/i rx ry rz cx/cnot cz swap ccx/toffoli`. Qubit args are int literals, or a list literal for single-qubit gates (`qc.h([0, 1, 2])`). Keyword args `qubit=`, `control_qubit=`, `target_qubit=`, `theta=` are accepted.
- Angles: numbers, `pi`, `np.pi`, `math.pi`, `+ - * /`, unary minus, parentheses. **One shared angle evaluator for QASM and Qiskit** (no eval).
- `#` comments and blank lines. `qc.barrier()` → warning, ignored.
- Measurement: a `measure` / `measure_all()` after the last gate on the qubits it measures → **warning, ignored** ("Final measurements ignored: showing the state just before measurement"). Measurement followed by further gates on that qubit → error. (Same rule in QASM, see V2-3.)

**"Analysis tail" rule**
- Only lines that call a method on the circuit variable are interpreted as gates.
- Other top-level lines that don't mutate the circuit (`state = Statevector(qc)`, `rho = [partial_trace(...) for k in ...]`, `print(qc)`, `qc.draw()`) are ignored silently. **`toQiskit` output must parse with zero problems.**
- A gate call on the circuit inside `for` / `while` / `if` / `def` / `with` blocks or a comprehension → error: "Only straight-line Qiskit code is supported: write one gate call per line."
- Using the variable before `QuantumCircuit(...)`, unknown methods, wrong argument counts, out-of-range qubits, more than `MAX_QUBITS` qubits → positioned errors (line + column).

**Sync**
- Edit QASM → canvas, math and the Qiskit tab update; QASM text untouched. Edit Qiskit → canvas, math and the QASM tab update; Qiskit text untouched. Any other source → both tabs regenerate.
- Per tab: own text store, 300 ms debounce, keep last valid circuit on error, "replaced by canvas" notice with Ctrl+Z hint, own Monaco model/undo/cursor.
- Problems tab shows the source tab (`QASM` / `Qiskit`); clicking opens that tab at the position.

**Tests**: parser cases for every form and error; round-trip `parseQiskit(toQiskit(c)) ≡ c` for all presets + ≥200 random circuits; cross-format equivalence with QASM; sync tests (editing one tab regenerates the other, never itself).

## V2-2: Initial-state picker
- Click a wire's `|0⟩` label → small menu: |0⟩ |1⟩ |+⟩ |−⟩ |i⟩ |−i⟩. Keyboard accessible. Label shows the chosen state.
- Engine starts from the chosen product state (no prep gates inside the engine).
- Code: preparation gates in a marked block at the top, after the register declaration:
  - QASM: `// initial states` … `// end initial states`; Qiskit: `# initial states` … `# end initial states`.
  - |1⟩ = `x`; |+⟩ = `h`; |−⟩ = `x` then `h`; |i⟩ = `h` then `s`; |−i⟩ = `h` then `sdg`.
- Both parsers recognise the block and map it back to `initialStates` (so the comments are significant, the one exception to "comments are ignored"). A block containing anything other than a recognised prep sequence per qubit → positioned error. Without markers, the same gates are ordinary operations.
- Extend `verify/` to random initial states (prep gates in Qiskit); engine must still match.
- Presets may set initial states where it teaches something (e.g. "|−⟩ through H").

## V2-3: Upload / download
- Code panel toolbar: **Open file** (codicon `folder-opened`) and **Download** (codicon `cloud-download`, menu). Also drag a file onto the editor.
- Open: `.qasm` → QASM tab, `.py` → Qiskit tab, `.txt` → sniff (`OPENQASM` header → QASM, else Qiskit). Text goes into that tab and parses through the normal sync (source `'file'`). Enforce the 100 KB limit and the security rules.
- QASM parser extensions for real-world files:
  - final measurements ignored with a warning (rule in V2-1); `creg`, `barrier` stay warnings;
  - `gate name(params) args { ... }` definitions are expanded inline (recursion depth limit 16, expansion limit = the 500-op cap);
  - `OPENQASM 3` → clear error: "OpenQASM 3.0 is not supported yet. Export as OpenQASM 2.0.";
  - `qreg` larger than MAX_QUBITS → clear error naming the limit.
- Download: `circuit.qasm`, `circuit.py`, and **Bloch spheres as PNG** (all qubit cards composed into one image with labels and values, current theme background). Filenames include a timestamp.
- Tests: fixtures of real Qiskit-exported QASM 2.0 files (with measure/creg/barrier/gate defs), QASM 3 rejection, size-limit rejection, hostile input (deeply nested parentheses, huge numbers, 10k lines) fails fast with an error.

## V2-4: Autosave, undo/redo, shareable URL
- **Autosave**: circuit saved to localStorage (debounced 500 ms, versioned key `qc-capstone:circuit:v2`, try/catch everywhere). On load: URL hash (if present) > saved circuit > default. Saved data goes through `validateCircuit`; if invalid, discard it and show a small notice.
- **Undo/redo** for the circuit model: history entries for canvas, preset, file, url and committed editor parses (one entry per debounced parse, not per keystroke). Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z when focus is **not** inside Monaco (Monaco keeps its own text undo). Toolbar buttons with disabled states. Cap of 100 entries.
- **New circuit** button (clears to 2 qubits, all |0⟩), undoable.
- **Shareable URL**: "Copy link" encodes the circuit as `#c=<base64url(JSON)>` (compact keys, ≤ 8 KB). Opening a link loads it (source `'url'`), validated. Invalid or oversize → notice, fall back to the saved circuit.

## V2-5: Step-through debugger
- A timeline bar under the canvas: step buttons (first / previous / next / last), a slider across columns 0…N, and a play/pause button (≈700 ms per step; respects reduced motion by stepping without tweening).
- At step k: the canvas highlights column k (later columns dimmed); Bloch spheres, Density Matrices and Partial Trace Steps show the state **after column k**. A "Live" toggle (default on) returns to the final state; editing the circuit returns to Live.
- Keyboard: `[` and `]` step when the canvas is focused.
- Engine: `simulateSteps` in the worker (cheap at n ≤ 6). Tests: step N equals the full simulation; Bell circuit step 1 = pure, step 2 = maximally mixed.

## V2-6: Rotation sliders + animated Bloch vectors
- Gate inspector for Rx/Ry/Rz: a slider (−2π…2π) next to the existing angle input; Shift snaps to π/8; the label shows the value as a π fraction when exact. Dragging updates the circuit live (throttled to one update per animation frame, coalesced into **one** history entry per drag).
- Bloch arrows animate between states (≈250 ms ease-out; interpolate the vector; length changes animate too). Disabled under `prefers-reduced-motion`.
- The arrow is hidden when |r| < 1e-6 and a small "r = 0" marker is shown at the centre (no zero-length arrow artefacts).

## V2-7: Keep-any-subset partial trace
- In Density Matrices and Partial Trace Steps: a "Keep qubits" multi-select (chips q0…q5). Default = the selected qubit (current behaviour).
- Show the 2^k × 2^k reduced ρ for k ≤ 3 (larger → "too large to display" with purity and entropy still shown), purity Tr(ρ²), von Neumann entropy S(ρ) in bits, and a one-line plain-language explanation of what was traced out.
- Trace Steps for subsets shows the same per-entry sums, generalised.
- Tests vs known states (Bell pair kept together → pure, entropy 0; one qubit of Bell → entropy 1; GHZ keep 2 → mixed). Extend `verify/` to compare subsets with Qiskit `partial_trace`.

## V2-8: UI fixes (from v1 review)
- **Bigger Bloch spheres**: the spheres are the main output. Bottom panel default height ≈ 45%; sphere size grows to fill the available space (up to ~320 px for 1–3 qubits); 6 qubits must still fit without scrolling at 1280×720 and ideally 1024×768.
- **Partial Trace Steps**: the intro text is hidden under the sticky header; fix the layout so nothing is clipped at any scroll position.
- **Projector legibility**: thicker axes (or tube geometry), larger axis labels with stronger contrast, the vector arrow clearly visible in both themes; check at 1280×720.
- Canvas: avoid the large empty area when there are few qubits (e.g. align wires with comfortable spacing, or let the bottom panel take more space by default).
- Re-check the design rules in both themes.

## V2-9: Review, docs, presentation material
- Fresh reviewer subagent (didn't build anything) tests every v1 + v2 feature in both themes at 1440×900, 1280×720 and 1024×768, checks the security rules (grep for eval/innerHTML, try hostile files and URLs), and checks the physics on known states. Fixes go on `v2-fix-review`.
- Update README (features, screenshots, keyboard shortcuts, file formats, limits, verification results) and `docs/screenshots/`.
- `docs/DEMO.md`: a scripted demo flow using v2 features (preset → step through a Bell circuit and watch entanglement appear → rotation slider → edit Qiskit → upload a file → copy link → theme toggle), with a fallback if something fails live.

## After v2 (not in this build)
1. **Security audit**: dependency audit (`npm audit`), the rules above, CSP and security headers for the chosen host, supply chain.
2. **Production readiness**: error boundaries, a 404/fallback, bundle size, caching, performance at 6 qubits, accessibility pass, browser support.
3. **Deployment**: choose the host, CI deploy, a custom domain if wanted.
4. M10: presentation.
