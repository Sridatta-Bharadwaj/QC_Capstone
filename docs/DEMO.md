# Demo script

A 6–8 minute live demo of the app for the capstone presentation. Each step lists what to do,
what the audience should see, and one sentence to say. Every step has a fallback, so a single
failure never stops the demo.

## Before the demo

- [ ] Use the **served production build**, not the dev server: `npm run build`, then
      `npm run preview` (http://localhost:4173). It needs no internet connection. Do not open
      `dist/index.html` directly from disk; browsers block the app's workers there.
- [ ] Set the browser window to the projector size (1280×720 is tested) and zoom to 100 %.
- [ ] Start from a clean workspace: click **New circuit** in the title bar.
- [ ] Choose the theme you will start in (light reads better on most projectors).
- [ ] Keep `docs/demo/ghz-from-qiskit.qasm` at hand (a Qiskit-style export with a custom gate,
      a barrier and final measurements).
- [ ] Backup: the screen recording of this script, and the screenshots in `docs/screenshots/`.

## 1. One qubit, superposition (≈ 45 s)

1. Click the preset **Superposition |+⟩**.
2. Point at the sphere: the arrow is on the +x axis, |r| = 1, purity 1.

> "One qubit after a Hadamard. Pure state, so the Bloch vector sits on the surface."

**Fallback:** drag **H** from the palette onto q0.

## 2. Watch entanglement appear, step by step (≈ 90 s)

1. Click the preset **Bell state Φ⁺**. Both arrows are gone; each sphere shows **r = 0**.
2. In the timeline under the canvas, click **First step** (the start state): both qubits at |0⟩.
3. Click **Next step**: column 0 (H) is highlighted; q0 points to +x, q1 still at |0⟩. Both
   are pure.
4. Click **Next step**: after the CX both vectors shrink to the centre; status bar shows
   "Entangled: q0, q1", purity 0.500 each.
5. Open **Density Matrices**: ρ of q0 is diag(0.5, 0.5). Click **q1** in "Keep qubits" to keep
   both: the 4×4 ρ is pure again (purity 1, entropy 0), while each qubit alone has S = 1 bit.
6. Click **Live** to return to the final state.

> "The whole state is pure, but each qubit alone is maximally mixed. The missing information
> lives in the correlations: that is what the partial trace throws away."

**Fallback:** if the timeline does not respond, click the canvas (focuses it) and use `[` / `]`;
or skip straight to step 5.

## 3. Rotation slider (≈ 60 s)

1. Click the preset **Partially entangled pair**, then click the **Ry** gate on q0.
2. In the inspector, drag the **slider**: as θ goes from 0 to π the arrows shrink from the north
   pole to the centre (θ = π/2, hold Shift to snap) and back out towards |1⟩.
3. Press **Ctrl+Z** once (with focus outside the editor): the whole drag is undone in one step.

> "The amount of entanglement follows the angle continuously: purity goes from 1 to 0.5."

**Fallback:** type `pi/2` into the θ field and press Enter.

## 4. Edit the Qiskit code (≈ 60 s)

1. Open the **Qiskit** tab in the code panel.
2. Add a line `qc.h(1)` under the existing gates (or change `qc.cx(0, 1)` to `qc.cz(0, 1)`).
   After a moment the canvas, the spheres and the QASM tab update; the Qiskit text stays as
   typed.
3. Type a mistake, e.g. `qc.hh(0)`: a squiggle appears, the Problems tab shows
   "Unknown method 'qc.hh'. Did you mean 'qc.h'?", and the last valid circuit stays on screen.
   Undo the typo with Ctrl+Z inside the editor.

> "Both code tabs are live. The Python is never executed; a parser reads the straight-line
> subset, which is why it can map back to the circuit exactly."

**Fallback:** do the same edit in the **QASM** tab (`h q[1];`).

## 5. Open a file (≈ 45 s)

1. Click **Open file** (folder icon in the code panel) and choose
   `docs/demo/ghz-from-qiskit.qasm`, or drag it onto the window.
2. The QASM tab shows the file as written; the custom `entangle` gate is expanded, the canvas
   shows a GHZ circuit, and all three spheres show r = 0. The Problems tab lists warnings:
   barrier and the final measurements are ignored.

> "A real export from Qiskit, including a user-defined gate and measurements, loads directly.
> We show the state just before measurement."

**Fallback:** click the preset **GHZ (3 qubits)**.

## 6. Share and theme (≈ 30 s)

1. Click **Copy link** (title bar). Paste it into a new tab: the same circuit opens. Nothing is
   uploaded; the whole circuit is in the link.
2. Click the theme toggle: the editor, the spheres and every panel switch together.
3. Optional: **Download → Bloch spheres (.png)** to show the exported image.

**Fallback:** skip the new tab; just show the "Link copied" notice.

## If something goes wrong

- **Strange state or stuck screen:** click **New circuit**, then a preset. Undo (Ctrl+Z) is
  available if you clicked it by mistake.
- **Page reloaded:** the circuit is restored automatically from the browser.
- **The app does not load at all:** switch to the screen recording, then the screenshots.
- **Projector resolution differs:** the layout refits when the window is resized; reload if
  the spheres look too small.
