"""
window_sensitivity.py — verify the unified structural contract and refit.

WHY THIS EXISTS
---------------
The fitting script, runtime model, and evaluation now share the canonical panel's
realised X/Y ranges and the current-panel 1st/99th-percentile Z anchors. This artifact
checks that the three contracts agree and records the unified fit. Historical window
comparisons are retained in the version history; they are not mixed into the current
production artifact.

Usage:
    python3 scripts/window_sensitivity.py
"""

from __future__ import annotations

import importlib.util
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import differential_evolution, minimize

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("fit_v2", ROOT / "scripts" / "fit_coefficients_v2.py")
fit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fit)  # type: ignore[union-attr]
OUT = ROOT / "src" / "data" / "analysis" / "structural_window_sensitivity.json"
CONTRACT = ROOT / "src" / "utils" / "modelContract.ts"
NAMES = ("phi0", "alpha", "beta", "k", "c_M", "c_T", "c_E", "c_R", "c_tr", "c_yr")


def contract_window() -> tuple[float, float, float, float]:
    text = CONTRACT.read_text(encoding="utf-8")
    vals = {}
    for key in ("PANEL_X_MIN", "PANEL_X_MAX", "PANEL_Y_MIN", "PANEL_Y_MAX"):
        line = next(l for l in text.splitlines() if l.startswith(f"export const {key}"))
        vals[key] = float(line.split("=")[1].strip().rstrip(";"))
    return vals["PANEL_X_MIN"], vals["PANEL_X_MAX"], vals["PANEL_Y_MIN"], vals["PANEL_Y_MAX"]


BOUNDS = [
    (-10, 10), (math.log(0.05), math.log(5.0)), (math.log(0.05), math.log(5.0)), (math.log(1e-4), math.log(50.0)),
    (-5, 5), (-5, 5), (-5, 5), (-5, 5), (-5, 5), (-5, 5),
]
LOWER_BOUND_ALPHA = 0.05


def refit_under_window(rows: list[dict], win: tuple[float, float, float, float], lo: float, hi: float) -> dict:
    """Full two-stage refit (differential evolution then L-BFGS-B), same settings as the fit script."""
    fit.PANEL_X_MIN, fit.PANEL_X_MAX, fit.PANEL_Y_MIN, fit.PANEL_Y_MAX = win
    cols = {k: np.array([r[k] for r in rows], dtype=float) for k in ("X", "Y", "T", "E", "R", "M", "Z")}
    xs = np.array([fit.structural_x(v) for v in cols["X"]])
    ys = np.array([fit.structural_y(v) for v in cols["Y"]])
    target = np.clip((cols["Z"] - lo) / (hi - lo), 1e-6, 1 - 1e-6)

    def predict(t: np.ndarray) -> np.ndarray:
        phi = t[0] + t[4] * cols["M"] + t[5] * cols["T"] + t[6] * cols["E"] + t[7] * cols["R"] + t[8] * cols["T"] * cols["R"] + t[9] * ys * cols["R"]
        num = xs ** math.exp(t[1]) * ys ** math.exp(t[2]) * np.exp(np.clip(phi, -fit.PHI_CLAMP, fit.PHI_CLAMP))
        return num / (num + math.exp(t[3]))

    def loss(t: np.ndarray) -> float:
        return float(np.mean((np.clip(predict(t), 1e-9, 1 - 1e-9) - target) ** 2))

    de = differential_evolution(loss, BOUNDS, seed=42, maxiter=600, popsize=25, tol=1e-10, polish=False, workers=1, updating="deferred")
    lb = minimize(loss, de.x, method="L-BFGS-B", bounds=BOUNDS, options={"maxiter": 5000})
    theta = lb.x if lb.fun <= de.fun else de.x
    resid = cols["Z"] - fit.to_observed(predict(theta), lo, hi)
    return {
        "loss": float(min(lb.fun, de.fun)),
        "r2": float(1 - (resid ** 2).sum() / ((cols["Z"] - cols["Z"].mean()) ** 2).sum()),
        "alpha": float(math.exp(theta[1])), "beta": float(math.exp(theta[2])), "k": float(math.exp(theta[3])),
        "alphaOnLowerBound": bool(math.exp(theta[1]) <= LOWER_BOUND_ALPHA * (1 + 1e-6)),
        "betaOnLowerBound": bool(math.exp(theta[2]) <= LOWER_BOUND_ALPHA * (1 + 1e-6)),
        "coefficients": {n: float(v) for n, v in zip(("phi0", "c_M", "c_T", "c_E", "c_R", "c_tr", "c_yr"), (theta[0], *theta[4:]))},
    }


FE_MODULE = ROOT / "src" / "data" / "feCoefficients.ts"


