import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const BASELINE_DIR = path.join(ROOT, 'tests', 'visual-baselines')
const baselineFiles = fs.existsSync(BASELINE_DIR)
  ? fs.readdirSync(BASELINE_DIR).filter((file) => file.endsWith('.png'))
  : []

if (baselineFiles.length === 0) {
  console.log('SKIP  no visual baselines; route/theme/viewport baselines are scheduled for P37')
} else {
  console.error('FAIL  legacy visual baselines remain; remove them before rebuilding the P37 baseline set')
  process.exitCode = 1
}
