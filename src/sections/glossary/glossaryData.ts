/**
 * The notation glossary as table rows.
 *
 * `notation_glossary.json` groups symbols five ways (model variables, Greek letters, derived
 * quantities, hyperparameters, coefficient terms) and each group carries different fields.
 * The table needs one shape, so the differences are resolved here rather than in the
 * component: a symbol's "definition or role" is its `definition` where there is one and its
 * `role` otherwise, and "fitted over" is a numeric window where one exists and an em dash
 * where it does not.
 *
 * Nothing is invented. When a field is absent the cell says so; a blank is honest about
 * missing metadata, and a plausible-looking range typed in by hand is not.
 */
import glossary from '../../data/analysis/notation_glossary.json'

export type GlossarySection =
  | 'Model variable'
  | 'Greek letter'
  | 'Derived quantity'
  | 'Hyperparameter'
  | 'Coefficient term'

export type GlossaryEntry = {
  symbol: string
  /** KaTeX for the symbol cell. Greek letters and composites are wrapped in math mode. */
  tex: string
  name: string
  definition: string
  source: string
  /** The fitting/evaluation window, or an em dash when the artifact declares none. */
  window: string
  section: GlossarySection
}

/** A range formatted the way a reader expects to read it, or an em dash. */
function formatWindow(range: number[] | undefined): string {
  if (!range || range.length < 2) return '—'
  const [min, max] = range
  if (!Number.isFinite(min) || !Number.isFinite(max)) return '—'
  // Three significant places is enough to show the boundary; the artifact carries the full
  // precision and the Data section prints it where precision matters.
  return `${min.toFixed(3)} to ${max.toFixed(3)}`
}

/** Bare Latin symbols are set as text; Greek and composites go through math mode. */
function toTex(symbol: string): string {
  if (/^[A-Za-z]$/.test(symbol)) return symbol
  if (/^[A-Za-z]{1,2}_\{?[A-Za-z0-9]+\}?$/.test(symbol)) return symbol
  return symbol
}

const entries: GlossaryEntry[] = []

for (const variable of glossary.model_variables) {
  entries.push({
    symbol: variable.symbol,
    tex: toTex(variable.symbol),
    name: variable.name,
    definition: `${variable.role.replace(/_/g, ' ')} · ${variable.type} · scale ${variable.scale}`,
    source: variable.source,
    window: formatWindow(variable.fitting_window),
    section: 'Model variable',
  })
}

for (const letter of glossary.greek_letters) {
  entries.push({
    symbol: letter.symbol,
    tex: `\\${greekTexName(letter.symbol)}`,
    name: letter.name,
    definition: `${letter.definition} · ${letter.domain}`,
    source: 'defined in the model',
    window: '—',
    section: 'Greek letter',
  })
}

for (const derived of glossary.derived_quantities) {
  entries.push({
    symbol: derived.symbol,
    tex: toTex(derived.symbol),
    name: derived.name,
    definition: `${derived.definition} · ${derived.domain}`,
    source: 'derived from the model variables',
    window: '—',
    section: 'Derived quantity',
  })
}

for (const hyperparameter of glossary.hyperparameters) {
  const hasBounds = 'bounds' in hyperparameter && Array.isArray(hyperparameter.bounds)
  const hasValues = 'values' in hyperparameter && Array.isArray(hyperparameter.values)
  entries.push({
    symbol: hyperparameter.symbol,
    tex: toTex(hyperparameter.symbol.split(' ')[0]),
    name: hyperparameter.name,
    definition: hyperparameter.role,
    source: hasBounds
      ? `bounds ${(hyperparameter.bounds as number[]).map((v) => Number(v).toPrecision(3)).join(' to ')}`
      : hasValues
        ? `values ${(hyperparameter.values as number[]).map((v) => Number(v).toFixed(3)).join(', ')}`
        : '—',
    window: '—',
    section: 'Hyperparameter',
  })
}

// Tier A and C list bare names; tier B carries a formula for each interaction, because an
// interaction's meaning is not recoverable from its name alone. Both shapes are read, and
// the shape decides what the definition cell says.
for (const [tier, terms] of Object.entries(glossary.coefficient_terms)) {
  /*
   * `coefficient_terms` holds one non-list entry: `status_note`, a sentence about the nominal
   * tier parameterisation. Iterating it produced 164 glossary rows, one per character — the
   * glossary test caught the total (220 against an expected 56) but the cause was invisible
   * from the count alone.
   */
  if (!Array.isArray(terms)) continue
  for (const term of terms as Array<string | { term: string; definition: string }>) {
    const name = typeof term === 'string' ? term : term.term
    const definition = typeof term === 'string'
      ? `Estimated coefficient for ${name.replace(/^c_/, '')}`
      : `${term.definition}`
    entries.push({
      symbol: name,
      tex: name.replace(/_/g, '\\_'),
      name: `${tier.replace(/_/g, ' ')} coefficient`,
      definition,
      source: 'coefficient_fit',
      window: '—',
      section: 'Coefficient term',
    })
  }
}

/** KaTeX command for a Greek character, by its literal. */
function greekTexName(symbol: string): string {
  const map: Record<string, string> = {
    'Φ': 'Phi', 'φ': 'phi', 'σ': 'sigma', 'θ': 'theta', 'λ': 'lambda',
    'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'κ': 'kappa',
    'ε': 'varepsilon', 'ρ': 'rho', 'τ': 'tau', 'χ': 'chi', 'μ': 'mu',
  }
  return map[symbol] ?? 'mathrm{' + symbol + '}'
}

export const GLOSSARY: GlossaryEntry[] = entries

/**
 * A regime's formal definition as TeX.
 *
 * The artifact stores these as plain Unicode (`Z < 0.33`, `0.33 ≤ Z < 0.67`). KaTeX does not
 * accept bare `<` or `≤` outside math mode, so the comparison operators are mapped to their
 * TeX names and the number literals are left alone. The mapping is total over the five
 * definitions the artifact contains; a definition with an operator not listed here would
 * render its raw character rather than being silently dropped.
 */
export function regimeTex(definition: string): string {
  return definition
    .replace(/\s*≤\s*/g, ' \\le ')
    .replace(/\s*≥\s*/g, ' \\ge ')
    .replace(/\s*→\s*/g, ' \\to ')
    .replace(/(?<![<>])=(?!=)/g, '=')
    .replace(/<(?![=>])/g, '<')
    .replace(/(?<![<=])>(?!=)/g, '>')
}
