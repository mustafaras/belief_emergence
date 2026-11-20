import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/design/tokens.css', import.meta.url), 'utf8')
const light = declarationsFor(css, ':root')
const dark = declarationsFor(css, '[data-theme="dark"]')
const systemDark = declarationsFor(css, ':root:not([data-theme="light"])')

const tokenNames = [
  '--bg', '--surface', '--surface-2', '--ink', '--ink-2', '--ink-3', '--line',
  '--accent', '--pass', '--withdrawn', '--unidentified', '--exploratory', '--focus',
  '--tier-a', '--tier-b', '--tier-c', '--linear',
  ...Array.from({ length: 9 }, (_, index) => `--space-${index + 1}`),
  ...Array.from({ length: 3 }, (_, index) => `--radius-${index + 1}`),
  '--shadow-1', '--font-serif', '--font-sans', '--font-mono',
  '--fs-12', '--fs-14', '--fs-16', '--fs-18', '--fs-28', '--fs-40',
  '--dur-1', '--dur-2', '--dur-3', '--ease', '--w-prose', '--w-wide', '--w-full'
]

function declarationsFor(source: string, selector: string): Record<string, string> {
  const selectorIndex = source.indexOf(selector)
  if (selectorIndex < 0) throw new Error(`Missing CSS selector: ${selector}`)
  const openBrace = source.indexOf('{', selectorIndex)
  const closeBrace = source.indexOf('}', openBrace)
  const body = source.slice(openBrace + 1, closeBrace)
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()])
  )
}

function relativeLuminance(hex: string): number {
  const channels = hex.replace('#', '').match(/.{2}/g)
  if (!channels || channels.length !== 3) throw new Error(`Expected a six-digit hex color: ${hex}`)
  const linear = channels.map(channel => {
    const value = Number.parseInt(channel, 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrastRatio(first: string, second: string): number {
  const values = [relativeLuminance(first), relativeLuminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

function expectContrast(tokens: Record<string, string>, foreground: string, background: string, minimum: number) {
  expect(contrastRatio(tokens[foreground], tokens[background])).toBeGreaterThanOrEqual(minimum)
}

describe('design tokens', () => {
  it('defines every design token in light, explicit dark, and system dark themes', () => {
    for (const name of tokenNames) {
      expect(light[name], `light ${name}`).toBeDefined()
      expect(dark[name], `dark ${name}`).toBeDefined()
      expect(systemDark[name], `system dark ${name}`).toBeDefined()
      expect(systemDark[name], `system dark matches ${name}`).toBe(dark[name])
    }
  })

  it.each([
    ['light', light],
    ['dark', dark]
  ])('meets text and state contrast in the %s theme', (_theme, tokens) => {
    expectContrast(tokens, '--ink', '--bg', 7)
    expectContrast(tokens, '--ink-2', '--bg', 4.5)
    expectContrast(tokens, '--ink-3', '--bg', 4.5)
    for (const status of ['--pass', '--withdrawn', '--unidentified', '--exploratory']) {
      expectContrast(tokens, status, '--surface', 4.5)
    }
  })

  it.each([
    ['light', light],
    ['dark', dark]
  ])('keeps data colors distinguishable in the %s theme', (_theme, tokens) => {
    for (const series of ['--tier-a', '--tier-b', '--tier-c', '--linear']) {
      expectContrast(tokens, series, '--surface', 3)
    }
  })
})