def evaluation_anchors() -> tuple[float, float]:
    """Z_NORMALIZATION min/max used by the TypeScript evaluation."""
    text = FE_MODULE.read_text(encoding="utf-8")
    block = text[text.index("export const Z_NORMALIZATION"):]
    block = block[: block.index("}")]
    vals = {}
    for key in ("min", "max"):
        line = next(l for l in block.splitlines() if l.strip().startswith(f"{key}:"))
        vals[key] = float(line.split(":")[1].split(",")[0].strip())
    return vals["min"], vals["max"]


def bounded_r2(pred: np.ndarray, z: np.ndarray, lo: float, hi: float) -> float:
    target = np.clip((z - lo) / (hi - lo), 1e-4, 1 - 1e-4)
    return float(1 - ((target - pred) ** 2).sum() / ((target - target.mean()) ** 2).sum())


def main() -> None:
    rows = fit.read_panel()
    params = json.loads((ROOT / "src" / "data" / "analysis" / "coefficient_fit.json").read_text())["parameters"]
    theta = np.array([
        params["phi0"], math.log(params["alpha"]), math.log(params["beta"]), math.log(params["k"]),
        params["c_M"], params["c_T"], params["c_E"], params["c_R"], params["c_tr"], params["c_yr"],
    ])
    z = np.array([r["Z"] for r in rows])
    x = np.array([r["X"] for r in rows])
    y = np.array([r["Y"] for r in rows])
    lo, hi = np.percentile(z, [1, 99])
    windows = {
        "fitting": (fit.PANEL_X_MIN, fit.PANEL_X_MAX, fit.PANEL_Y_MIN, fit.PANEL_Y_MAX),
        "evaluationContract": contract_window(),
        "realisedRange": (float(x.min()), float(x.max()), float(y.min()), float(y.max())),
    }
    ev_lo, ev_hi = evaluation_anchors()
    fit.PANEL_X_MIN, fit.PANEL_X_MAX, fit.PANEL_Y_MIN, fit.PANEL_Y_MAX = windows["fitting"]
    shipped_bounded = fit.predict(theta, rows)
    anchoring = {
        "fitAnchors": {"lo": float(lo), "hi": float(hi)},
        "evaluationAnchors": {"lo": ev_lo, "hi": ev_hi},
        "boundedR2UnderFitAnchors": bounded_r2(shipped_bounded, z, float(lo), float(hi)),
        "boundedR2UnderEvaluationAnchors": bounded_r2(shipped_bounded, z, ev_lo, ev_hi),
        "scale": "R2 of the shipped coefficients (fitting window) against the outcome normalised with each pair of anchors, on the bounded scale",
    }
    results = {}
    reference = None
    for name, win in windows.items():
        fit.PANEL_X_MIN, fit.PANEL_X_MAX, fit.PANEL_Y_MIN, fit.PANEL_Y_MAX = win
        bounded = fit.predict(theta, rows)
        pred = fit.to_observed(bounded, lo, hi)
        if reference is None:
            reference = bounded
        resid = z - pred
        results[name] = {
            "xMin": win[0], "xMax": win[1], "yMin": win[2], "yMax": win[3],
            "rowsClampedX": int(((x < win[0]) | (x > win[1])).sum()),
            "rowsClampedY": int(((y < win[2]) | (y > win[3])).sum()),
            "r2": float(1 - (resid ** 2).sum() / ((z - z.mean()) ** 2).sum()),
            "corr": float(np.corrcoef(z, pred)[0, 1]),
            "mae": float(np.abs(resid).mean()),
            "maxAbsBoundedShiftVsFitting": float(np.abs(bounded - reference).max()),
        }
    out = {
        "schemaVersion": "phase1.structural_window_sensitivity.v1",
        "generatedAtIso": datetime.now(timezone.utc).isoformat(),
        "purpose": "Verify the shared realised-range X/Y contract and current-panel percentile anchors; record the unified refit.",
        "scale": "observed Z scale, after mapping predictions back with the fit script's 1st/99th-percentile anchoring",
        "nRows": len(rows),
        "windows": results,
        "anchoring": anchoring,
        "refitRealisedRange": refit_under_window(rows, windows["realisedRange"], lo, hi),
        "refitFittingWindow": None,
        "note": "Fitting, evaluation, and realised-range windows are expected to be identical. The refit uses the Python fit implementation; the TypeScript headline uses the runtime bounded-map implementation.",
    }
    out["refitFittingWindow"] = out["refitRealisedRange"]
    OUT.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    for n, r in results.items():
        print(f"{n:20s} R2 {r['r2']:.4f}  clamped X/Y {r['rowsClampedX']}/{r['rowsClampedY']}  max bounded shift {r['maxAbsBoundedShiftVsFitting']:.4f}")


if __name__ == "__main__":
    main()
