"""Cross-check the TypeScript engine against Qiskit.

Reads verify/out/engine_results.json (written by `npm run verify:export`),
rebuilds every circuit in Qiskit, and compares for each circuit:

  (a) every qubit's reduced density matrix rho_k  (engine vs qiskit partial_trace)
  (b) the full statevector, after fixing the qubit ordering (see ENDIANNESS below)
  (c) every qubit's Bloch vector and purity
  (d) V2-7: for several kept sets K per circuit, the subset-reduced rho_K, its purity
      and its von Neumann entropy (engine vs qiskit partial_trace / entropy(base=2))

Prints a summary table and exits with status 1 if any difference exceeds TOL.

Run (with the venv active):  python verify/verify.py

ENDIANNESS -- the one real difference between the two simulators
-----------------------------------------------------------------
Both label the qubits q0, q1, ..., q(n-1). They differ in WHERE each qubit's
bit sits inside the basis-state index i of the 2^n amplitudes:

  engine (big-endian, textbook):   q0 is the MOST  significant bit
      bit of q_k in index i = (i >> (n - 1 - k)) & 1
  Qiskit (little-endian):          q0 is the LEAST significant bit
      bit of q_k in index i = (i >> k) & 1

Example, n = 2, the state "q0 = 0, q1 = 1" (an X on q1):
  engine writes it |q0 q1> = |01>  -> amplitude at index 0b01 = 1
  Qiskit writes it |q1 q0> = |10>  -> amplitude at index 0b10 = 2
Same physical state, different position in the array. To compare the arrays
we reverse the bit string of every Qiskit index (to_big_endian below), which
is exactly what Qiskit's Statevector.reverse_qargs() does.

Reduced density matrices need no correction: partial_trace takes qubit LABELS
(q0, q1, ...), which mean the same thing in both programs, and a single-qubit
rho is just a 2x2 matrix in the basis |0>, |1> of that qubit.

Subset-reduced matrices (d) DO need a correction. partial_trace(state, traced) returns
a matrix over the kept qubits in ascending label order, but little-endian: the
LOWEST kept label is the least significant bit of the reduced index. The engine
reads the kept qubits big-endian (lowest label = most significant bit). So
engine rho_K[a][b] = qiskit rho_K[reverse_bits(a, k)][reverse_bits(b, k)].
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import qiskit
from qiskit import QuantumCircuit
from qiskit.quantum_info import DensityMatrix, Statevector, entropy, partial_trace

TOL = 1e-9
RESULTS = Path(__file__).resolve().parent / "out" / "engine_results.json"

# Pauli matrices, used to read the Bloch vector off a 2x2 rho: r_a = Tr(rho * sigma_a).
PAULI_X = np.array([[0, 1], [1, 0]], dtype=complex)
PAULI_Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
PAULI_Z = np.array([[1, 0], [0, -1]], dtype=complex)


# ---------------------------------------------------------------------------
# Rebuilding the engine's circuit in Qiskit
# ---------------------------------------------------------------------------
def sorted_operations(ops: list[dict]) -> list[dict]:
    """Time order used by the engine: by column, then by lowest qubit.

    Python's sort is stable, like JavaScript's, so ties keep the array order
    exactly as in the engine's sortedOperations().
    """
    return sorted(ops, key=lambda op: (op["column"], min(op["qubits"])))


def build_qiskit_circuit(circuit: dict) -> QuantumCircuit:
    """Same gates, same qubit labels, same order. The qubit list order inside an
    operation matches Qiskit's argument order: CX [control, target],
    CCX [control1, control2, target], SWAP [a, b]."""
    qc = QuantumCircuit(circuit["numQubits"])
    for op in sorted_operations(circuit["operations"]):
        gate, q = op["gate"], op["qubits"]
        match gate:
            case "I":
                qc.id(q[0])
            case "H":
                qc.h(q[0])
            case "X":
                qc.x(q[0])
            case "Y":
                qc.y(q[0])
            case "Z":
                qc.z(q[0])
            case "S":
                qc.s(q[0])
            case "Sdg":
                qc.sdg(q[0])
            case "T":
                qc.t(q[0])
            case "Tdg":
                qc.tdg(q[0])
            case "RX":
                qc.rx(op["angle"], q[0])
            case "RY":
                qc.ry(op["angle"], q[0])
            case "RZ":
                qc.rz(op["angle"], q[0])
            case "CX":
                qc.cx(q[0], q[1])
            case "CZ":
                qc.cz(q[0], q[1])
            case "SWAP":
                qc.swap(q[0], q[1])
            case "CCX":
                qc.ccx(q[0], q[1], q[2])
            case _:
                raise ValueError(f"Unknown gate {gate!r}")
    return qc


# ---------------------------------------------------------------------------
# Ordering fix (see ENDIANNESS in the module docstring)
# ---------------------------------------------------------------------------
def reverse_bits(index: int, n: int) -> int:
    """Reverse the n-bit binary string of index, e.g. n = 3: 0b001 -> 0b100."""
    out = 0
    for _ in range(n):
        out = (out << 1) | (index & 1)
        index >>= 1
    return out


def to_big_endian(qiskit_amplitudes: np.ndarray, n: int) -> np.ndarray:
    """Re-index a little-endian (Qiskit) statevector into big-endian (engine) order.

    The amplitude Qiskit stores at index j belongs to the basis state whose
    engine index is reverse_bits(j): same qubit values, bits read the other way.
    """
    out = np.empty_like(qiskit_amplitudes)
    for j, amp in enumerate(qiskit_amplitudes):
        out[reverse_bits(j, n)] = amp
    return out


def reduced_to_big_endian(rho: np.ndarray, k: int) -> np.ndarray:
    """Re-index a k-qubit little-endian (Qiskit) matrix into big-endian (engine) order."""
    perm = [reverse_bits(a, k) for a in range(2**k)]
    return rho[np.ix_(perm, perm)]


def qiskit_subset_rho(state: Statevector, keep: list[int]) -> np.ndarray:
    """Qiskit's reduced rho of the kept qubits, in the engine's (big-endian) basis."""
    n = state.num_qubits
    traced = [q for q in range(n) if q not in keep]
    rho = partial_trace(state, traced).data if traced else DensityMatrix(state).data
    return reduced_to_big_endian(rho, len(keep))


def endianness_self_test() -> None:
    """Demonstrate (and assert) the ordering difference on the |01> example."""
    qc = QuantumCircuit(2)
    qc.x(1)  # q0 = 0, q1 = 1
    data = Statevector(qc).data
    assert abs(data[0b10]) == 1, "Qiskit should put q1 = 1 at index 2 (little-endian)"
    fixed = to_big_endian(data, 2)
    assert abs(fixed[0b01]) == 1, "after reversal it should be at index 1 (big-endian)"
    assert np.allclose(fixed, Statevector(qc).reverse_qargs().data)

    # Subset ordering: q0 = 1, q1 = 0, q2 = 0; keep {0, 2} -> engine |q0 q2> = |10> (index 2).
    qc3 = QuantumCircuit(3)
    qc3.x(0)
    rho = qiskit_subset_rho(Statevector(qc3), [0, 2])
    assert abs(rho[0b10, 0b10] - 1) < 1e-12, "kept set must be read big-endian after the fix"


# ---------------------------------------------------------------------------
# Comparison
# ---------------------------------------------------------------------------
def complex_array(pairs) -> np.ndarray:
    """[[re, im], ...] (any nesting) -> numpy complex array."""
    a = np.asarray(pairs, dtype=float)
    return a[..., 0] + 1j * a[..., 1]


def compare(entry: dict) -> dict:
    """Max absolute differences between engine and Qiskit for one circuit."""
    circuit = entry["circuit"]
    n = circuit["numQubits"]
    state = Statevector(build_qiskit_circuit(circuit))

    # (b) full statevector, after converting Qiskit's order to the engine's.
    engine_psi = complex_array(entry["state"])
    qiskit_psi = to_big_endian(state.data, n)
    d_psi = float(np.max(np.abs(engine_psi - qiskit_psi)))

    d_rho = d_bloch = d_purity = 0.0
    for q in entry["qubits"]:
        k = q["qubit"]
        # (a) reduced rho_k: trace out every qubit except k.
        others = [j for j in range(n) if j != k]
        if others:
            rho = partial_trace(state, others).data
        else:  # 1-qubit circuit: nothing to trace out, rho = |psi><psi|
            rho = np.outer(state.data, state.data.conj())
        d_rho = max(d_rho, float(np.max(np.abs(complex_array(q["rho"]) - rho))))

        # (c) Bloch vector r = (Tr(rho X), Tr(rho Y), Tr(rho Z)) and purity Tr(rho^2).
        r = np.real([np.trace(rho @ P) for P in (PAULI_X, PAULI_Y, PAULI_Z)])
        b = q["bloch"]
        d_bloch = max(d_bloch, float(np.max(np.abs(r - [b["x"], b["y"], b["z"]]))))
        d_purity = max(d_purity, abs(q["purity"] - float(np.real(np.trace(rho @ rho)))))

    return {"rho": d_rho, "psi": d_psi, "bloch": d_bloch, "purity": d_purity}


def compare_subsets(entry: dict) -> dict:
    """(d) Max differences over this circuit's kept sets: rho_K, purity and entropy."""
    state = Statevector(build_qiskit_circuit(entry["circuit"]))
    d = {"rho": 0.0, "purity": 0.0, "entropy": 0.0}
    for sub in entry["subsets"]:
        rho = qiskit_subset_rho(state, sub["keep"])
        d["rho"] = max(d["rho"], float(np.max(np.abs(complex_array(sub["rho"]) - rho))))
        d["purity"] = max(d["purity"], abs(sub["purity"] - float(np.real(np.trace(rho @ rho)))))
        s_qiskit = float(entropy(DensityMatrix(rho), base=2))
        d["entropy"] = max(d["entropy"], abs(sub["entropy"] - s_qiskit))
    return d


