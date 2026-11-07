# Replication Runbook — Bounded-Belief Analytics

> **Purpose**: End-to-end deterministic regeneration of every quantitative artifact
> referenced in the manuscript. One command (`npm run replicate`) reproduces all
> numbers, tables, and validation checks from the canonical panel data.

---

## 1 Prerequisites

| Requirement          | Version  | Check command             |
|----------------------|----------|---------------------------|
| Node.js              | ≥ 18     | `node -v`                 |
| npm                  | ≥ 9      | `npm -v`                  |
| tsx                  | ≥ 4.19   | `npx tsx --version`       |
| MiKTeX _or_ TeX Live | 2024+    | `pdflatex --version`      |
| Biber                | ≥ 2.19   | `biber --version`         |

> MiKTeX / Biber are only required for the optional paper-build step (§ 6).

Install JS dependencies once:

```bash
cd BE_app
npm ci            # clean install from lockfile
```

---

## 2 Canonical Data Fingerprint

All scripts load `public/data/panel_model_data.csv` via a SHA-256 integrity
gate. If the hash does not match, every script aborts before writing output.

| Property | Value |
|----------|-------|
| File     | `public/data/panel_model_data.csv` |
| SHA-256  | `2E5B4B0A56601A6EB4C4AAC38D9762DC2A390EF2F9135CE14E8FDB3FA6473AFF` |
| Rows     | 630 country-year observations |

To verify manually:

```bash
# PowerShell
(Get-FileHash -Algorithm SHA256 public/data/panel_model_data.csv).Hash

# Bash / macOS
shasum -a 256 public/data/panel_model_data.csv
```

---

## 3 Deterministic Generation Pipeline

Run the three phases **in order**. Each phase depends on outputs from the
previous one. The helper script (`npm run replicate`) automates the full
sequence with fail-fast semantics.

### Phase 1 — Artifact Generation (deterministic, write)

| Step | Command | Writes |
|------|---------|--------|
| 1a | `npm run generate:analysis` | `src/data/analysis/metrics_authoritative.json` `src/data/analysis/observed_vs_predicted_authoritative.csv` |
| 1b | `npm run generate:headline-metrics` | `src/data/metrics/headline_metrics_authoritative.json` |
| 1c | `npm run generate:phase1-validation` | 8 artifacts in `src/data/analysis/`: `model_ladder_metrics.json`, `cv_country_out.json`, `cv_rolling_origin.json`, `prediction_interval_coverage.json`, `parameter_stability.json`, `model_complexity_support.json`, `failure_log.json`, `construct_validity_invariance.json` |

### Phase 2 — Validation Checks (read-only, fail-fast)

| Step | Command | Validates |
|------|---------|-----------|
| 2a | `npm run check:section-references` | Section-numbering consistency across `.tex` files |
| 2b | `npm run check:no-hardcoded-headline` | No forbidden hardcoded metric literals in `.tsx` UI code |
| 2c | `npm run check:manuscript-consistency` | 11+ numeric claim blocks in manuscript match canonical artifacts |

### Phase 3 — Lockbox Holdout (optional, release-gated)

| Step | Command | Writes |
|------|---------|--------|
| 3 | `npm run generate:lockbox-holdout -- --cycle N` | `src/data/analysis/lockbox_holdout.json` |

> Phase 3 is **not** part of the default pipeline. It is gated by a `--cycle`
> flag and should only be run once per release cycle. The current artifact
> already contains the validated holdout.

---

## 4 One-Command Replication

```bash
npm run replicate
```

This runs `scripts/replicate.ts` which executes:

1. **Phase 1** — `generate:analysis` → `generate:headline-metrics` → `generate:phase1-validation`
2. **Phase 2** — `check:manuscript-consistency` → `check:section-references` → `check:no-hardcoded-headline`
3. **Code quality** — `lint` → `test:run` → `build`

Every step is logged with a pass/fail status. The pipeline halts on the first
failure. Exit code 0 means full replication succeeded.

---

## 5 Deterministic CI Gate

```bash
npm run ci:gate
```

This runs `scripts/ci_gate.ts` which performs a **7-phase** reproducibility
verification:

| Phase | Check | Action |
|-------|-------|--------|
| 0 | Canonical data fingerprint | SHA-256 of panel CSV vs expected constant |
| 1 | Artifact generation | Runs all 3 generation scripts |
| 2 | Artifact presence | Verifies all 12 required artifacts exist |
| 3 | Schema versions | Checks `schemaVersion` field in every JSON artifact |
| 4 | Canonical metric values | Tolerance-gated comparison of n, R², Corr, MAE, RMSE, Bias |
| 5 | Determinism cross-check | Regenerates artifacts a second time, compares SHA-256 fingerprints (timestamps stripped) |
| 6 | Validation checks | Manuscript consistency, section references, no-hardcoded metrics |
| 7 | Code quality | Lint, tests, build |

