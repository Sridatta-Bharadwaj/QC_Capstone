# Project Context Register

_Last updated: 2026-10-07 — v1 (M0–M9) complete, reviewed, fixes merged; next: M10 presentation_

## Current phase
v1 is complete on `main` (M0–M9 + independent review fixes). All milestone branches are on GitHub. Next: M10 presentation/demo prep (handled separately), deployment (deferred by user), then stretch goals + UI revisit.

## Done
- [x] Problem statement received (2026-10-06)
- [x] Project scaffolding: `CLAUDE.md`, `CONTEXT.md` (2026-10-06)
- [x] `PLAN.md` written: UI layout, architecture, stack, milestones, stretch goals (2026-10-06)
- [x] Git + GitHub remote, `.gitignore`, CI workflow `.github/workflows/ci.yml` (2026-10-06)
- [x] **M0 — Setup** (2026-10-06, branch `m0-setup`): Vite/React/TS + deps; ESLint/Prettier/Vitest; resizable layout (`src/components/Layout/AppShell.tsx`); tokens `src/styles/tokens.css`; theme `src/theme/themeStore.ts` + pre-paint script in `index.html`; `src/components/common/{Skeleton,Tabs}.tsx`; contracts `src/model/types.ts`, `src/engine/{index,types}.ts`, `src/worker/protocol.ts`; stores `src/model/{store,uiStore}.ts`; helpers `src/model/circuit.ts`; presets `src/model/presets.ts`
- [x] **M1 — Math engine** (2026-10-06, `m1-engine`): `src/engine/{complex,gates,simulator,partialTrace,bloch}.ts`, tests `tests/engine/` (direct vs explicit ρ agree to 1e-10 on presets + 200 random circuits, 10-qubit test)
- [x] **M2 — Qiskit verification** (2026-10-06, `m2-verify`): `verify/{export-engine.ts,verify.py,run-python.ts,README.md,requirements.txt}`, `tsconfig.verify.json`, npm `verify`/`verify:export`. Result: 377 circuits (fixed + 240 random) all match Qiskit 2.5.2, max |Δρ| 2.1e-15
- [x] **M3 — Canvas** (2026-10-06, `m3-canvas`): `src/components/Canvas/*` (placement.ts pure logic, CircuitGrid, GateGlyph, GateInspector, dnd), `src/components/Sidebar/*`, tests `tests/canvas/`
- [x] **M4 — Bloch spheres** (2026-10-06, `m4-bloch`): `src/components/Bloch/*` (lazy three.js chunk, DOM labels), `BottomPanel/BlochPanel.tsx`, tests `tests/bloch/`
- [x] **M5 — Web Worker** (2026-10-06, `m5-worker`): `src/worker/{engine.worker,handleRequest,engineClient,useEngineBridge}.ts`, mounted in `App.tsx`, tests `tests/worker/`
- [x] **M6 — Code generation** (2026-10-06, `m6-codegen`): `src/codegen/{qasm,qiskit,index}.ts`, `src/components/CodePanel/*` (direct Monaco wrapper, lazy, offline), tests `tests/codegen/`
- [x] **M7 — Two-way QASM sync** (2026-10-06, `m7-sync`): `src/parser/qasm.ts`, `src/components/CodePanel/{qasmSync,revealStore}.ts`, editable QASM tab + markers, `BottomPanel/ProblemsPanel.tsx`, tests `tests/parser/`, `tests/sync/`
- [x] **M8 — Teaching views** (2026-10-06, `m8-teaching-views`): `src/components/Teaching/*`, `BottomPanel/{DensityMatricesPanel,TraceStepsPanel}.tsx` (lazy), `StatusBar/*`, tests `tests/teaching/`
- [x] **M9 — Polish** (2026-10-07, `m9-polish`): boot skeleton in `index.html`, Bloch compute/mismatch skeletons, empty states, presets reordered + partially entangled pair, WCAG contrast + design-rule tests `tests/design/`, removed `@monaco-editor/react`, `chunkSizeWarningLimit`, format:check in CI, `README.md` + `docs/screenshots/`. Offline verified: production preview makes only same-origin requests. Deployment NOT done (deferred by user)
- [x] **Independent review + fixes** (2026-10-07, `fix-review`): no blockers. Fixed: Bloch cards sized from panel (`Bloch/layout.ts`, `useElementSize.ts`) so 6 spheres fit at 1280×720; notice when a canvas edit replaces QASM with errors (`CodePanel/ReplacedNotice.tsx`); status-bar "QASM has errors — showing last valid circuit"; inspector reverts invalid angle on blur; selected gate scrolls into view; `common/MathText.tsx` for ⟨ ⟩ and ⁺ glyphs; even matrix columns; boot/teaching skeletons match layout; disabled-button tooltips; Qiskit imports `pi` only when used. 785 tests

