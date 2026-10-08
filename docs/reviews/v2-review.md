# v2 independent review (V2-9)

Reviewer: fresh agent, built none of v2. Branch `v2-9-review` = `main` @ `429f89c`.
Date: 2026-10-08. Browser: Chromium (Playwright), dev server (Vite API, port 5196) and production
preview (`vite preview`, port 5198).

## Verdict

**Ship-able after two Major fixes. No blockers.** The physics is correct everywhere I checked
(UI numbers, not just code), `npm run test` (1998) and `npm run verify` (519 circuits / 2965 kept
sets) pass, and the security rules hold: no `eval`/`innerHTML`/network code, and every hostile
link, localStorage value, file and pasted text I tried failed fast with a clear message and no
partial state.

The two Major findings are both about the demo and about losing work:

- **R1:** the canvas lets you build circuits that `validateCircuit` rejects: more than 500 gates,
  or a column above 1000. Autosave stores such a circuit, and on the next reload it is **discarded
  without a way back**.
- **R2:** the top/bottom split only fits itself when the qubit count changes. If the window gets
  smaller after load (switching to the projector, opening DevTools), the bottom wires (q5) are
  clipped at 1280×720.

## Findings

### Blocker

None.

### Major

**R1 — Canvas edits can exceed the limits that `validateCircuit` enforces → autosaved work is discarded on reload**

- Area: model invariants / persistence (`src/model/store.ts:80` `addOperation`, `updateOperation`;
  `src/model/validate.ts` `MAX_COLUMN = 1000`, `MAX_OPERATIONS = 500`; `src/persistence/autosave.ts`).
- Repro A (production build, 1440×900, either theme): open a valid 500-gate 6-qubit `.qasm`
  ("Opened big.qasm"). Click **H** in the palette → a 501st gate is appended (668 gate parts on the
  canvas). Wait 1 s, then reload. Notice: "Saved circuit was invalid and was discarded." The canvas
  is empty and undo history is reset.
- Repro B: add one H, select it, press ArrowRight 1005 times → "H on q0, column 1005". Reload →
  same notice. The circuit is gone.
- Expected: either the canvas refuses (palette click, drop, nudge, paste, add) once the circuit is
  at 500 operations or column `MAX_COLUMN`, with a hint, or the validator accepts everything the
  app itself can produce. Saved data should never be thrown away for a reason the app caused.
- Actual: the app writes data it later refuses to read and deletes it (`removeSaved`). The same
  circuit also can't be shared as a link, and its downloaded `.qasm` can't be opened again
  ("Too many gates").
