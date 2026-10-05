# Project Context Register

_Last updated: 2026-10-06 — planning complete, ready for M0_

## Current phase
Planning done. Next: **M0 — Setup**. See `PLAN.md` for full milestone details.

## Done
- [x] Problem statement received (2026-10-06)
- [x] Project scaffolding: `CLAUDE.md`, `CONTEXT.md` (2026-10-06)
- [x] `PLAN.md` written: UI layout, architecture, stack, milestones, stretch goals (2026-10-06)

## In progress
- (nothing)

## Next up
- [ ] **M0 — Setup:** Vite/React/TS project, deps, VS Code-style resizable layout, light/dark design tokens + theme toggle, bundled fonts/codicons, shared `<Skeleton>` component

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

## Open questions
- Course deadline — not yet known

## Known issues / gotchas
- Before marking any UI milestone done, check it against PLAN.md → Design guidelines in **both** themes.
- Qiskit uses **little-endian** qubit ordering (q0 = rightmost bit). Account for this in M2 verification.
- Two-way sync: tag changes by source; never regenerate editor text from editor-originated changes.

## Session log
- 2026-10-06 — Planning session: problem statement, UI design, architecture, plan, stretch goals.
