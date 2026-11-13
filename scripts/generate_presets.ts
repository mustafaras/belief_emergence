/**
 * Generate the country preset table from the canonical panel.
 *
 * WHY THIS EXISTS
 * ---------------
 * `src/data/presets.ts` was hand-maintained and its provenance was never established. An
 * audit found that of 115 values checkable against the shipped panel, 113 did not
 * reproduce: the scales were mixed (Australia `X = 0.85` matched the raw panel mean while
 * `T = -1.57` was on the standardised scale) and several values matched neither. The
 * observation count printed beside each row had been changed from 167 to 207 without
 * re-deriving anything, which turned a stale claim into a false one.
 *
 * This is the generator that was missing. It applies the convention the component's own
 * header states — `StandardScaler.fit_transform()` over all features, then country means —
 * so the table is reproducible rather than remembered.
 *
 * WHAT IT CANNOT DO
 * -----------------
 * `C`, `D`, `S` and `G` are structurally unavailable in the v2 panel: the columns exist and
 * are `NA` in every row (KI-09..KI-11, and G's Gini is unavailable outside the OECD
 * sample). A country mean cannot be computed for them, so they are written as `0` — the
 * standardised mean, which is the neutral value the model expects — and the table records
 * that they are unavailable rather than measured. Writing anything else would be inventing
 * observations.
 *
 * Usage:  npm run generate:presets
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Papa from 'papaparse'

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const PANEL = path.join(REPO_ROOT, 'public', 'data', 'panel_canonical_v2.csv')
const OUT = path.join(REPO_ROOT, 'src', 'data', 'presets.generated.ts')

/** Columns the preset table carries, and whether the panel can supply them. */
const STANDARDISED = ['M', 'T', 'E', 'R'] as const
const UNAVAILABLE = ['C', 'D', 'S', 'G'] as const

/** ISO-3 to the display name and flag the modal shows. */
const DISPLAY: Record<string, { name: string; flag: string }> = {
  AUS: { name: 'Australia', flag: '🇦🇺' },
  BRA: { name: 'Brazil', flag: '🇧🇷' },
  BGR: { name: 'Bulgaria', flag: '🇧🇬' },
  CAN: { name: 'Canada', flag: '🇨🇦' },
  CHL: { name: 'Chile', flag: '🇨🇱' },
  CHN: { name: 'China', flag: '🇨🇳' },
  COL: { name: 'Colombia', flag: '🇨🇴' },
  CZE: { name: 'Czechia', flag: '🇨🇿' },
  DEU: { name: 'Germany', flag: '🇩🇪' },
  ESP: { name: 'Spain', flag: '🇪🇸' },
  EST: { name: 'Estonia', flag: '🇪🇪' },
  FIN: { name: 'Finland', flag: '🇫🇮' },
  FRA: { name: 'France', flag: '🇫🇷' },
  GBR: { name: 'United Kingdom', flag: '🇬🇧' },
  GEO: { name: 'Georgia', flag: '🇬🇪' },
  IND: { name: 'India', flag: '🇮🇳' },
  ITA: { name: 'Italy', flag: '🇮🇹' },
  JPN: { name: 'Japan', flag: '🇯🇵' },
  MEX: { name: 'Mexico', flag: '🇲🇽' },
  NLD: { name: 'Netherlands', flag: '🇳🇱' },
  NOR: { name: 'Norway', flag: '🇳🇴' },
  POL: { name: 'Poland', flag: '🇵🇱' },
  ROU: { name: 'Romania', flag: '🇷🇴' },
  RUS: { name: 'Russia', flag: '🇷🇺' },
  SWE: { name: 'Sweden', flag: '🇸🇪' },
  TUR: { name: 'Turkey', flag: '🇹🇷' },
  UKR: { name: 'Ukraine', flag: '🇺🇦' },
  USA: { name: 'United States', flag: '🇺🇸' },
  ZAF: { name: 'South Africa', flag: '🇿🇦' },
  GRC: { name: 'Greece', flag: '🇬🇷' },
  KOR: { name: 'South Korea', flag: '🇰🇷' },
  SVK: { name: 'Slovak Republic', flag: '🇸🇰' },
  SVN: { name: 'Slovenia', flag: '🇸🇮' },
  CHE: { name: 'Switzerland', flag: '🇨🇭' },
  TUR: { name: 'Turkiye', flag: '🇹🇷' },
}

type Row = Record<string, string>