def subset_report(data: dict) -> list[str]:
    """(d) Compare every kept set; print a second table; return failure lines."""
    stats: dict[str, dict] = {}
    failures: list[str] = []
    for entry in data["circuits"]:
        if not entry.get("subsets"):
            continue
        d = compare_subsets(entry)
        s = stats.setdefault(
            entry["category"], {"n": 0, "sets": 0, "rho": 0.0, "purity": 0.0, "entropy": 0.0}
        )
        s["n"] += 1
        s["sets"] += len(entry["subsets"])
        for key in ("rho", "purity", "entropy"):
            s[key] = max(s[key], d[key])
        if max(d.values()) > TOL:
            failures.append(
                f"  [subsets] {entry['category']} / {entry['name']}: "
                + ", ".join(f"max|d{k}| = {v:.3e}" for k, v in d.items())
            )

    print("\nKeep-any-subset partial trace (V2-7): engine vs partial_trace + entropy(base=2)\n")
    header = (
        f"{'category':<22}{'circuits':>9}{'kept sets':>10}"
        f"{'max|Δρ_K|':>12}{'max|Δpur|':>12}{'max|ΔS|':>12}  result"
    )
    print(header)
    print("-" * len(header))
    total = {"n": 0, "sets": 0, "rho": 0.0, "purity": 0.0, "entropy": 0.0}
    for cat, s in stats.items():
        ok = max(s["rho"], s["purity"], s["entropy"]) <= TOL
        print(
            f"{cat:<22}{s['n']:>9}{s['sets']:>10}{s['rho']:>12.2e}{s['purity']:>12.2e}"
            f"{s['entropy']:>12.2e}  {'PASS' if ok else 'FAIL'}"
        )
        total["n"] += s["n"]
        total["sets"] += s["sets"]
        for key in ("rho", "purity", "entropy"):
            total[key] = max(total[key], s[key])
    print("-" * len(header))
    print(
        f"{'TOTAL':<22}{total['n']:>9}{total['sets']:>10}{total['rho']:>12.2e}"
        f"{total['purity']:>12.2e}{total['entropy']:>12.2e}  {'FAIL' if failures else 'PASS'}"
    )
    return failures