## In progress
- (nothing)

## Next up
- M10 — presentation + scripted demo + offline backup (separate)
- Deployment (GitHub Pages; `base: './'` already set) when the user asks
- Rehearse the demo at the projector resolution

## Left (backlog, in order)
- [ ] M10 — Presentation + live demo prep (slides, scripted demo, offline backup)
- Then: review v1 → plan stretch goals → revisit UI
- Stretch goals: see `PLAN.md` → Stretch goals

## Decisions log
| Date | Decision | Reason |
|------|----------|--------|
| 2026-10-06 | Planning in claude.ai chat; coding in Claude Code (VS Code) | Claude Code can't read claude.ai Projects — files in this folder carry context |
| 2026-10-06 | VS Code-style UI: gates sidebar, canvas center, code right, visualizations bottom | Familiar layout |
| 2026-10-06 | Math in browser (TypeScript, Web Worker); Qiskit only for verification | Live updates, no backend, UI stays responsive |
| 2026-10-06 | Editable code = OpenQASM 2.0 subset (two-way); Qiskit tab generated read-only | QASM maps cleanly both ways; Python doesn't |
| 2026-10-06 | MAX_QUBITS = 6 as config constant; engine n-agnostic | Readability/teaching, NOT memory (real limit ~25) |
| 2026-10-06 | Measurement excluded from v1 | Changes math; stretch goal |
| 2026-10-06 | Must not look AI-generated: no gradients (esp. purple), no glassmorphism/glows/emoji; IDE-style neutral UI, one accent | User requirement; see PLAN.md → Design guidelines |
| 2026-10-06 | Light/dark toggle via CSS-variable tokens (also themes Monaco + Bloch scene) | User requirement |
| 2026-10-06 | Skeleton loaders only where real loading happens; no fake delays | User requirement; fake delays are slop |
| 2026-10-06 | Final deliverables: presentation + live demo to prof | App must run offline (no CDNs at runtime) |
| 2026-10-06 | After v1: plan stretch goals + revisit UI | v1 is a checkpoint |
| 2026-10-06 | Qubit ordering in engine is big-endian: basis index = |q0 q1 … q(n-1)⟩, q0 = most significant bit | Textbook convention, matches how the canvas reads top→bottom; Qiskit (little-endian) handled in verify/ |
| 2026-10-06 | A multi-qubit gate blocks every wire between its lowest and highest qubit in its column | Its vertical line crosses those wires; keeps placement unambiguous |
| 2026-10-06 | Auto-placement = first column after the last gate touching the gate's span (ASAP layering) | "Earliest free column" alone could place a gate before an earlier one on the same wire |
| 2026-10-06 | Theme toggle uses `codicon-color-mode` (deviation from "sun/moon") | Codicons has no sun/moon glyphs |
| 2026-10-06 | ESLint (flat config) instead of the oxlint the Vite template now ships | User asked for ESLint |
| 2026-10-06 | Sphere click only selects the qubit; a "Reduced ρ" button on each card selects + jumps to Density Matrices (deviation from "click jumps") | Keeps spheres visible during the demo |
| 2026-10-06 | Bloch labels are DOM spans projected each frame, not drei `<Html>`/`<Text>` | `<Html>` caused React root unmount errors; `<Text>` fetches fonts from a CDN |
| 2026-10-06 | Monaco used directly (`monaco.editor.create`), not via `@monaco-editor/react` | Its loader hard-codes a jsdelivr CDN URL into the bundle; direct use also gives model/marker control |
| 2026-10-06 | `DndContext` wraps `<AppShell/>` in `App.tsx`; canvas selection lives in `Canvas/canvasStore.ts` | DnD must span palette + canvas; keep circuit store model-only |
| 2026-10-06 | Worker: every change posted immediately, stale replies dropped by requestId; `computing` true only after 150 ms outstanding; sync main-thread fallback if Worker unavailable | Simple and flicker-free at n ≤ 6 |
| 2026-10-06 | `ENTANGLEMENT_EPSILON` moved to `engine/types.ts` (re-exported from index) | Broke a circular import bloch.ts ↔ index.ts |
| 2026-10-06 | QASM round-trip: exact for parser-placed layouts; canvas layouts with gaps normalise in one pass (statevector + dependent-gate order preserved) | `toQasm` orders by column; parser re-packs ASAP. Accepted (PLAN: formatting normalised) |
| 2026-10-06 | Unsupported QASM (measure, reset, if, gate defs) = error; barrier/creg = warning and ignored | Measurement is out of scope for v1 |
| 2026-10-06 | Full ρ shown only for n ≤ 4 (`MAX_DISPLAY_QUBITS`); larger shows "too large to display" | 32×32/64×64 unreadable |
| 2026-10-06 | Subscripts in mono text use `<sub>` (Rho component), not Unicode ₀₁ | IBM Plex Mono lacks subscript glyphs |
| 2026-10-07 | Deployment deferred (not part of this build) | User instruction |
| 2026-10-07 | Bloch card size follows the panel size (96–200 px sphere); mixed note is a header tag | Spheres must be fully visible on a 1280×720 projector |
| 2026-10-07 | Dirac notation rendered via `MathText` (mono kets/bras, `<sup>` for ⁺/⁻) | IBM Plex fonts lack ⟨ ⟩ and ⁺ glyphs |
| 2026-10-07 | Canvas edit over erroneous QASM still regenerates (PLAN rule) but shows a notice with Ctrl+Z hint; status bar flags stale results while QASM has errors | Avoid silent loss during live typing in the demo |
| 2026-10-07 | Not done on purpose: circuit persistence across reload, confirm dialog on Remove qubit | Not in spec |
| 2026-10-06 | Skeleton shimmer uses a subtle linear-gradient sweep | PLAN asks for a shimmer; it is a loading indicator, not a surface gradient; disabled under reduced motion |