The gate emits a concise **PASS / FAIL** verdict with a per-check summary.
Exit code 0 means the release candidate is reproducible; exit code 1 means
drift was detected.

---

## 6 Expected Canonical Metrics

After a successful run of Phase 1, the following values must appear in
`src/data/analysis/metrics_authoritative.json`:

| Metric          | Expected value |
|-----------------|----------------|
| n               | 630            |
| R²              | 0.8461         |
| Correlation     | 0.9488         |
| MAE             | 0.1005         |
| RMSE            | 0.1212         |
| Bias            | −0.0699        |

Any deviation indicates a data-integrity or code-path change and must be
investigated before proceeding.

---

## 7 Paper Build (optional)

After all artifacts are regenerated and validated, the manuscript can be
recompiled:

```bash
cd ../BE_paper_latest/main
pdflatex -interaction=nonstopmode main.tex
biber main
pdflatex -interaction=nonstopmode main.tex
pdflatex -interaction=nonstopmode main.tex

cd ../supplementary
pdflatex -interaction=nonstopmode supplementary_materials.tex
biber supplementary_materials
pdflatex -interaction=nonstopmode supplementary_materials.tex
pdflatex -interaction=nonstopmode supplementary_materials.tex
```

Expected output: `main.pdf` (≈ 24 pages), `supplementary_materials.pdf`
(≈ 30 pages).

---

## 8 Artifact → Manuscript Claim Map

| Script | Artifact | Manuscript claim |
|--------|----------|-----------------|
| `generate:analysis` | `metrics_authoritative.json` | Table 1 core metrics (R², MAE, RMSE, n) |
| `generate:analysis` | `observed_vs_predicted_authoritative.csv` | Figure 2 scatter plot |
| `generate:headline-metrics` | `headline_metrics_authoritative.json` | Abstract & Section 4 headline numbers |
| `generate:phase1-validation` | `model_ladder_metrics.json` | Table 2 model-ladder comparison |
| `generate:phase1-validation` | `cv_country_out.json` | Section 4.2 leave-one-country-out CV |
| `generate:phase1-validation` | `cv_rolling_origin.json` | Section 4.2 rolling-origin CV |
| `generate:phase1-validation` | `prediction_interval_coverage.json` | Section 4.3 prediction intervals |
| `generate:phase1-validation` | `parameter_stability.json` | Supplementary Table S3 stability |
| `generate:phase1-validation` | `model_complexity_support.json` | Supplementary complexity analysis |
| `generate:phase1-validation` | `failure_log.json` | Section 5 failure documentation |
| `generate:phase1-validation` | `construct_validity_invariance.json` | Supplementary construct validity |
| `generate:lockbox-holdout` | `lockbox_holdout.json` | Section 4.4 holdout evaluation |

---

## 9 Data Provenance & License Compliance

A machine-readable provenance inventory is maintained at:

```
src/data/analysis/data_code_provenance.json
```

This file documents license terms, redistribution status, attribution requirements, and compliance risk flags for every upstream data source.

### Redistribution Summary

| Category | Sources | Status |
|----------|---------|--------|
| **Freely redistributable** | World Bank WDI (CC BY 4.0), UNDP HDR (CC BY 3.0 IGO), UCDP (CC BY 4.0) | No restrictions |
| **Conditional redistribution** | OECD IDD/SOCX/Wealth (research use with attribution), EM-DAT (CRED academic license) | Include with attribution; bulk redistribution may need permission |
| **Redistribution restricted** | WVS Time Series, WVS Wave 7, WVS Waves 1–6, EVS/WVS Joint | Replicators must download from worldvaluessurvey.org |

### Action Items (Pre-Release)

1. **WVS/EVS microdata** (RESOLVED): Raw WVS/EVS CSV files excluded from public repository via `rawdata/.gitignore`. Download instructions provided in § 9.1 below. LICENSE § 3 documents restrictions.
2. **Repository LICENSE** (RESOLVED): `LICENSE` file added — MIT for code, CC BY 4.0 for documentation. Third-party data restrictions documented in LICENSE § 3.
3. **EM-DAT raw XLSX** (MEDIUM): Confirm CRED permission for redistribution of custom-request files.
4. **OECD bulk extracts** (MEDIUM): Confirm file sizes fall within OECD's permissible extract limits.
5. **Derived panel review** (LOW): Confirm WVS terms permit redistribution of country-level aggregates.

