"""
make_fig_eval_pair.py — regenerate the observed-vs-predicted figure from data.

WHY THIS EXISTS
---------------
`paper/main/fig_eval_pair.pdf` was a static export drawn from the retired
630-row scenario panel: its own axes said "n=630, Corr=0.949, MAE=0.100" while
the caption above it described the 87-row rebuilt panel. A reviewer who reads
the figure and the caption together finds a contradiction on the same page.

This script redraws the figure from the committed artifact
`src/data/analysis/observed_vs_predicted_authoritative.csv`, so the numbers
printed inside the figure are the numbers the pipeline produced. It is
deliberately standalone (matplotlib only) and reads nothing but that CSV.

Usage:
    python3 scripts/make_fig_eval_pair.py
    python3 scripts/make_fig_eval_pair.py --check   # verify, do not write
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "src" / "data" / "analysis" / "observed_vs_predicted_authoritative.csv"
OUT_PATH = ROOT / "paper" / "main" / "fig_eval_pair.pdf"


def load() -> tuple[list[float], list[float]]:
    if not CSV_PATH.exists():
        sys.exit(f"missing artifact: {CSV_PATH}\nrun `npm run generate:analysis` first")
    observed: list[float] = []
    predicted: list[float] = []
    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            observed.append(float(row["observed_Z"]))
            predicted.append(float(row["predicted_Z"]))
    if not observed:
        sys.exit("artifact is empty")
    return observed, predicted


def pearson(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    return cov / (vx * vy) ** 0.5 if vx > 0 and vy > 0 else float("nan")


def r2(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    my = sum(ys) / n
    ss_res = sum((y - x) ** 2 for x, y in zip(xs, ys))
    ss_tot = sum((y - my) ** 2 for y in ys)
    return 1 - ss_res / ss_tot if ss_tot > 0 else float("nan")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="report values without writing")
    args = parser.parse_args()

    observed, predicted = load()
    corr = pearson(predicted, observed)
    r2_full = r2(predicted, observed)
    mae = sum(abs(o - p) for o, p in zip(observed, predicted)) / len(observed)
    if args.check:
        print(f"n={len(observed)} corr={corr:.4f} R2={r2_full:.4f} MAE={mae:.4f}")
        return

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    with PdfPages(OUT_PATH) as pdf:
        fig, axes = plt.subplots(1, 2, figsize=(10.0, 4.4))

        ax = axes[0]
        ax.scatter(predicted, observed, s=26, alpha=0.75, edgecolors="none", color="#2b5d8a")
        ax.plot([0, 1], [0, 1], linestyle="--", linewidth=1.0, color="#888888")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.set_xlabel("Predicted $Z$ (bounded)")
        ax.set_ylabel("Observed $Z$ (bounded)")
        ax.set_title(
            f"n={len(observed)}   Corr={corr:.3f}   $R^2$={r2_full:.3f}   MAE={mae:.3f}",
            fontsize=10,
        )
        ax.set_aspect("equal")
        ax.grid(alpha=0.25, linewidth=0.6)

        # Decile calibration with observed IQR bars.
        ax = axes[1]
        order = sorted(range(len(predicted)), key=lambda i: predicted[i])
        bins = [order[i::10] for i in range(10)]
        bars_x, bars_y, lo, hi = [], [], [], []
        for chunk in bins:
            if not chunk:
                continue
            ys = sorted(observed[i] for i in chunk)
            bars_x.append(sum(predicted[i] for i in chunk) / len(chunk))
            bars_y.append(sum(ys) / len(ys))
            lo.append(ys[int(0.25 * (len(ys) - 1))])
            hi.append(ys[int(0.75 * (len(ys) - 1))])
        lower = [y - l for y, l in zip(bars_y, lo)]
        upper = [h - y for y, h in zip(bars_y, hi)]
        ax.errorbar(bars_x, bars_y, yerr=[lower, upper], fmt="o", markersize=5,
                    color="#2b5d8a", ecolor="#9aa7b4", elinewidth=1.2, capsize=3)
        ax.plot([0, 1], [0, 1], linestyle="--", linewidth=1.0, color="#888888")
        ax.set_xlim(0, 1)
        ax.set_ylim(0, 1)
        ax.set_xlabel("Mean predicted $Z$ (deciles)")
        ax.set_ylabel("Mean observed $Z$")
        ax.set_title("Decile calibration; bars: observed IQR", fontsize=10)
        ax.set_aspect("equal")
        ax.grid(alpha=0.25, linewidth=0.6)

        fig.tight_layout()
        pdf.savefig(fig)
        plt.close(fig)

    print(f"wrote {OUT_PATH.relative_to(ROOT)}  (n={len(observed)}, corr={corr:.4f}, R2={r2_full:.4f}, MAE={mae:.4f})")


if __name__ == "__main__":
    main()
