# Project Context Register

_Last updated: 2026-10-08 — v2 build in progress (V2-0, V2-1, V2-4, V2-6, V2-7, V2-8 merged; V2-2, V2-5 running)_

## Current phase
v2 build (PLAN.md → v2). V2-0 contracts merged on `main`. Wave 1 (V2-1, V2-8, V2-4, V2-7) runs in worktrees under `.worktrees/<branch>`.

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

- [x] **V2-0 — Contracts** (2026-10-08, `v2-0-contracts`): `model/types.ts` (ChangeSource split, `InitialState`/`initialStates`, `CodeTab`, `Problem.tab`, limits `MAX_OPERATIONS`/`MAX_UPLOAD_BYTES`/`MAX_URL_BYTES`), `model/circuit.ts` (`defaultInitialStates`, `resizeInitialStates`, `circuitsEqual` + `assignOperationIds` moved here), `model/validate.ts` (`validateCircuit`, implemented), `model/historyStore.ts` (implemented, `coalesceKey`), `model/store.ts` (`setInitialState`), `engine/{simulator,bloch,subset,types,index}.ts` (`productState`, `simulateSteps`, subset stubs), `worker/{protocol,handleRequest,engineClient}.ts` ('steps'/'subset' requests, `step` on analyze, `EngineClient.send`). 832 tests, verify 378/378
- [x] **V2-4 — Autosave, undo/redo, shareable URL** (2026-10-08, `v2-4-history-persistence`): `src/persistence/{base64url,shareLink,autosave,startup,copyLink}.ts`, `src/history/{history,shortcuts}.ts`, `src/components/Notices/*`, TitleBar (Undo/Redo/New circuit/Copy link), `App.tsx`, `main.tsx` (`initPersistence()` before render). Link format `#c=<base64url({v:1,n,s?,o:[[gate,col,qubits,angle?]]})>`. Coalescing API for V2-6: `runWithHistoryKey(key, fn)`. 908 tests
- [x] **V2-8 — UI fixes** (2026-10-08, `v2-8-ui-fixes`): `Bloch/{layout.ts,BlochCard,BlochGrid,BlochSphere,Bloch.css}` (spheres up to 320 px; card layouts below/side/stack), `BottomPanel/{BlochPanel,TraceStepsPanel}.tsx`, `Teaching.css` (`.teaching--split`/`.teaching__scroll`), `Layout/{AppShell.tsx,canvasFit.ts}` (bottom 45%, top row fits the qubit count), `index.html` boot split 55%. Sizes: 1280×720 → 320 px (1–2 q), 153 px (6 q); 1024×768 6 q → 117 px, no scrolling. 922 tests
- [x] **V2-7 — Keep-any-subset partial trace** (2026-10-08, `v2-7-subset-trace`): `engine/subset.ts` (direct + explicit subset trace, Jacobi-based von Neumann entropy, `MAX_EXPLICIT_KEEP` = 3), `Teaching/{KeepSelector,keepStore,useSubsetResult,SubsetSummary}.tsx/ts` (QubitSelector removed), `BottomPanel/{DensityMatricesPanel,TraceStepsPanel}.tsx`, `verify/{export-engine.ts,verify.py,README.md}`. Verify: 378 circuits + 2083 kept sets match Qiskit (max |Δρ| 2.1e-15, |ΔS| 1.1e-14). 956 tests
- [x] **V2-1 — Editable Qiskit tab** (2026-10-08, `v2-1-qiskit-sync`): `src/parser/qiskit.ts` (hand-written tokenizer/parser, straight-line subset, measurement + analysis-tail rules, limits), `src/model/angle.ts` (`evaluateAngle(text, {piNames})`, length 1000 / depth 64 caps), `CodePanel/codeSync.ts` (generic per-tab sync; `qasmSync.ts` is a shim), `CodePanel/{CodePanel,ReplacedNotice,revealStore}`, `ProblemsPanel` (tab tags), `StatusBar`, `model/store.ts` (problems `byTab`, `setProblems(tab, problems)`). 1436 tests
- [x] **V2-6 — Rotation sliders + animated Bloch vectors** (2026-10-08, `v2-6-rotation-sliders`): `Canvas/{GateInspector.tsx,angleSlider.ts,Canvas.css}` (slider in π/720 ticks, Shift snaps to π/8, rAF-throttled, one history entry per drag via `runWithHistoryKey`), `Bloch/{BlochSphere.tsx,arrowAnimation.ts,coords.ts,Bloch.css}` (250 ms cubic ease-out vector tween, reduced-motion jump, r = 0 dot + label, threshold 1e-6). 1477 tests. Visual check pending (browsers busy at merge)

