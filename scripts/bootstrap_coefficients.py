"""
bootstrap_coefficients.py — country-level cluster bootstrap of the production fit.

WHY THIS EXISTS
---------------
The coefficient forest plots (Supplementary Figure S2) showed the retired
eight-channel model, including a cultural-intensity coefficient of +5.08 that the
paper withdraws. The production fit (`coefficient_fit.json`) had point estimates
only, so a forest plot could not be redrawn honestly.

METHOD (disclosed in the figure caption)
----------------------------------------
Countries are resampled with replacement (B draws, fixed seed); each draw is
refitted by bounded L-BFGS-B started at the shipped optimum, with the same loss,
bounds and target anchoring as `fit_coefficients_v2.py`. The global search is not
repeated per draw, so the intervals are conditional on the shipped basin and are
percentile intervals of a local refit, not a full re-optimisation. That is
stated rather than implied. Where alpha and beta sit on their lower bound the
interval collapses onto the bound, which is itself the finding.

Usage:
    python3 scripts/bootstrap_coefficients.py
"""

from __future__ import annotations

import importlib.util
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import minimize

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("fit_v2", ROOT / "scripts" / "fit_coefficients_v2.py")
fit = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(fit)  # type: ignore[union-attr]

COMMITTED = ROOT / "src" / "data" / "analysis" / "coefficient_fit.json"
OUT = ROOT / "src" / "data" / "analysis" / "coefficient_bootstrap.json"
RESAMPLES = 300
SEED = 20260101
NAMES = ("phi0", "alpha", "beta", "k", "c_M", "c_T", "c_E", "c_R", "c_tr", "c_yr")
BOUNDS = [
    (-10, 10),
    (math.log(0.05), math.log(5.0)),
    (math.log(0.05), math.log(5.0)),
    (math.log(1e-4), math.log(50.0)),
    (-5, 5), (-5, 5), (-5, 5), (-5, 5),
    (-5, 5), (-5, 5),
]


def to_arrays(rows: list[dict]) -> dict[str, np.ndarray]:
    cols = {k: np.array([r[k] for r in rows], dtype=float) for k in ("X", "Y", "T", "E", "R", "M", "Z")}
    cols["xs"] = np.array([fit.structural_x(v) for v in cols["X"]])
    cols["ys"] = np.array([fit.structural_y(v) for v in cols["Y"]])
    return cols


def predict(theta: np.ndarray, d: dict[str, np.ndarray]) -> np.ndarray:
    phi = (
        theta[0] + theta[4] * d["M"] + theta[5] * d["T"] + theta[6] * d["E"] + theta[7] * d["R"]
        + theta[8] * d["T"] * d["R"] + theta[9] * d["ys"] * d["R"]
    )
    phi = np.clip(phi, -fit.PHI_CLAMP, fit.PHI_CLAMP)
    num = d["xs"] ** math.exp(theta[1]) * d["ys"] ** math.exp(theta[2]) * np.exp(phi)
    return num / (num + math.exp(theta[3]))


def main() -> None:
    rows = fit.read_panel()
    params = json.loads(COMMITTED.read_text())["parameters"]
    theta0 = np.array([
        params["phi0"], math.log(params["alpha"]), math.log(params["beta"]), math.log(params["k"]),
        params["c_M"], params["c_T"], params["c_E"], params["c_R"], params["c_tr"], params["c_yr"],
    ])
    z_raw = np.array([r["Z"] for r in rows])
    lo, hi = np.percentile(z_raw, [1, 99])

    full = to_arrays(rows)
    check = fit.predict(theta0, rows)
    assert np.allclose(check, predict(theta0, full), atol=1e-12), "vectorised predict disagrees with the fit script"

    def make_loss(d: dict[str, np.ndarray]):
        target = np.clip((d["Z"] - lo) / (hi - lo), 1e-6, 1 - 1e-6)

        def loss(theta: np.ndarray) -> float:
            pred = np.clip(predict(theta, d), 1e-9, 1 - 1e-9)
            return float(np.mean((pred - target) ** 2))

        return loss

    base = minimize(make_loss(full), theta0, method="L-BFGS-B", bounds=BOUNDS, options={"maxiter": 5000})
    by_country: dict[str, list[dict]] = {}
    for r in rows:
        by_country.setdefault(r["iso3"], []).append(r)
    groups = list(by_country.values())
    rng = np.random.default_rng(SEED)
    draws = []
    for _ in range(RESAMPLES):
        pick = rng.integers(0, len(groups), size=len(groups))
        sample = [r for i in pick for r in groups[i]]
        res = minimize(make_loss(to_arrays(sample)), theta0, method="L-BFGS-B", bounds=BOUNDS, options={"maxiter": 2000})
        draws.append(res.x)
    arr = np.array(draws)
    natural = arr.copy()
    natural[:, 1:4] = np.exp(natural[:, 1:4])
    est = {n: params[n] for n in NAMES}
    summary = {}
    for j, name in enumerate(NAMES):
        q = np.percentile(natural[:, j], [2.5, 50, 97.5])
        same_sign = float(np.mean(np.sign(natural[:, j]) == np.sign(est[name])))
        summary[name] = {
            "estimate": est[name], "lo": float(q[0]), "median": float(q[1]), "hi": float(q[2]),
            "shareSameSign": same_sign, "excludesZero": bool(q[0] > 0 or q[2] < 0),
        }
    # phi0 and k enter only through phi0 - ln k when alpha and beta sit on their bound
    # (the structural base is then ~1), so the single identified quantity is reported too.
    ident = natural[:, 0] - np.log(natural[:, 3])
    qi = np.percentile(ident, [2.5, 50, 97.5])
    est_ident = est["phi0"] - math.log(est["k"])
    summary["phi0_minus_lnk"] = {
        "estimate": est_ident, "lo": float(qi[0]), "median": float(qi[1]), "hi": float(qi[2]),
        "shareSameSign": float(np.mean(np.sign(ident) == np.sign(est_ident))), "excludesZero": bool(qi[0] > 0 or qi[2] < 0),
    }
    floor = 0.05
    out = {
        "schemaVersion": "phase1.coefficient_bootstrap.v1",
        "generatedAtIso": datetime.now(timezone.utc).isoformat(),
        "method": (
            f"Country-level cluster bootstrap, {RESAMPLES} resamples, seed {SEED}; each draw refitted by bounded "
            "L-BFGS-B from the shipped optimum (same loss, bounds and fixed 1st/99th-percentile target anchoring as "
            "fit_coefficients_v2.py). Intervals are percentile intervals of a local refit conditional on the shipped basin."
        ),
        "resamples": RESAMPLES,
        "nCountries": len(groups),
        "refitOfFullPanelLoss": float(base.fun),
        "parameters": summary,
        "shareOnLowerBound": {
            "alpha": float(np.mean(natural[:, 1] <= floor * (1 + 1e-6))),
            "beta": float(np.mean(natural[:, 2] <= floor * (1 + 1e-6))),
        },
    }
    OUT.write_text(json.dumps(out, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {OUT.name}; alpha on bound in {out['shareOnLowerBound']['alpha']:.2f} of draws")
    for n in (*NAMES, "phi0_minus_lnk"):
        s = summary[n]
        print(f"  {n:6s} {s['estimate']:+.4f}  [{s['lo']:+.4f}, {s['hi']:+.4f}]")


if __name__ == "__main__":
    main()
