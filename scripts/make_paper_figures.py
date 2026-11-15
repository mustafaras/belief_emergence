"""
make_paper_figures.py — redraw the data-dependent paper figures from committed artifacts.

WHY THIS EXISTS
---------------
Several figures were static exports from retired models or panels and contradicted
the paper they illustrate: the phase-policy figure sliced by the withdrawn social-
support channel, the marginal-effect figure drew all eight channels, the coefficient
forests showed a cultural-intensity coefficient of +5.08, and the correlation matrix
showed Z and C perfectly correlated (the very identity defect the paper reports).

Every figure below reads only committed artifacts or the canonical panel:
    marginal_effects.json        (generate:marginal-effects)
    coefficient_bootstrap.json   (scripts/bootstrap_coefficients.py)
    public/data/panel_canonical_v2.csv

Usage:
    python3 scripts/make_paper_figures.py
"""

from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ANALYSIS = ROOT / "src" / "data" / "analysis"
PANEL = ROOT / "public" / "data" / "panel_canonical_v2.csv"
MAIN = ROOT / "paper" / "main"
SUPP = ROOT / "paper" / "supplementary"
PT = 1 / 72

plt.rcParams.update({
    "font.family": "STIXGeneral", "mathtext.fontset": "stix", "pdf.fonttype": 42,
    "font.size": 7, "axes.labelsize": 7, "axes.titlesize": 7.5, "legend.fontsize": 6.5,
    "xtick.labelsize": 6.5, "ytick.labelsize": 6.5, "axes.linewidth": 0.5,
    "xtick.major.width": 0.5, "ytick.major.width": 0.5, "axes.spines.top": False, "axes.spines.right": False,
})
BLUE, GREEN, ORANGE, PINK, GREY = "#1f77b4", "#2ca02c", "#e08a00", "#c2477d", "#8a8f98"
STYLES = [("low", "-", BLUE), ("mid", "--", GREEN), ("high", ":", ORANGE)]


def load(name: str) -> dict:
    return json.loads((ANALYSIS / name).read_text(encoding="utf-8"))


def save(fig: plt.Figure, *paths: Path) -> None:
    for p in paths:
        fig.savefig(p, format="pdf")
        print(f"wrote {p.relative_to(ROOT)}")
    plt.close(fig)


def phase_policy(me: dict) -> None:
    pp = me["phasePolicy"]
    s = pp["s"]
    w, h = 449.232 * PT, 202.79 * PT
    fig = plt.figure(figsize=(w, h))
    phi = np.linspace(-4, 9, 400)
    z = 1 / (1 + np.exp(-(phi + s)))
    top = fig.add_axes([0.105, 0.60, 0.35, 0.36])
    bot = fig.add_axes([0.105, 0.17, 0.35, 0.30])
    top.plot(phi, z, color="black", lw=0.9)
    bot.plot(phi, z * (1 - z), color=PINK, lw=0.9)
    for ax in (top, bot):
        ax.axvline(-s, color=GREY, lw=0.5, ls=":")
    top.set_ylim(0, 1); top.set_ylabel(r"$Z$"); top.set_xticklabels([])
    bot.set_ylim(0, 0.3); bot.set_ylabel(r"$\partial Z/\partial\Phi$"); bot.set_xlabel(r"$\Phi$")
    top.text(0.02, 0.9, "(A)", transform=top.transAxes, fontweight="bold")
    ax = fig.add_axes([0.63, 0.30, 0.34, 0.66])
    for (rlevel, style, color), sl in zip([(-0.5, "-", BLUE), (0.5, "--", GREEN), (1.5, ":", ORANGE)], pp["slices"]):
        assert sl["rStd"] == rlevel
        ax.plot([p["eStd"] for p in sl["points"]], [p["z"] for p in sl["points"]], ls=style, color=color, lw=1.0,
                label=rf"$R_{{\mathrm{{std}}}}={rlevel:g}$")
    ax.set_xlabel(r"$E_{\mathrm{std}}$"); ax.set_ylabel(r"$Z$"); ax.set_ylim(0.4, 0.9)
    ax.text(0.02, 0.9, "(B)", transform=ax.transAxes, fontweight="bold")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.22), ncol=3, frameon=False, handlelength=1.6, columnspacing=0.8)
    save(fig, MAIN / "figure_1_phase_policy.pdf", SUPP / "figure_1_phase_policy.pdf")


