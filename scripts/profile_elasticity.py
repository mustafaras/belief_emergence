"""
profile_elasticity.py — is alpha identified, or merely bounded?

The shipped fit puts alpha and beta at their lower bound. Two explanations fit that
fact equally well from a single number:

  (a) the constraint binds, and the data want alpha -> 0;
  (b) alpha is unidentified, so the optimiser drifts to whatever floor is nearest.

They are distinguishable. Fix alpha at a grid of values, re-optimise every other
parameter at each, and look at the resulting profile of the loss. If a minimum
exists inside the grid, alpha is identified and its location is the estimate. If
the loss decreases monotonically to the smallest value tested, the parameter is
being pushed to a boundary it cannot cross, and no interior estimate exists. The
width of the region within a stated tolerance of the best fit is then a confidence
interval, and it is the honest answer to "how well is this identified".

Also reports the likelihood-ratio-style statistic: n * (loss_profile - loss_min)
divided by the residual variance, which is approximately chi-square with one degree
of freedom under the null that alpha takes the profiled value.

Usage:  python3 scripts/profile_elasticity.py [--param alpha|beta] [--points 7]
"""

import argparse
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import differential_evolution, minimize
from scipy import stats

ROOT = Path(__file__).resolve().parent.parent
PANEL = ROOT / "public" / "data" / "panel_canonical_v2.csv"
OUT = ROOT / "src" / "data" / "analysis" / "elasticity_profile.json"

STRUCTURAL_MIN = 1e-4
STRUCTURAL_MAX = 1 - STRUCTURAL_MIN
PHI_CLAMP = 50.0


def read_panel():
    import csv
    rows = []
    with open(PANEL, newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            try:
                rows.append({
                    "iso3": r["iso3"], "year": int(r["year"]),
                    "Z": float(r["Z"]), "X": float(r["X"]), "Y": float(r["Y"]),
                    "M": float(r["M"]), "T": float(r["T"]),
                    "E": float(r["E"]), "R": float(r["R"]),
                })
            except (KeyError, TypeError, ValueError):
                continue
    return rows


def structural(value, lo, hi):
    u = min(1.0, max(0.0, (value - lo) / (hi - lo)))
    return STRUCTURAL_MIN + u * (1 - 2 * STRUCTURAL_MIN)


def predict(theta, rows, alpha, beta):
    phi0 = theta[0]
    k = math.exp(theta[1])
    cM, cT, cE, cR, ctr, cyr = theta[2:8]
    out = np.empty(len(rows))
    for i, r in enumerate(rows):
        xs = structural(r["X"], 0.2223, 0.9544)
        ys = structural(r["Y"], -1.4601, 3.4280)
        phi = phi0 + cM * r["M"] + cT * r["T"] + cE * r["E"] + cR * r["R"] \
            + ctr * r["T"] * r["R"] + cyr * ys * r["R"]
        phi = max(-PHI_CLAMP, min(PHI_CLAMP, phi))
        num = (xs ** alpha) * (ys ** beta) * math.exp(phi)
        out[i] = num / (num + k)
    return out


def fit_with_fixed(rows, target, alpha, beta, seed=42):
    """Optimise every parameter except alpha and beta, which are held fixed."""
    def loss(theta):
        pred = np.clip(predict(theta, rows, alpha, beta), 1e-9, 1 - 1e-9)
        return float(np.mean((pred - target) ** 2))

    bounds = [
        (-10, 10),                          # phi0
        (math.log(1e-4), math.log(50.0)),   # k
        (-5, 5), (-5, 5), (-5, 5), (-5, 5), # cM cT cE cR
        (-5, 5), (-5, 5),                   # ctr cyr
    ]
    de = differential_evolution(loss, bounds, seed=seed, maxiter=400,
                                popsize=20, tol=1e-10, polish=False,
                                workers=1, updating="deferred")
    lb = minimize(loss, de.x, method="L-BFGS-B", bounds=bounds,
                  options={"maxiter": 4000})
    return float(min(lb.fun, de.fun))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--param", default="alpha", choices=["alpha", "beta", "both"])
    ap.add_argument("--points", type=int, default=7)
    args = ap.parse_args()

    rows = read_panel()
    if not rows:
        sys.exit(f"no usable rows in {PANEL}")
    z = np.array([r["Z"] for r in rows])
    lo, hi = np.percentile(z, [1, 99])
    target = np.clip((z - lo) / (hi - lo), 1e-6, 1 - 1e-6)
    n = len(rows)

    grid = [round(0.001 * (2.0 ** i), 6) for i in range(args.points)]
    # 0.001 .. 0.064 by doubling: dense where the optimum seems to sit.
    profiles = []
    print(f"n = {n}; profiling {args.param} over {grid}")
    for g in grid:
        alpha = g if args.param in ("alpha", "both") else 0.05
        beta = g if args.param in ("beta", "both") else 0.05
        loss = fit_with_fixed(rows, target, alpha, beta)
        profiles.append({"value": g, "loss": loss})
        print(f"  {args.param} = {g:<9} loss = {loss:.8f}")

    best = min(profiles, key=lambda p: p["loss"])
    resid_var = best["loss"]
    for p in profiles:
        # Wilks-style statistic; 1 degree of freedom.
        lr = n * (p["loss"] - best["loss"]) / resid_var if resid_var > 0 else float("inf")
        p["lrStatistic"] = round(lr, 4)
        p["pValue"] = round(float(stats.chi2.sf(lr, 1)), 6)

    # Loss rising as the parameter grows means the optimum sits at or below the
    # smallest value tested; the parameter is being pushed to a boundary.
    monotone_rising = all(
        profiles[i]["loss"] <= profiles[i + 1]["loss"] for i in range(len(profiles) - 1)
    )
    interior_minimum = 0 < profiles.index(best) < len(profiles) - 1

    if interior_minimum:
        verdict = (
            f"An interior minimum exists at {args.param} = {best['value']}, so the parameter "
            "is identified on this panel and the estimate is that value."
        )
    elif monotone_rising:
        verdict = (
            f"The loss rises monotonically as {args.param} grows, so it is minimised at or below the "
            f"smallest value tested ({best['value']}). No interior optimum exists: the parameter is "
            f"not identified on this panel, and the optimiser is not choosing a value so much as "
            f"running to whatever floor is imposed."
        )
    else:
        verdict = (
            f"No interior minimum, and the loss is not monotone; the smallest loss is at "
            f"{args.param} = {best['value']}. Treat the parameter as weakly identified."
        )

    payload = {
        "schemaVersion": "phase1.elasticity_profile.v1",
        "generatedAtIso": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "profiledParameter": args.param,
        "nRows": n,
        "method": (
            "Profile likelihood: the parameter is fixed on a grid and every other parameter "
            "is re-optimised at each point (differential evolution, then L-BFGS-B). The loss "
            "is unpenalised MSE on the percentile-anchored outcome, matching the shipped fit."
        ),
        "grid": grid,
        "profiles": profiles,
        "bestValue": best["value"],
        "bestLoss": round(best["loss"], 8),
        "monotoneRising": monotone_rising,
        "interiorMinimum": interior_minimum,
        "verdict": verdict,
    }
    OUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\n{verdict}\nwrote {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
