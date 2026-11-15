"""
update_notation_glossary.py — reconcile notation_glossary.json with the v2 artifacts.

The glossary was "manual_reconciliation_after_v2_panel" and still described the
retired design: C as an amplifier built from a 5-item composite, T from UCDP, ridge
shrinkage, 0.4-0.9 bounds, 146-row support densities and "secular/religious" regimes.
This script rewrites the fields that depend on data from the artifacts that own them.
Entry counts are unchanged (the schema test pins them).

Usage: python3 scripts/update_notation_glossary.py
"""
from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / "src" / "data" / "analysis"
PANEL_Z = [float(r["Z"]) for r in csv.DictReader((ROOT / "public" / "data" / "panel_canonical_v2.csv").open(encoding="utf-8"))]
J = lambda n: json.loads((A / n).read_text(encoding="utf-8"))
g, w, st, mc = J("notation_glossary.json"), J("structural_window_sensitivity.json"), J("supplementary_tables.json"), J("model_complexity_support.json")
fw, ec, rr, an = w["windows"]["fitting"], w["windows"]["evaluationContract"], w["windows"]["realisedRange"], w["anchoring"]
r4 = lambda x: round(float(x), 4)

upd = {
    "X": {"role": "structural_driver", "source": "World Bank WDI (urban_pop_share)", "bounds_raw": [r4(rr["xMin"]), r4(rr["xMax"])],
          "fitting_window": [fw["xMin"], fw["xMax"]], "evaluation_window": [ec["xMin"], ec["xMax"]]},
    "Y": {"role": "structural_driver", "source": "World Bank SI.POV.GINI under an exact affine map (OECD levels not used directly)", "bounds_raw": [r4(rr["yMin"]), r4(rr["yMax"])],
          "fitting_window": [fw["yMin"], fw["yMax"]], "evaluation_window": [ec["yMin"], ec["yMax"]]},
    "Z": {"bounds_raw": [r4(min(PANEL_Z)), r4(max(PANEL_Z))]},
    "C": {"role": "withdrawn", "source": "WVS 6-item aggregate (config/wvs_items.yaml); withdrawn: Cronbach alpha 0.348 below the 0.70 floor"},
    "M": {"role": "retained_modifier", "source": "World Bank internet usage (standardized)"},
    "T": {"role": "retained_modifier", "source": "EM-DAT total_deaths, standardized (UCDP battle deaths are not the same measure and are not used)",
          "note": "T equals total_deaths exactly. A composite with total_affected was tested on an earlier panel revision and not adopted; it is not reproduced on the current panel."},
    "D": {"role": "withdrawn", "source": "WVS 5 configured items, 4 usable (config/wvs_items.yaml); withdrawn: Cronbach alpha -1.228"},
    "G": {"role": "withdrawn", "source": "OECD redistribution scenarios; withdrawn: disposable-income Gini is unavailable outside the OECD sample"},
    "E": {"role": "retained_modifier", "source": "World Bank SE.SEC.ENRR (secondary gross enrolment) under an exact affine map"},
    "S": {"role": "withdrawn", "source": "WVS 7 configured items, 3 available (A101, A106, F185, F186 absent); not computable, 0 cells"},
    "R": {"role": "retained_modifier", "source": "UNDP HDI under an exact affine map: R = 7.303771 HDI - 6.005361"},
}
for v in g["model_variables"]:
    v.update(upd[v["symbol"]])
for gl in g["greek_letters"]:
    if gl["symbol"] in ("α", "β"):
        gl["domain"] = "[0.05, 5] (lower estimation bound 0.05)"
    if gl["symbol"] == "ρ":
        gl["name"] = "Redistribution percentage (channel G withdrawn)"
    if gl["symbol"] == "ℒ":
        gl["name"] = "Estimation loss"
        gl["definition"] = "mean squared error between modelled and normalised observed Z (unpenalised)"
hyper = [
    {"symbol": "k", "name": "Half-saturation constant", "bounds": [0.0001, 50], "role": "Saturation curve inflection; Z=0.5 when S=k"},
    {"symbol": "x/y fitting window", "name": "Structural windows used by the fitting script", "values": [fw["xMin"], fw["xMax"], fw["yMin"], fw["yMax"]], "role": "Clip domain for the safe-band map during fitting"},
    {"symbol": "x/y evaluation window", "name": "Structural windows in the model contract", "values": [ec["xMin"], ec["xMax"], ec["yMin"], ec["yMax"]], "role": "Clip domain for the safe-band map in evaluation and the interface (differs from fitting; KI-18)"},
    {"symbol": "z fitting anchors", "name": "Outcome anchors in the fitting script", "values": [r4(an["fitAnchors"]["lo"]), r4(an["fitAnchors"]["hi"])], "role": "1st/99th percentiles of the current panel"},
    {"symbol": "z evaluation anchors", "name": "Outcome anchors in the model contract", "values": [r4(an["evaluationAnchors"]["lo"]), r4(an["evaluationAnchors"]["hi"])], "role": "Z_NORMALIZATION used for evaluation (differs from fitting; KI-18)"},
    {"symbol": "Φ_clamp", "name": "Field clamping bounds", "values": [-50, 50], "role": "Prevents numerical overflow in e^Φ"},
]
assert len(hyper) == len(g["hyperparameters"])
g["hyperparameters"] = hyper
tiers = {t["tier"]: t for t in mc["complexityByTier"]}
for t in g["tier_definitions"]:
    t["obs_per_param"] = round(tiers[t["tier"]]["supportPerParameter"], 2)
rs = st["regimeSupport"]; n = rs["n"]
pct = lambda c: f"{c} of {n} ({100 * c / n:.1f}%)"
dens = {
    "Low-uptake": (f"{pct(rs['lowUptake'])}; thin support, extrapolation risk elevated.", "Below-transition zone; outcome near floor. Marginal sensitivity ∂Z/∂Φ = Z(1−Z) is low. Low values of the belief-intensity composite."),
    "Transition corridor": (f"{pct(rs['transitionCorridor'])}; best-supported regime.", "Mid-response band where sensitivity peaks."),
    "Ridge peak": (f"{pct(rs['ridgePeak'])}; high leverage.", None),
    "High-uptake": (f"{pct(rs['highUptake'])}; saturation effects dominant.", "Above-transition zone; outcome near ceiling. Saturation compresses marginal effects. High values of the belief-intensity composite."),
    "Saturated tails": (f"{rs['saturatedTails']} of {n} predictions fall below 0.05 or above 0.95; narratives here are prone to misinterpretation.", None),
}
for r in g["regime_definitions"]:
    d, c = dens[r["label"]]
    r["support_density"] = d
    if c:
        r["empirical_characterization"] = c
g["support_density_basis"] = rs["basis"]
g["generated"] = datetime.now(timezone.utc).isoformat()
g["generator"] = "scripts/update_notation_glossary.py (reads structural_window_sensitivity.json, supplementary_tables.json, model_complexity_support.json)"
(A / "notation_glossary.json").write_text(json.dumps(g, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("updated notation_glossary.json")