## In progress
- `v2-2-initial-states`, `v2-5-step-debugger` (wave 2)

## Next up
- Merge wave 1 in priority order (V2-1, V2-8, V2-4, V2-7), then wave 2: V2-2 (after V2-1), V2-5 (after V2-8), V2-6 (after V2-8 + V2-4); wave 3: V2-3; wave 4: V2-9 review + `v2-fix-review` + README/DEMO.md
- Then: security audit → production readiness → deployment → M10 presentation
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
| 2026-10-08 | Qiskit tab becomes editable via a straight-line Qiskit subset parser (no Python runtime) | User wants both code tabs two-way; the subset maps 1:1 to the model like QASM |
| 2026-10-08 | v2 scope confirmed: Qiskit editing, initial states, upload/download, autosave + undo + share URL, step-through, rotation sliders, subset partial trace, UI fixes | User request; deploy + audit after v2 |
| 2026-10-08 | Final measurements are ignored with a warning (QASM + Qiskit); mid-circuit measurement is an error | Real-world files end with measurements; the spheres show the pre-measurement state |
| 2026-10-08 | Security rules apply to all v2 code (no eval/innerHTML, validate files/URL/localStorage, size limits) | Audit and deployment follow v2 |
| 2026-10-08 | V2-0 implements (not just stubs) `simulate` from initial states, `simulateSteps`, `validateCircuit` and the history store | Small, central and shared by several milestones; one implementation avoids parallel divergence. Subset/entropy stay stubs for V2-7 |
| 2026-10-08 | `simulateSteps` numbering: step 0 = start state, step c+1 = after column c (`afterColumn` = step − 1); `AnalyzeRequest.step` uses the same numbering | One convention for engine, worker and timeline |
| 2026-10-08 | `validateCircuit` always assigns fresh op ids and accepts a missing `initialStates` (= all \|0⟩); columns capped at `MAX_COLUMN` = 1000 | Never trust ids from outside; v1-shaped data still loads |
| 2026-10-08 | Features needing their own result stream create their own `EngineClient` (own worker); `send()` + `onOtherResult` | Staleness is tracked per client, so steps/subset replies never drop the main analysis |
| 2026-10-08 | Pushes use `gh` credentials (`git -c credential.helper='!gh auth git-credential' push`) | Git Credential Manager needs an interactive sign-in; `gh` is already authenticated |
| 2026-10-08 | V2-4: the `#c=` hash is cleared (replaceState) after it is read and the linked circuit is saved at once; `'restore'` resets history instead of pushing; notices live in a fixed bottom-right `NoticeArea` | A stale hash would override later autosaved edits on reload; notices avoid touching AppShell/StatusBar |
| 2026-10-08 | V2-8: the top/bottom split auto-fits the canvas to the qubit count (35–55 %) until the user drags the separator | A fixed 45 % split can't avoid the empty canvas for few qubits and still fit 6 wires at 1280×720 |
| 2026-10-08 | V2-7: Keep chips toggle membership (multi-select); k = 1 keeps the v1 data path (entropy computed from ρₖ on the main thread); explicit steps only for k ≤ 3; all-zero entry cards hidden behind "Show all entries" | Spec asks for a multi-select; avoids two data sources for one-qubit views; 64 cards at k = 3 are unreadable |
| 2026-10-08 | V2-1 parser accepts a few real Qiskit forms beyond the spec (`qubit1/2`, `control_qubit1/2`, `measure_active`, `range(...)` in measure, `;`, `name=`) and is stricter elsewhere (any circuit call inside a block/expression unless read-only; reassigning the circuit variable; gate call on another variable) | Real exported code uses those forms; silent ignores hid errors in the browser check |
| 2026-10-08 | Undo while a code-tab parse is pending: the pending parse is cancelled and the tab regenerated (no stale re-apply) | Checked in `codeSync.regenerate`; closes the V2-4 open check |
| 2026-10-08 | V2-6: each slider key press = one undo step (auto-repeat continues it); history keys from a module counter; out-of-range angles pin the thumb but the label shows the real value | Predictable and testable; inspector remounts per gate |
| 2026-10-08 | ESLint ignores `.worktrees` and pins `tsconfigRootDir`; `.prettierignore` lists `.worktrees` | Agent worktrees inside the repo broke lint on main |
| 2026-10-08 | Generated "analysis tail" (Statevector/partial_trace lines) is ignored by the Qiskit parser | toQiskit output must parse with zero problems |

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
- `verify/.venv` is gitignored: recreate with `python -m venv verify/.venv` + `pip install -r verify/requirements.txt` (done 2026-10-08). Worktrees share main's `node_modules` and `verify/.venv` via directory junctions.
- Until V2-2: a code edit resets initial states to |0⟩ (both parsers return defaults).
- QASM parser has no MAX_OPERATIONS check yet and an O(n²) placement copy per gate → V2-3. Keep `suggestGateName`, `ParseOptions`, `ParseResult` exported from `parser/qasm.ts` (Qiskit parser imports them).
- Dev server inside a worktree: fonts/codicons 403 because the `node_modules` junction is outside Vite's `fs.allow`; start Vite via its API with `server.fs.allow: ['D:/Sridatta/QC_Capstone']` (config unchanged).
- Density Matrices still uses the sticky toolbar; it can opt into `.teaching--split` like Trace Steps.
- `useResultsStore.explicit` may lag one reply behind `selectedQubit` — check `explicit.qubit === selectedQubit`.