def marginal_curves(me: dict) -> None:
    lo, hi = me["supportRange"]["zPredP05"], me["supportRange"]["zPredP95"]
    labels = {"M": "media environment", "T": "trauma/shock", "E": "education capacity", "R": "welfare capacity"}
    for fname, (xlo, xhi) in [("figure_12_marginal_effect_curves.pdf", (lo, hi)), ("figure_12_marginal_effect_curves_robust.pdf", (0.2, 0.8))]:
        fig, axes = plt.subplots(2, 2, figsize=(499.7 * PT, 257.1 * PT), sharey=True)
        for ax, ch in zip(axes.ravel(), labels):
            for (label, style, color), curve in zip(STYLES, me["curves"]):
                assert curve["label"] == label
                pts = [p for p in curve["points"] if xlo <= p["baselineZ"] <= xhi]
                ax.plot([p["baselineZ"] for p in pts], [p["deltaZ"][ch] for p in pts], ls=style, color=color, lw=1.0, label=f"{label} baseline")
            ax.axhline(0, color=GREY, lw=0.4)
            ax.set_xlim(xlo, xhi)
            ax.set_title(rf"$\mathrm{{{ch}}}_{{\mathrm{{std}}}}$ ({labels[ch]})")
        for ax in axes[1]: ax.set_xlabel(r"Baseline $Z$")
        for ax in axes[:, 0]: ax.set_ylabel(r"$\Delta Z$ (+1 SD)")
        axes[0, 0].set_ylim(-0.08, 0.17)
        fig.legend(*axes[0, 0].get_legend_handles_labels(), loc="lower center", ncol=3, frameon=False)
        fig.tight_layout(rect=(0, 0.06, 1, 1))
        save(fig, SUPP / fname)


def forests(bs: dict) -> None:
    pars = bs["parameters"]
    size = (279.36 * PT, 179.68 * PT)

    def forest(rows: list[tuple[str, str | None]], name: str, xlabel: str, log: bool = False) -> None:
        fig, ax = plt.subplots(figsize=size)
        ypos = list(range(len(rows)))[::-1]
        for y, (label, key) in zip(ypos, rows):
            if key is None:
                ax.text(0.0 if not log else 0.06, y, "withdrawn / not estimated", color=GREY, fontsize=5.5, va="center", ha="left" if log else "center", style="italic")
                continue
            p = pars[key]
            solid = p["excludesZero"] and not log
            color = "black" if solid else GREY
            ax.plot([p["lo"], p["hi"]], [y, y], color=color, lw=1.0)
            ax.plot([p["estimate"]], [y], "o", ms=3.5, color=color, mfc=color if solid else "white", mew=0.8)
        ax.set_yticks(ypos); ax.set_yticklabels([r[0] for r in rows]); ax.set_ylim(-0.7, len(rows) - 0.3)
        if log:
            ax.set_xscale("log")
        else:
            ax.axvline(0, color=GREY, lw=0.5, ls=":")
        ax.set_xlabel(xlabel)
        fig.tight_layout()
        save(fig, SUPP / name)

    forest([(r"$M$", "c_M"), (r"$T$", "c_T"), (r"$E$", "c_E"), (r"$R$", "c_R"), (r"$C$", None), (r"$D$", None), (r"$G$", None), (r"$S$", None)],
           "figure_3a_coefficients_forest_main.pdf", "Coefficient (95% bootstrap interval)")
    forest([(r"$T\!\cdot\!R$", "c_tr"), (r"$Y\!\cdot\!R$", "c_yr"), (r"$X\!\cdot\!Y$", None), (r"$C\!\cdot\!M$", None), (r"$E\!\cdot\!S$", None), (r"$D\!\cdot\!T$", None), (r"$G\!\cdot\!R$", None)],
           "figure_3b_coefficients_forest_interactions.pdf", "Coefficient (95% bootstrap interval)")
    forest([(r"$\phi_0-\ln k$", "phi0_minus_lnk"), (r"$\alpha$ (on bound)", "alpha"), (r"$\beta$ (on bound)", "beta")],
           "figure_3c_coefficients_forest_quadratics.pdf", "Value (95% bootstrap interval)")


def read_panel() -> tuple[list[str], np.ndarray, list[str]]:
    cols = ["X", "Y", "Z", "M", "T", "E", "R"]
    iso, data = [], []
    with PANEL.open(newline="", encoding="utf-8") as fh:
        for r in csv.DictReader(fh):
            iso.append(r["iso3"]); data.append([float(r[c]) for c in cols])
    return cols, np.array(data), iso