const num = (value: string | undefined): number | null => {
  if (value == null || value === '' || value === 'NA') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Mean and population standard deviation over the finite values of a column. */
function columnStats(rows: Row[], column: string): { mean: number; sd: number } | null {
  const values = rows.map((r) => num(r[column])).filter((v): v is number => v !== null)
  if (values.length === 0) return null
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length
  return { mean, sd: variance > 0 ? Math.sqrt(variance) : 0 }
}

export type GeneratedPreset = {
  iso3: string
  name: string
  flag: string
  observations: number
  values: Record<string, number>
  /** Columns the panel could not supply, written as the standardised mean. */
  unavailable: string[]
}

export function buildPresets(rows: Row[]): GeneratedPreset[] {
  const stats = new Map<string, { mean: number; sd: number } | null>()
  for (const column of [...STANDARDISED, 'X']) stats.set(column, columnStats(rows, column))

  const byCountry = new Map<string, Row[]>()
  for (const row of rows) {
    const iso = (row.iso3 ?? '').trim()
    if (!iso) continue
    const list = byCountry.get(iso) ?? []
    list.push(row)
    byCountry.set(iso, list)
  }

  const out: GeneratedPreset[] = []

  for (const [iso3, countryRows] of [...byCountry.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const display = DISPLAY[iso3]
    // Only countries the modal has a label for; an unlabelled row would render as a bare
    // ISO code in a list of country names.
    if (!display) continue

    const values: Record<string, number> = {}
    const unavailable: string[] = []

    // X stays on the panel's raw scale: the slider is labelled in panel units and the
    // component's header says so explicitly.
    const xValues = countryRows.map((r) => num(r.X)).filter((v): v is number => v !== null)
    values.X = xValues.length > 0 ? xValues.reduce((a, b) => a + b, 0) / xValues.length : 0

    for (const column of STANDARDISED) {
      const columnValues = countryRows
        .map((r) => num(r[column]))
        .filter((v): v is number => v !== null)
      const stat = stats.get(column)
      if (columnValues.length === 0 || !stat || stat.sd === 0) {
        values[column] = 0
        unavailable.push(column)
        continue
      }
      const countryMean = columnValues.reduce((a, b) => a + b, 0) / columnValues.length
      values[column] = Number(((countryMean - stat.mean) / stat.sd).toFixed(4))
    }

    // Structurally unavailable channels: the standardised mean, which is what the model
    // neutralises them to. Recorded as unavailable rather than measured.
    for (const column of UNAVAILABLE) {
      values[column] = 0
      unavailable.push(column)
    }

    // `Gini` is an alias the modal carries for G; it maps to Y in the sliders.
    values.Gini = values.G ?? 0

    out.push({
      iso3,
      name: display.name,
      flag: display.flag,
      observations: countryRows.length,
      values,
      unavailable,
    })
  }

  return out
}

function main(): void {
  const text = fs.readFileSync(PANEL, 'utf8')
  const parsed = Papa.parse<Row>(text, { header: true, skipEmptyLines: true })
  const presets = buildPresets(parsed.data)

  const body = presets
    .map((preset) => {
      const values = Object.entries(preset.values)
        .map(([key, value]) => `      ${key}: ${value},`)
        .join('\n')
      return `  {
    iso3: '${preset.iso3}',
    name: '${preset.name}',
    flag: '${preset.flag}',
    observations: ${preset.observations},
    unavailable: [${preset.unavailable.map((c) => `'${c}'`).join(', ')}],
    values: {
${values}
    },
  },`
    })
    .join('\n')

  const source = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * Produced by \`npm run generate:presets\` from \`public/data/panel_canonical_v2.csv\`.
 *
 * Convention, matching the component header: \`StandardScaler.fit_transform()\` over all
 * features, then the mean per country. \`X\` is the exception — it stays on the panel's raw
 * scale because the slider is labelled in panel units.
 *
 * \`C\`, \`D\`, \`S\` and \`G\` are structurally unavailable in the v2 panel (their columns are
 * \`NA\` in every row), so they are written as \`0\` — the standardised mean the model
 * neutralises them to — and listed in \`unavailable\`. They are not measurements.
 *
 * \`check:presets\` re-derives this table from the panel and fails on drift.
 */

export type GeneratedPreset = {
  iso3: string
  name: string
  flag: string
  observations: number
  unavailable: string[]
  values: Record<string, number>
}

export const GENERATED_PRESETS: readonly GeneratedPreset[] = [
${body}
] as const
`

  fs.writeFileSync(OUT, source, 'utf8')
  console.log(
    `✅ ${path.relative(REPO_ROOT, OUT)} (${presets.length} presets, ` +
      `${presets.reduce((n, p) => n + p.observations, 0)} observations)`,
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