## Session log
- 2026-10-06 — Planning session: problem statement, UI design, architecture, plan, stretch goals.
- 2026-10-06 — Build session: git/CI set up; M0 done and merged; contracts written for parallel waves.
- 2026-10-06 — Waves 1–2: M1–M6 built by parallel subagents in worktrees, each merged via the gate; end-to-end check (Bell preset → both spheres at centre) passes.
- 2026-10-06 — Wave 3: M7 sync + M8 teaching views merged via gate (542 tests).
- 2026-10-07 — M9 finished by lead after the M9 agent hit a usage limit; all branches pushed; independent review (no blockers) → `fix-review` merged (785 tests). Known limit: at 1024×768 with 6 qubits the sphere grid wraps and scrolls.
- 2026-10-08 — Reviewed v1 (two-way QASM sync confirmed working; user was likely typing in the read-only Qiskit tab). Wrote the full v2 spec (V2-0 … V2-9) in PLAN.md.
- 2026-10-08 — v2 build started: spec committed, V2-0 contracts merged (832 tests, verify 378/378). Wave 1 launched.
- 2026-10-08 — V2-4 merged (908 tests).
- 2026-10-08 — V2-8 merged (922 tests); wave 2 started (V2-5, V2-6).
- 2026-10-08 — V2-7 merged (956 tests, verify incl. 2083 subsets); browser-checked GHZ keep {q0,q1}.
- 2026-10-08 — V2-1 merged (1436 tests); V2-2 launched.
- 2026-10-08 — V2-6 merged (1477 tests); its browser check deferred until a browser tool is free.