- Suggested fix: enforce `MAX_OPERATIONS` in `addOperation` (return null plus a canvas hint "Limit
  of 500 gates reached"), and clamp the column in `updateOperation`/`placement.ts` to
  `MAX_COLUMN`. As a safety net, think about having `readSavedCircuit` keep invalid data under a
  backup key instead of deleting it.

**R2 — The canvas auto-fit ignores window resizes, so q5 is clipped after the viewport shrinks**

- Area: layout (`src/components/Layout/canvasFit.ts:40-56`, the effect depends only on `numQubits`).
- Repro: with a 6-qubit circuit, load at 1440×900, then resize the window to 1280×720 (dark or
  light). q5's wire bottom is at y = 349 while the timeline top is at y = 312: the q5 row and its
  gates sit under the timeline, and the canvas gets a vertical scrollbar.
  (`review-15-dark-6q-1280.png` and `review-15-dark-6q-1024.png`, compare
  `review-16-dark-6q-reload-1280.png` after a reload, where everything fits.) The same happens at
  1024×768.
- Expected: 6 qubits still fit after a resize (PLAN V2-8: "must still fit without scrolling at
  1280×720"). For the demo this is the realistic case: the app is opened on the laptop screen and
  then moved to the projector, mirrored at a lower resolution, or DevTools is opened.
- Suggested fix: re-run the fit when the group height changes (ResizeObserver on the group, or
  `window` resize) while `userResized` is false.

### Minor

**R3 — `[` / `]` only work when a gate or a timeline control has focus; clicking the canvas does not focus it**

- `src/components/Canvas/CanvasView.tsx:66-75, 95` (the `<section>` has no `tabIndex`). Clicking
  First/Last/Next disables that button, focus drops to `<body>` (seen: `focusAfterFirst: "BODY"`),
  and the keys stop working. Repro: Bell preset → click an empty part of the canvas → press `[` →
  nothing. Only clicking a gate first makes it work. This is the known item from CONTEXT; it is
  worse than noted because a plain click on the canvas never works.
- Fix: `tabIndex={-1}` on the canvas section (or on the grid) and focus it on pointerdown. Move
  focus to the slider or the Play button when a step button becomes disabled.

**R4 — Qiskit: a gate written after the analysis tail is applied, but real Python would not include it**

- `src/parser/qiskit.ts` (analysis-tail rule). Repro: Bell preset → Qiskit tab → type `qc.x(1)` on
  the last line (after `state = Statevector(qc)` / `rho = …`). The canvas and spheres gain the X
  with no warning. Running this file in Python computes `state` and `rho` _before_ the X, so the
  printed ρ differs from what the app shows. A professor who copies the code to Qiskit will see a
  different result.
- Fix: a warning on gate calls after the first line that uses the circuit read-only
  (`Statevector(qc)` …), e.g. "This gate comes after Statevector(qc): Python would not include it
  in `state`", or regenerate so gates always come first. Also, `pi` used without an import is
  accepted silently (Python would raise NameError). That is lenient and fine, but worth a hint.

**R5 — Dropping a file anywhere outside the code panel navigates the browser away from the app**

- Only `CodePanel.tsx:101-112` handles drag/drop. Dropping a `.qasm`/`.py` onto the canvas, the
  spheres or the sidebar falls back to the browser default (open/download the file, leaving the
  app). Autosave flushes on `pagehide`, so the circuit survives, but in a live demo this is a bad
  moment. Fix: `dragover`/`drop` preventDefault on `window`, and route drops anywhere to
  `openCircuitFile` (or ignore them with a hint).

**R6 — Externally loaded circuits keep huge empty column gaps**

- `validateCircuit` accepts any column ≤ 1000. Link `{"v":1,"n":2,"o":[["H",999,[0]]]}` loads a
  1000-column canvas with one gate at the far right, plus a 1000-step timeline of no-ops
  (`review-12-col999.png`). It doesn't crash (3 061 DOM nodes), but it looks broken. Fix: compact
  columns on load (keep order, re-pack ASAP like the parser does), or reject gaps over some size.

**R7 — README not updated for v2**

- `README.md` has no mention of the Qiskit editing, files, links, undo, step debugger, shortcuts,
  limits or the new verification numbers (grep for "undo", "link", ".qasm", "Ctrl" finds nothing).
  It is scheduled for V2-9; listed so it isn't forgotten. It should also say that the offline build
  must be served (`npm run preview` or any static server). Opening `dist/index.html` over
  `file://` won't run module scripts or workers.

**R8 — Bloch PNG doesn't record which step it shows**

- `src/files/blochPng.ts:131` title is "Bloch spheres · N qubits". If you export while the debugger
  is on step k, the image looks like the final state. Fix: add "· step k/N (after column k−1)"
  when not Live (and maybe the date).

### Nit

- **R9** `src/parser/qasm.ts:321` `suggestGateName` uses `lower in GATE_BY_NAME`, which matches
  prototype keys, so you get "Unknown gate 'constructor'. Did you mean 'constructor'?" (also
  `__proto__`, `toString`; the Qiskit tab says "Unknown method 'qc.**proto**'. Did you mean
  'qc.**proto**'?"). Harmless, because the real lookup at :713 uses `Object.hasOwn`, but the hint
  is wrong. Use `Object.hasOwn`.
- **R10** The file-open notice says "has 201 errors" for a file with 5 000 bad lines (the problems
  list is capped at 200 plus a "Stopped after 200 problems" entry). The Problems tab badge says 202
  (it includes a Qiskit-tab problem). Say "200+ errors" when capped.
- **R11** "Reduced ρ" on the Bloch cards is 11 px IBM Plex Sans, and the ρ reads as "p"
  (`review-21-card-light.png`). Use the mono font/`MathText` for ρ or 12 px.
- **R12** Keep = all qubits shows the same full ρ twice (reduced block and "Full density matrix").
  Hide the second one when nothing is traced out.
- **R13** Teaching tabs in step mode say "The circuit produces this 2-qubit state" with no step
  shown. Add "at step k" (the status bar has it, but the tab doesn't).
- **R14** `useSubsetResult` shows a result whose `numQubits` and `keep` match. It doesn't check
  the circuit or the step, so the old result shows for one worker round-trip after an edit or a
  step change. Invisible at n ≤ 6, but add the request id/step to the check.
- **R15** Undo pressed within 300 ms of typing a _valid_ edit in a code tab silently drops that
  edit: the pending parse is cancelled and the text regenerated with no notice, because the text
  had no errors. It is a deliberate decision in CONTEXT, and Monaco Ctrl+Z brings it back. You
  could show the "replaced" notice in that case too.
- **R16** `localStorage` validation ignores unknown keys (e.g. `__proto__`, `pad`), while links
  reject them. Both are safe (fresh object built). This just isn't consistent.
- **R17** `saveBlob` revokes the object URL after `setTimeout(…, 0)` (`src/files/download.ts`).
  Fine in Chromium. Firefox and Safari have had failures when the URL is revoked this early; 1–10 s
  is the usual safe delay. Check this in the browser support pass.
- **R18** Console: `THREE.Clock: This module has been deprecated` warning, twice per sphere mount
  (from r3f/three versions). No errors anywhere during the whole review.
- **R19** `npm audit`: 2 low (dompurify via monaco-editor; the fix needs a breaking monaco
  downgrade). Monaco only renders our own hovers/markers, so the risk is low. Note it for the
  security audit.
- **R20** Ctrl+Z inside the angle input does native text undo (as intended). The input then shows
  `5*pi/4` while the slider and gate still show π/3 until blur, and blur commits it as a new
  change. Acceptable; noted for completeness.

## Checked and OK

- **Layout and themes:** checked at 1440×900, 1280×720 and 1024×768 in light and dark, with fresh
  loads (R2 is about resizing). 6 qubits fit after a fresh load at 1280×720 and 1024×768. Monaco
  and the spheres follow the theme toggle. No gradients, glows or emoji. One teal accent. Small
  radius, IDE density.
- **Gates and canvas:** palette click-to-append and mouse drag & drop onto a wire/column work.
  Remove qubit (drops gates on that wire) can be undone. Add qubit up to 6.
- **Presets:** all 8 load and match their descriptions (table below).
- **Initial-state picker:** works by mouse and by keyboard (Enter, Home, ArrowDown, Enter). Focus
  returns to the trigger. The label updates. QASM gets an `// initial states` block (`h; sdg` for
  |−i⟩).
- **Inspector:** the angle input commits on Enter. The slider (−2π…2π) drag is **one** history
  entry per drag. Shift-drag snaps to π/8 (5π/4 seen). Values update live.
- **Undo/redo:** Undo/Redo buttons, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z outside Monaco work. They are
  ignored inside Monaco (Monaco text undo instead) and inside the angle input. New circuit can be
  undone.
- **Qiskit editing:** real typing into the Qiskit tab updates the canvas (source `qiskit`). Errors
  appear as Monaco squiggles, as Problems entries tagged "Qiskit" with line/col, and in the status
  bar ("Qiskit has errors — showing last valid circuit"). Clicking a problem switches to that tab
  with the cursor on the line. After a canvas edit over the erroneous text: "Qiskit code with
  errors was replaced by a canvas edit. Press Ctrl+Z…", and Ctrl+Z in the editor restores the text.
- **Step debugger:** First/Prev/Play/Next/Last, slider, Play from Live restarts at 0 and stops at
    N, Pause, any edit → Live. Column highlight and later-column dimming are visible. Density
    Matrices and Trace Steps follow the step (Bell step 1: ρ₀ = [[.5,.5],[.5,.5]], keep both shows
    the |00⟩+|10⟩ state). Status bar shows "Step k/N · back to Live".
- **Autosave and links:** autosave survives a reload. Copy link writes `#c=…` to the clipboard,
  with a notice. Opening a link loads it and clears the hash. A `hashchange` while the app is open
  loads the link as an undoable change ("Opened the circuit from the link.").
- **Files:** Open file and drag-drop onto the code panel. `.qasm` → QASM tab, `.py` → Qiskit tab,
  `.txt` sniffed both ways. Download `.qasm` / `.py` match the circuit and the timestamped
  filenames. The **Bloch PNG** is 1456×812 @2×: 3 cards with labels and values, theme background,
  correct vectors (`review-14-bloch-png.png`).
- **Production build:** makes 26 requests on load and while using every tab, **0 external**
  (fonts, codicons, Monaco and three are all same-origin). The only URLs in the bundle are
  license/doc strings and SVG namespaces.
- **Accessibility and console:** visible focus on palette, presets, timeline, picker and gates
  (accent outline). Tab order is logical. Console has 0 errors.

### Physics (numbers read from the UI)

| State / circuit                        | Expected                                                      | Shown                                                      |
| -------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------- |
| \|0⟩, \|1⟩ (picker)                    | r = (0,0,±1)                                                  | (0,0,1), (0,0,−1)                                          |
| \|+⟩, \|−⟩ (picker)                    | (±1,0,0)                                                      | (1,0,0), (−1,0,0)                                          |
| \|i⟩, \|−i⟩ (picker)                   | (0,±1,0)                                                      | (0,1,0), (0,−1,0)                                          |
| Superposition \|+⟩                     | (1,0,0)                                                       | (1.000, 0.000, 0.000)                                      |
| \|−⟩ through H                         | (0,0,−1)                                                      | (0.000, 0.000, −1.000)                                     |
| Phase kickback                         | q0 → −x, q1 stays −x, pure                                    | (−1,0,0), (−1,0,0), no entanglement                        |
| Product \|+⟩\|1⟩\|i⟩                   | +x, −z, +y, pure                                              | matches, purity 1.000                                      |
| Partially entangled pair               | z = 0.5, purity 0.625                                         | (0,0,0.500), 0.625, entangled                              |
| Bell                                   | r = 0, purity 0.5, S = 1 per qubit                            | r = 0 marker, 0.500, S(ρ) 1.000, ρ = diag(.5,.5)           |
| Bell, keep {q0,q1}                     | pure, S = 0                                                   | Tr(ρ²) 1.000, S 0.000                                      |
| Bell step 0 / 1 / 2                    | \|00⟩ / q0 at +x / both r = 0                                 | matches                                                    |
| GHZ(3)                                 | r = 0, purity 0.5 each                                        | matches                                                    |
| GHZ keep {q0,q1}                       | purity 0.5, S = 1, ρ = diag(.5,0,0,.5)                        | matches                                                    |
| W(3)                                   | z = 1/3, purity 5/9, S = H(1/3) = 0.918                       | (0,0,0.333), 0.556, 0.918                                  |
| Ry(θ)\|0⟩ sweep                        | (sin θ, 0, cos θ)                                             | θ = 2.269 → (0.766, 0, −0.643); 5π/4 → (−0.707, 0, −0.707) |
| Ry(0.7)\|+⟩ (q5 of a 6q circuit)       | (cos θ, 0, −sin θ)                                            | (0.765, 0, −0.644)                                         |
| 6q chain H + CX q0→…→q5 with q5 = \|+⟩ | q0–q4 maximally mixed; q5 untouched (\|+⟩ is an X eigenstate) | q0–q4 r = 0; q5 pure; status "Entangled: q0…q4"            |

### Security

**Grep** of `src/`, `index.html`, `tests/` and `vite.config.ts` for `eval(`, `new Function`,
`setTimeout('…')`, `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `dangerouslySetInnerHTML`,
`document.write`, `fetch(`, `XMLHttpRequest`, `WebSocket` and `http(s)://` found only:

- `tests/components/MathText.test.tsx:41` reads `el.innerHTML` (an assertion, not a write);
- `tests/persistence/shareLink.test.ts:97` has a test URL;
- `vite.config.ts:5` has a doc comment.

No app code matches.

**Hostile links (`#c=`).** Every case gave a clear notice, the saved circuit was kept, the hash was
cleared, and nothing crashed:

- truncated, non-base64, empty, not JSON;
- `__proto__` key ("unexpected fields");
- gate `"__proto__"` and an HTML gate name ("unknown gate");
- `n: 1e308`, `n: 7`;
- column 1e9;
- qubit 5 of 2, CX with the same qubit twice;
- angle `"NaN"`, initial state `"<b>x</b>"`;
- 601 operations, 9 000 characters.

The only odd case is column 999, which loads (R6). Note that a valid 500-operation circuit is over
the 8 KB link limit and is refused with a message, as designed.

**Corrupted localStorage.** These were all discarded with "Saved circuit was invalid and was
discarded.":

- not JSON, `[1,2,3]`, `null`;
- gate `constructor` or `toString`;
- a 300 KB string;
- overlapping gates, a CX span over a busy wire, a float column;
- 501 operations.

A value with extra keys (`__proto__`, a 200 KB `pad`) loads (R16). `({}).polluted` stayed
undefined.

**Hostile files.** Every one was handled in ≤ 30 ms of work:

| File                                                                 | Result                             |
| -------------------------------------------------------------------- | ---------------------------------- |
| binary                                                               | "not a text file"                  |
| 101 KB                                                               | refused before it is read          |
| 10 000 gate lines                                                    | "Too many gates"                   |
| 9 000 comment lines                                                  | opens                              |
| 5 000 nested parentheses                                             | "Angle expression is too long"     |
| recursive / mutually recursive gate defs                             | clear errors                       |
| 2¹⁵ exponential expansion                                            | "Too many gates"                   |
| OPENQASM 3                                                           | the spec message                   |
| `.py` with a `for` loop                                              | straight-line error                |
| `.py` with `os.system`/`exec`                                        | lines ignored, never run           |
| real export (creg, gate def, u3, barrier, final measure)             | 6 warnings, correct circuit        |
| mid-circuit measure                                                  | error                              |
| `qreg q[7]`, `r[99999999999999999999]`                               | qubit-cap error                    |
| 501 ops                                                              | error                              |
| `1e309` and a 900-digit angle                                        | errors                             |
| UTF-16 with BOM                                                      | opens correctly                    |
| one 81 KB line of `qc.h(0);`                                         | "Too many gates"                   |
| 5 000 errors                                                         | capped at 200                      |
| filename `<img src=x onerror=alert(1)>.qasm` with `<script>` content | shown as plain text, no script ran |
| `.png`                                                               | refused by extension               |

**Pasted into the editors** (through `applyCode`): Qiskit `rx(` with 20 000 levels of parentheses,
`h(` with 20 000 nested lists, a 20 000-deep call in an ignored line, 293 KB of QASM, 900 unary
minus signs, gate definitions nested 20 deep, and huge or negative qubit indices. All gave errors
or were ignored in ≤ 26 ms, with no stack overflow.

### Tests, verify and build

| Check                                                 | Result                                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `npm run test`                                        | **59 files, 1998 tests passed** (56 s)                                                                          |
| `npm run verify`                                      | **519 circuits, 2965 kept sets PASS** vs Qiskit; max \|Δρ\| 2.22e-15, max \|ΔS\| 1.67e-14                       |
| `npm run lint`                                        | clean                                                                                                           |
| `tsc -b`                                              | clean                                                                                                           |
| `format:check`                                        | clean                                                                                                           |
| `npm run build`                                       | OK. Chunks: index 430 kB, BlochSphere 951 kB, CodeEditor 3.24 MB (lazy, expected)                               |
| `npm audit`                                           | 2 low (R19)                                                                                                     |
| Performance, 500-gate 6-qubit file (production build) | parsed, simulated and rendered in ≈ 260 ms. A palette click then gives long tasks of 114 ms + 67 ms; acceptable |

Screenshots are in `D:\Sridatta\QC_Capstone\.playwright-mcp\review-*.png` (not committed).