## Open questions
- Course deadline — not yet known

## Known issues / gotchas
- Before marking any UI milestone done, check it against PLAN.md → Design guidelines in **both** themes.
- Qiskit uses **little-endian** qubit ordering (q0 = rightmost bit). Account for this in M2 verification.
- Two-way sync: tag changes by source; never regenerate editor text from editor-originated changes.
- Offline: `@monaco-editor/react` loads Monaco from a CDN by default — must use `loader.config({ monaco })` with the local `monaco-editor` package. drei `<Text>` fetches a font from a CDN unless given a local `font` — avoid or pass a bundled font.
- Prettier must not touch `CLAUDE.md`/`PLAN.md`/`CONTEXT.md` (listed in `.prettierignore`).
- Local hook "GateGuard" asks for facts before the first write of each new file; just answer and retry.
- GitHub pushes: Git Credential Manager may need an interactive sign-in; when pushes hang, authenticate from your own terminal first. Use `GIT_TERMINAL_PROMPT=0 timeout …` in automation so it fails instead of hanging.
- three.js chunk ~950 kB and Monaco chunk ~3.2 MB (both lazy) trip Vite's 500 kB warning — expected.
- Monaco bundles its own codicon font under the same family name as @vscode/codicons; new app icons should be checked after Monaco loads.
- Component tests: Testing Library auto-cleanup is off (no Vitest globals) → use `afterEach(cleanup)`.
- `useResultsStore.explicit` may lag one reply behind `selectedQubit` — check `explicit.qubit === selectedQubit`.

## Session log
- 2026-10-06 — Planning session: problem statement, UI design, architecture, plan, stretch goals.
- 2026-10-06 — Build session: git/CI set up; M0 done and merged; contracts written for parallel waves.
- 2026-10-06 — Waves 1–2: M1–M6 built by parallel subagents in worktrees, each merged via the gate; end-to-end check (Bell preset → both spheres at centre) passes.
- 2026-10-06 — Wave 3: M7 sync + M8 teaching views merged via gate (542 tests).
- 2026-10-07 — M9 finished by lead after the M9 agent hit a usage limit; all branches pushed; independent review (no blockers) → `fix-review` merged (785 tests). Known limit: at 1024×768 with 6 qubits the sphere grid wraps and scrolls.
