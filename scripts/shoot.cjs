#!/usr/bin/env node
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium } = require('playwright-core')

const viewports = {
  mob: { width: 390, height: 844 },
  tab: { width: 768, height: 1024 },
  desk: { width: 1440, height: 900 }
}

function resolveUrl(route) {
  const base = process.env.APP_BASE_URL || 'http://127.0.0.1:5199/belief_emergence/'
  if (route === 'kit') return `${base}?v=__kit`
  if (route.startsWith('?')) return `${base}${route}`
  return new URL(route.replace(/^\/+/, ''), base).toString()
}

async function main() {
  const [route = 'kit', viewportName = 'desk', theme = 'light'] = process.argv.slice(2)
  const viewport = viewports[viewportName]
  if (!viewport) throw new Error(`Unknown viewport ${viewportName}; use mob, tab, or desk.`)
  if (!['light', 'dark'].includes(theme)) throw new Error(`Unknown theme ${theme}; use light or dark.`)

  const executablePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  const browser = await chromium.launch({ headless: true, executablePath })
  const page = await browser.newPage({ viewport, colorScheme: theme })
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.addInitScript(themeName => {
    document.addEventListener('DOMContentLoaded', () => {
      document.documentElement.dataset.theme = themeName
    }, { once: true })
  }, theme)

  try {
    await page.goto(resolveUrl(route), { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: outputPath(route, viewportName, theme), fullPage: true })
    if (pageErrors.length > 0) throw new Error(`Page errors: ${pageErrors.join('; ')}`)
    console.log(`Screenshot saved: ${outputPath(route, viewportName, theme)}`)
  } finally {
    await browser.close()
  }
}

function outputPath(route, viewportName, theme) {
  const safeRoute = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'kit'
  return path.join('tmp', 'shots', `${safeRoute}-${viewportName}-${theme}.png`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
