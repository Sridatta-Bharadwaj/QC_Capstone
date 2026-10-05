# Project Context Register

_Last updated: 2026-10-06 — M0 merged; Wave 1 (M1, M3, M4, M6) in parallel_

## Current phase
Building v1 (M0–M9) with parallel subagents, one branch per milestone, merged into `main` via the gate (merge origin/main → typecheck+lint+test+build → `--no-ff` merge → re-check → push). See `PLAN.md`.

## Done
- [x] Problem statement received (2026-10-06)
- [x] Project scaffolding: `CLAUDE.md`, `CONTEXT.md` (2026-10-06)
- [x] `PLAN.md` written: UI layout, architecture, stack, milestones, stretch goals (2026-10-06)
- [x] Git + GitHub remote, `.gitignore`, CI workflow `.github/workflows/ci.yml` (2026-10-06)
- [x] **M0 — Setup** (2026-10-06, branch `m0-setup`): Vite/React/TS + deps; ESLint/Prettier/Vitest; resizable layout (`src/components/Layout/AppShell.tsx`); tokens `src/styles/tokens.css`; theme `src/theme/themeStore.ts` + pre-paint script in `index.html`; `src/components/common/{Skeleton,Tabs}.tsx`; contracts `src/model/types.ts`, `src/engine/{index,types}.ts`, `src/worker/protocol.ts`; stores `src/model/{store,uiStore}.ts`; helpers `src/model/circuit.ts`; presets `src/model/presets.ts`

## In progress
- Wave 1: M1 engine, M3 canvas, M4 Bloch, M6 codegen (parallel subagents in worktrees)

## Next up
- Wave 2: M2 verify + M5 worker (after M1), M7 sync (after M3+M6) → Wave 3: M8 → Wave 4: M9 → independent review

## Left (backlog, in order)
- [ ] M1 — Math engine + Vitest tests
- [ ] M2 — Qiskit verification script
- [ ] M3 — Circuit model + canvas (drag/drop)
- [ ] M4 — Bloch spheres
- [ ] M5 — Web Worker
- [ ] M6 — Code generation, one-way (minimum complete project)
- [ ] M7 — Two-way QASM sync
- [ ] M8 — Teaching views (Density Matrices, Partial Trace Steps, status bar)
- [ ] M9 — Polish & deploy (skeleton loaders, design review in both themes)
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

## Session log
- 2026-10-06 — Planning session: problem statement, UI design, architecture, plan, stretch goals.
- 2026-10-06 — Build session: git/CI set up; M0 done and merged; contracts written for parallel waves.
