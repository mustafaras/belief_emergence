"""
make_fig_resid_pair.py — regenerate the residual-diagnostics figure from data.

WHY THIS EXISTS
---------------
`paper/supplementary/fig_eval_resid_pair.pdf` was drawn from the retired
630-row scenario panel. Its printed statistics ("n=630, mean(e)=-0.0699,
sd(e)=0.0991, Corr=0.949, MAE=0.100") belonged to the tautological model, while
the surrounding text describes the 87-row rebuilt panel. This redraws it from
`src/data/analysis/observed_vs_predicted_authoritative.csv` so the numbers
inside the figure are the numbers the pipeline produced.

Usage:
    python3 scripts/make_fig_resid_pair.py
    python3 scripts/make_fig_resid_pair.py --check
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "src" / "data" / "analysis" / "observed_vs_predicted_authoritative.csv"
OUT_PATH = ROOT / "paper" / "supplementary" / "fig_eval_resid_pair.pdf"


def load() -> tuple[list[float], list[float], list[float]]:
    if not CSV_PATH.exists():
        sys.exit(f"missing artifact: {CSV_PATH}\nrun `npm run generate:analysis` first")
    observed: list[float] = []
    predicted: list[float] = []
    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            o = float(row["observed_Z"])
            p = float(row["predicted_Z"])
            observed.append(o)
            predicted.append(p)
    residual = [o - p for o, p in zip(observed, predicted)]
    if not observed:
        sys.exit("artifact is empty")
    return observed, predicted, residual


def stats(residual: list[float]) -> tuple[float, float, float]:
    n = len(residual)
    mean = sum(residual) / n
    sd = (sum((r - mean) ** 2 for r in residual) / (n - 1)) ** 0.5
    ordered = sorted(residual)
    median = ordered[n // 2] if n % 2 else 0.5 * (ordered[n // 2 - 1] + ordered[n // 2])
    return mean, sd, median


def pearson(xs: list[float], ys: list[float]) -> float:
    n = len(xs)
    mx = sum(xs) / n
    my = sum(ys) / n
    cov = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    vx = sum((x - mx) ** 2 for x in xs)
    vy = sum((y - my) ** 2 for y in ys)
    return cov / (vx * vy) ** 0.5 if vx > 0 and vy > 0 else float("nan")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="report values without writing")
    args = parser.parse_args()

    observed, predicted, residual = load()
    mean, sd, median = stats(residual)
    corr = pearson(observed, predicted)
    mae = sum(abs(r) for r in residual) / len(residual)

    if args.check:
        print(f"n={len(residual)} mean={mean:.4f} sd={sd:.4f} median={median:.4f} "
              f"corr={corr:.4f} mae={mae:.4f}")
        return

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    with PdfPages(OUT_PATH) as pdf:
        fig, axes = plt.subplots(1, 2, figsize=(10.0, 4.0))

        ax = axes[0]
        ax.hist(residual, bins=18, color="#2b5d8a", alpha=0.85, edgecolor="white", linewidth=0.6)
        ax.axvline(0, color="#888888", linestyle="--", linewidth=1.0)
        ax.set_xlabel("Residual ($Z-\\widehat{Z}$) on bounded scale")
        ax.set_ylabel("Count")
        ax.set_title(
            f"n={len(residual)}   mean(e)={mean:.4f}   sd(e)={sd:.4f}   median(e)={median:.4f}",
            fontsize=9.5,
        )
        ax.grid(alpha=0.25, linewidth=0.6, axis="y")

        ax = axes[1]
        ax.scatter(predicted, residual, s=26, alpha=0.75, edgecolors="none", color="#2b5d8a")
        ax.axhline(0, color="#888888", linestyle="--", linewidth=1.0)
        ax.set_xlim(0, 1)
        ax.set_xlabel("Predicted $Z$ (bounded)")
        ax.set_ylabel("Residual ($Z-\\widehat{Z}$)")
        ax.set_title(
            f"Corr($Z,\\widehat{{Z}}$)={corr:.3f}   MAE={mae:.3f}   Bias={mean:+.3f}",
            fontsize=9.5,
        )
        ax.grid(alpha=0.25, linewidth=0.6)

        fig.tight_layout()
        pdf.savefig(fig)
        plt.close(fig)

    print(f"wrote {OUT_PATH.relative_to(ROOT)}  (n={len(residual)}, mean={mean:.4f}, "
          f"sd={sd:.4f}, corr={corr:.4f}, mae={mae:.4f})")


if __name__ == "__main__":
    main()
