/**
 * Write the metrics the README needs, as JSON, for the generator to consume.
 *
 * The generator cannot import the claim registry directly: `src/claims/selectors/data.ts`
 * imports the canonical panel as `?raw`, a Vite-only specifier that plain Node cannot
 * resolve. Rather than duplicating the registry's values in a second place, this dump runs
 * inside Vitest — which resolves the same module graph the application does — and writes the
 * numbers out. `generate_readme.ts` then reads that file, so there is exactly one source.
 *
 * Run via `npm run readme:metrics`, which invokes the test that writes it.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { listClaims } from '../src/claims/registry'
import { REPRODUCTION_MANIFEST, MANIFEST_CLAIM_COUNT } from '../src/evidence/reproductionManifest.generated'
import { GATE_LOOP_CHECKS } from '../src/sections/reproduce/gateSteps.generated'

const OUT = path.join(process.cwd(), 'tmp', 'readme-metrics.json')

export function dumpReadmeMetrics(): void {
  const claims = listClaims()
  const byId = new Map(claims.map((claim) => [claim.id, claim]))
  const value = (id: string): number => {
    const claim = byId.get(id)
    if (!claim) throw new Error(`README needs claim ${id}, which the registry does not contain`)
    return claim.value
  }

  const payload = {
    generatedFrom: 'src/claims/registry.ts via vitest',
    claimCount: claims.length,
    values: {
      panelRows: value('data.panelRows'),
      countries: value('data.countries'),
      r2: value('eval.headline.r2'),
      corr: value('eval.headline.corr'),
      mae: value('eval.headline.mae'),
      rmse: value('eval.headline.rmse'),
      constructsRetained: value('audit.constructs.retained'),
      constructsWithdrawn: value('audit.constructs.withdrawn'),
    },
    manifest: { routes: REPRODUCTION_MANIFEST.routes.length, claims: MANIFEST_CLAIM_COUNT },
    gateChecks: GATE_LOOP_CHECKS.total,
  }

  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(payload, null, 1))
  console.log(`dumped ${Object.keys(payload.values).length} values to ${OUT}`)
}