def heatmaps() -> None:
    cols, data, iso = read_panel()
    iso_arr = np.array(iso)
    within = data.copy()
    keep = np.zeros(len(iso), dtype=bool)
    for c in set(iso):
        idx = iso_arr == c
        if idx.sum() >= 2:
            within[idx] = data[idx] - data[idx].mean(axis=0); keep |= idx
    for corr, fname, size, n in [(np.corrcoef(data.T), "figure_A2_correlation_heatmap.pdf", (518.4, 446.4), len(iso)),
                                 (np.corrcoef(within[keep].T), "figure_A3_correlation_heatmap_within.pdf", (585.6, 509.8), int(keep.sum()))]:
        fig, ax = plt.subplots(figsize=(size[0] * PT, size[1] * PT))
        im = ax.imshow(corr, cmap="RdBu_r", vmin=-1, vmax=1)
        ax.set_xticks(range(len(cols))); ax.set_xticklabels(cols); ax.set_yticks(range(len(cols))); ax.set_yticklabels(cols)
        for i in range(len(cols)):
            for j in range(len(cols)):
                ax.text(j, i, f"{corr[i, j]:.2f}", ha="center", va="center", fontsize=7, color="white" if abs(corr[i, j]) > 0.6 else "black")
        for sp in ax.spines.values(): sp.set_visible(False)
        cb = fig.colorbar(im, ax=ax, fraction=0.046, pad=0.04); cb.set_label("Pearson r")
        ax.set_title(f"Pearson correlation matrix (n = {n})")
        fig.tight_layout()
        save(fig, SUPP / fname)


def saturation_curve() -> None:
    fig, ax = plt.subplots(figsize=(230.5 * PT, 173.5 * PT))
    s = np.linspace(0, 6, 300)
    for k, style, color, label in [(1.0, "-", BLUE, r"$k=1$ (reference)"), (0.8, "--", GREEN, r"$k=0.8$"), (1.2, ":", ORANGE, r"$k=1.2$")]:
        ax.plot(s, s / (s + k), ls=style, color=color, lw=1.0, label=label)
    ax.plot([1], [0.5], "ko", ms=3); ax.axvline(1, color=GREY, lw=0.4, ls=":"); ax.axhline(0.5, color=GREY, lw=0.4, ls=":")
    ax.annotate(r"half-saturation ($S=k$)", (1, 0.5), xytext=(1.6, 0.3), fontsize=6, arrowprops=dict(arrowstyle="-", lw=0.4))
    ax.set_xlabel(r"Effective stimulus $S$"); ax.set_ylabel(r"Bounded outcome $Z$"); ax.set_ylim(0, 1)
    ax.text(0.5, 1.03, r"$Z=\dfrac{S}{S+k}$", transform=ax.transAxes, ha="center", fontsize=8)
    ax.legend(loc="lower right", frameon=False)
    fig.tight_layout()
    save(fig, SUPP / "figure_1_saturation_curve.pdf")


def schematics() -> None:
    """Conceptual figures drawn from the model's own algebra: Z = sigma(u), u = Phi + s, and
    the mean-field free energy F(Z) = Z ln Z + (1-Z) ln(1-Z) - u Z, whose unique minimum is sigma(u)."""
    size = (446.4 * PT, 259.2 * PT)
    u = np.linspace(-6, 6, 400)
    fig, ax = plt.subplots(figsize=size)
    ax.plot(u, 1 / (1 + np.exp(-u)), color=BLUE, lw=1.6)
    ax.axvline(0, color=ORANGE, lw=0.9, ls="--")
    ax.text(0.15, 0.08, r"ridge: $\Phi+s=0$, $Z=0.5$", color=ORANGE, fontsize=7)
    ax.text(-5.8, 0.06, "low $Z$", fontsize=7); ax.text(3.2, 0.93, "high $Z$", fontsize=7)
    ax.set_xlabel(r"Reduced coordinate $\Phi+s$"); ax.set_ylabel(r"Bounded outcome $Z$"); ax.set_ylim(0, 1)
    fig.tight_layout(); save(fig, SUPP / "fig_doc_section3_phase_transition.pdf")
    fig, ax = plt.subplots(figsize=size)
    z = np.linspace(0.001, 0.999, 500)
    for level, style, color in [(-2.0, "-", BLUE), (0.0, "--", GREEN), (2.0, ":", ORANGE)]:
        f = z * np.log(z) + (1 - z) * np.log(1 - z) - level * z
        z_star = 1 / (1 + math.exp(-level))
        f_star = z_star * math.log(z_star) + (1 - z_star) * math.log(1 - z_star) - level * z_star
        ax.plot(z, f - f_star, ls=style, color=color, lw=1.4, label=rf"$\Phi+s={level:g}$")
        ax.plot([z_star], [0], "o", ms=3.5, color=color)
    ax.set_xlabel(r"Outcome $Z$"); ax.set_ylabel(r"$F(Z)-\min F$ (mean-field free energy)"); ax.set_ylim(-0.05, 1.2)
    ax.legend(frameon=False, loc="upper center", ncol=3)
    fig.tight_layout(); save(fig, SUPP / "fig_doc_section3_energy_field.pdf")


def main() -> None:
    me, bs = load("marginal_effects.json"), load("coefficient_bootstrap.json")
    phase_policy(me); marginal_curves(me); forests(bs); heatmaps(); saturation_curve(); schematics()


if __name__ == "__main__":
    main()