def main() -> int:
    # The table uses Greek letters; Windows consoles default to a legacy code page.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if not RESULTS.exists():
        print(f"Missing {RESULTS}. Run `npm run verify:export` first.", file=sys.stderr)
        return 2
    data = json.loads(RESULTS.read_text(encoding="utf-8"))
    endianness_self_test()

    # category -> aggregated stats, in first-seen order
    stats: dict[str, dict] = {}
    failures: list[str] = []
    for entry in data["circuits"]:
        d = compare(entry)
        s = stats.setdefault(
            entry["category"], {"n": 0, "rho": 0.0, "psi": 0.0, "bloch": 0.0, "purity": 0.0}
        )
        s["n"] += 1
        for key in ("rho", "psi", "bloch", "purity"):
            s[key] = max(s[key], d[key])
        worst = max(d.values())
        if worst > TOL:
            failures.append(
                f"  {entry['category']} / {entry['name']}: "
                + ", ".join(f"max|d{k}| = {v:.3e}" for k, v in d.items())
            )

    print(f"Qiskit {qiskit.__version__}, numpy {np.__version__}, tolerance {TOL:g}")
    print(f"Engine results generated {data['generatedAt']}, random seed {data['randomSeed']}\n")
    header = f"{'category':<22}{'circuits':>9}{'max|Δρ|':>12}{'max|Δψ|':>12}{'max|Δr|':>12}{'max|Δpur|':>12}  result"
    print(header)
    print("-" * len(header))
    total = 0
    overall = {"rho": 0.0, "psi": 0.0, "bloch": 0.0, "purity": 0.0}
    for cat, s in stats.items():
        ok = max(s["rho"], s["psi"], s["bloch"], s["purity"]) <= TOL
        print(
            f"{cat:<22}{s['n']:>9}{s['rho']:>12.2e}{s['psi']:>12.2e}"
            f"{s['bloch']:>12.2e}{s['purity']:>12.2e}  {'PASS' if ok else 'FAIL'}"
        )
        total += s["n"]
        for key in overall:
            overall[key] = max(overall[key], s[key])
    print("-" * len(header))
    print(
        f"{'TOTAL':<22}{total:>9}{overall['rho']:>12.2e}{overall['psi']:>12.2e}"
        f"{overall['bloch']:>12.2e}{overall['purity']:>12.2e}  {'FAIL' if failures else 'PASS'}"
    )

    failures += subset_report(data)

    if failures:
        print(f"\n{len(failures)} circuit(s) differ by more than {TOL:g}:")
        print("\n".join(failures))
        return 1
    print(f"\nAll {total} circuits (and all their kept sets) agree with Qiskit to within {TOL:g}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
