# QC Capstone — Instructions for Claude

## Project
Tool/app that accepts a multi-qubit quantum circuit, isolates single-qubit
reduced density matrices via partial tracing, and visualizes each qubit's
(possibly mixed) state on the Bloch sphere. Quantum computing course capstone.

## Key files
- `PLAN.md` — the agreed plan: architecture, tech stack, milestones. Source of truth for *what* to build.
- `CONTEXT.md` — running register of progress: what's done, in progress, left, and decisions/gotchas. Source of truth for *where we are*.

@PLAN.md
@CONTEXT.md

## Session protocol (follow every session)
1. **Start:** Read `CONTEXT.md` before doing anything. Resume from "Next up". Don't redo items marked done.
2. **During:** If you deviate from `PLAN.md`, record the decision and reason in `CONTEXT.md` → Decisions log. Don't silently change the plan.
3. **End of session / after finishing a task:** Update `CONTEXT.md`:
   - Move finished items to **Done** (with date and the files touched).
   - Update **In progress** and **Next up**.
   - Add any bugs, gotchas, or open questions.
   - Append a line to the **Session log**.
4. Keep `CONTEXT.md` concise — it's a register, not a diary. Condense old session log entries if it grows long.

## Notes about the developer
- Still learning the theory (density matrices, partial trace). When implementing physics code, add short comments explaining the math, and prefer readable code over clever code.
