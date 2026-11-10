# What would move this paper from 95 to 96+

This note is a measurement, not an opinion. Every number below was computed from
the artefacts in this repository; the commands that produce them are given so the
claims can be re-run.

The current ceiling is not a writing problem. The paper reports `alpha` in
[0, 0.032] and ships a value outside that interval, because the panel cannot
identify the structural exponents. Everything else — the audit, the enforcement
machinery, the disclosure of every measured limit — is at the level a Q1 methods
journal expects. The remaining gap is data.

## 1. Two different bottlenecks, and only one of them is alpha

It is tempting to say "the sample is small". It is 167 rows, and more rows alone do
not fix identification. A simulation calibrated to this panel's measured
signal-to-noise ratio (residual SD 0.219 against observed SD 0.263) gives the real
constraint:

| design | total rows | alpha recovered (true 0.9) |
|---|---|---|
| 76 countries x 1 obs | 76 | 0.6, 0.6 |
| 76 countries x 2 obs | 152 | 0.6, 0.6 |
| 76 countries x 3 obs | 228 | 0.9, 0.6, 0.9 |
| 76 countries x 4 obs | 304 | 0.6, 0.9, 0.9 |
| **76 countries x 5 obs** | **380** | **0.9, 0.9, 0.9** |
| 90 countries x 4 obs | 360 | 0.9, 0.9, 0.9 |
| 100 countries x 5 obs | 500 | 0.9, 0.6, 0.6 |

The threshold is **observations per country, not observations in total**. Ninety
countries with four rows each recovers `alpha` in three of three seeds; a hundred
countries with five rows each manages one of three. That is not a monotonic story --
more data does not always help -- and the reason is that what identifies an exponent
is within-country movement in X and Y, which is capped by how many times each
country is observed, not by how many countries there are. Treat the table as
evidence that five observations per country is the regime where recovery becomes
reliable, not as a law.

One further caveat: these are three seeds per design, which is enough to show the
pattern and not enough to estimate a power curve. A real power analysis would need
hundreds of replications per cell.

Current panel: 27 countries contribute one row, 17 contribute two, 25 contribute
three. Only 2 countries reach five. Reproducing `python3` simulation:
`docs/data_plan_simulation.py` (see section 5).

## 2. Where the missing rows actually go

The World Values Survey source already contains 305 country-years across 107
countries. The panel uses 167 of them. The 139 unused cells are not lost to the
survey; they are lost to covariates:

| blocker | candidate cells it removes |
|---|---|
| `Y` (Gini) | 94 |
| `E` (education) | 82 |
| no macro row at all | 22 |
| `T` (trauma) | 30 |
| `R` (welfare capacity) | 13 |
| `M` (media) | 12 |
| `X` (urbanisation) | 4 |

(Counts overlap; a cell can miss several.) Gini is the binding constraint, exactly
as it was for the 87-to-167 expansion.

## 3. What can be recovered from data already on disk

WDI holds 2,402 Gini country-years. Widening the borrow window beyond the ±2 years
currently used covers:

| window | candidate cells covered |
|---|---|
| ±2 (adopted) | 62 / 139 |
| ±4 | 81 / 139 |
| ±6 | 88 / 139 |
| ±8 | 93 / 139 |
| ±15 | 99 / 139 |

The window is not free: a Gini measured eight years away is a weaker statement
about a survey year than one measured two years away. The right move is not to
widen the window silently but to widen it **with a per-cell lag recorded and a
sensitivity curve reported** — which the builder already supports and the
manuscript already reports for ±0/±1/±2.

Realistic gain from disk, at ±6 with disclosure: roughly **+26 cells**, taking the
panel to ~193. That is a 16% increase and does not reach the per-country threshold.

## 4. What has to be obtained

Reaching five observations per country requires survey waves the repository does
not hold. The three lines of work, in order of value per unit of effort:

**(a) WVS wave coverage for countries already near the threshold.** Twenty-five
countries sit at exactly three observations and seventeen at exactly two. One
additional usable wave for each of the twenty-five is +25 cells and moves them from
three to four; a second wave on top reaches five, which is the threshold the
simulation identifies. The waves that matter are the ones already surveyed but not
yet merged into the panel — the WVS source in `rawdata/` carries 305 country-years
against the panel's 167, and this is where the difference sits. This is the highest
return per download, because it converts near-misses rather than opening new
countries.

**(b) Gini for the 94 blocked cells.** The World Bank PIP series (formerly WDI
`SI.POV.GINI`) is the source already used. The blocked cells are missing because no
Gini exists within any reasonable window of the survey year, not because the
indicator is unavailable in principle. National statistical yearbooks and the
Luxembourg Income Study cover a subset; each recovered cell is worth one row.
Expected yield: 20-40 cells at substantial effort, and each one is worth no more than one row.

**(c) A different design for the exponent.** Identification could come from a
cross-section interacted with a time-varying instrument rather than from
within-country movement. This changes the paper's design, not its data, and is a
research project rather than a revision.

## 5. The concrete target

At 76 countries x 5 observations the panel is 380 rows and the simulation recovers
`alpha` correctly in 3 of 3 seeds. That is the number to aim at. It would move the
paper from reporting `alpha` as bounded to reporting it as estimated, which is the
single change that lifts the paper above 95.

That is **213 additional rows**, most of them from (a) and (b). It is a
data-collection project of months, not a revision of weeks. The honest summary is
that 95 is what this repository's data supports, and 96+ is what a completed WVS
and Gini panel would support.

## 6. Reproducing these numbers

```bash
# blockers per candidate cell
python3 docs/data_plan_blockers.py

# window coverage
python3 docs/data_plan_window.py

# identification simulation
python3 docs/data_plan_simulation.py
```