### 9.1 Third-Party Data Download Instructions

The following files are **excluded from the public repository** due to redistribution restrictions. Replicators must download them manually and place them in the `rawdata/` directory before running the replication pipeline.

#### World Values Survey (WVS)

**Access is free and requires no registration.** The WVSA states this
explicitly on the download pages: *"Access to the data, similar to the
previous rounds, is free, with no registration or payments required."*
Conditions of use are: non-profit use, no redistribution of the data files, and
citation of the source in any publication.

Single entry point:
<https://www.worldvaluessurvey.org/WVSDocumentationWVL.jsp>

From there, "Data Download" in the left navigation opens every release. The
files this project needs, and where each one lives:

| File used by the pipeline | Section on the download page |
|---|---|
| `EVS_WVS_Joint_Csv_v5_0.csv` | WVS/EVS Trend 1981–2022 → Joint EVS/WVS CSV (v5.0) |
| `WVS_Cross-National_Wave_7_csv_v6_0.csv` | Wave 7 (2017–2022) → CSV |
| `WVS_Time_Series_1981-2022_csv_v5_0.csv` | Timeseries (1981–2022) → CSV |
| Waves 1–6 CSV files | Wave 1 … Wave 6 → CSV |

Download the CSV variant for each; the site also offers SPSS, Stata, SAS and R
bundles, which the pipeline does not read.

Place the files in `rawdata/`. They are excluded from version control
(`.gitignore`) because the licence forbids redistribution, not because access
is restricted.

> **Correction (2026-11-07).** Earlier versions of this section instructed
> replicators to "register for a free WVS academic account" and to "accept the
> WVS Academic Data Use Agreement". No such registration step exists on the
> current WVS site, and the data are downloadable without an account. The
> instruction has been removed. If a download page asks for an email address in
> future, record what it asked for here rather than reintroducing a step that
> was never verified.

#### EM-DAT — International Disaster Database

1. Navigate to <https://www.emdat.be/>
2. Register for a free academic account
3. Submit a data request for the required disaster variables
4. Download the CSV extract → `emdat_disasters.csv`
5. Place in `rawdata/`

> **Note:** The derived file `wvs_combined.csv` is generated by the replication pipeline from the individual WVS wave files. It will be created automatically when you run the pipeline — you do not need to download it separately.

After placing all required files in `rawdata/`, run the replication pipeline:

```bash
npm run replicate
```

---

## 10 Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| "SHA-256 mismatch" on any script | `panel_model_data.csv` was modified or corrupted | Restore from version control |
| `generate:phase1-validation` timeout | Large cross-validation matrix | Increase Node.js heap: `NODE_OPTIONS=--max-old-space-size=8192` |
| `check:manuscript-consistency` failure | Manuscript text edited without regenerating artifacts | Re-run Phase 1 first, then Phase 2 |
| Metric drift (e.g. R² ≠ 0.8461) | Code-path change in production mapping | Diff against last known-good commit |
| `npm run replicate` exits at lint | New linting rule or unresolved warning | Run `npm run lint` standalone to inspect |

---

## 11 File Manifest

```
BE_app/
├── scripts/
│   ├── replicate.ts                          # Single-command entrypoint (§ 4)
│   ├── ci_gate.ts                            # Deterministic CI gate (§ 5)
│   ├── generate_authoritative_analysis.ts    # Phase 1a
│   ├── generate_headline_metrics.ts          # Phase 1b
│   ├── generate_phase1_validation.ts         # Phase 1c
│   ├── generate_lockbox_holdout.ts           # Phase 3
│   ├── check_manuscript_consistency.ts       # Phase 2c
│   ├── check_section_references.ts           # Phase 2a
│   └── check_no_hardcoded_headline_metrics.ts # Phase 2b
├── src/data/
│   ├── analysis/
│   │   ├── metrics_authoritative.json
│   │   ├── observed_vs_predicted_authoritative.csv
│   │   ├── cv_country_out.json
│   │   ├── cv_rolling_origin.json
│   │   ├── model_ladder_metrics.json
│   │   ├── model_complexity_support.json
│   │   ├── parameter_stability.json
│   │   ├── prediction_interval_coverage.json
│   │   ├── failure_log.json
│   │   ├── construct_validity_invariance.json
│   │   ├── lockbox_holdout.json
│   │   └── data_code_provenance.json
│   └── metrics/
│       └── headline_metrics_authoritative.json
├── public/data/
│   └── panel_model_data.csv                  # Canonical input (SHA-256 gated)
├── REPLICATION_RUNBOOK.md                    # This file
└── package.json                              # All npm scripts
```
