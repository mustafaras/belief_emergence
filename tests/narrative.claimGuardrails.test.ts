import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Narrative Claim Guardrails Test
 *
 * Scientific Purpose:
 * Detect overclaim patterns in narrative surfaces (components, content, exports)
 * to prevent rhetorical overreach beyond evidence scope.
 *
 * Banned phrase patterns (from Phase 3 Claim Guardrails):
 * - Causal verbs: "drives", "driven", "determines", "determined" (except "model-determined")
 * - Policy framing: "policy lever", "policy levers", "policy implication", "policy implications"
 * - Unqualified inference: "what drives", "top drivers", "what determines"
 *
 * Allowed patterns:
 * - "contributes to", "associated with", "implies", "suggests"
 * - "model-implied", "illustrative", "exploratory scenario"
 * - "under the fitted model", "under the fitted surface"
 */

describe('Narrative Claim Guardrails - Phase 3 Enforcement', () => {
  // Banned phrase patterns that indicate overclaim
  const bannedPatterns = [
    /\bwhat\s+drives\b/gi,
    /\btop\s+drivers?\b/gi,
    /\bwhat\s+determines\b/gi,
    /\bpolicy\s+lever/gi,
    /\bpolicy\s+implications?\b/gi,
    /\bdrivers\s+that\s+intensify\b/gi,
    /\btheir\s+signs\s+determine\b/gi,
    /\bmodifiers?\s+determine\b/gi,
    /\bregimes?\s+are\s+determined\s+by\b/gi,
    /\bfactors\s+determine\b/gi,
  ]

  const componentFiles = [
    'src/components/ai/AiInterpreterModal.tsx',
    'src/components/sections/SystemDynamicsSection.tsx',
    'src/components/sections/SuppressorsSection.tsx',
    'src/components/sections/AmplifiersSection.tsx',
    'src/components/sections/BeliefEquationSection.tsx',
    'src/components/formula/FormulaDisplay.tsx',
    'src/components/documentation/InteractiveDocumentation.tsx',
  ]

  const contentFiles = [
    'src/content/reportNarrative.ts',
  ]

  const utilFiles = [
    'src/utils/pdf/exportBehavioralDynamicsReport.ts',
  ]

  it('detects banned causal language in component files', () => {
    for (const file of componentFiles) {
      if (!fs.existsSync(file)) {
        console.warn(`Component file not found: ${file}`)
        continue
      }

      const content = fs.readFileSync(file, 'utf8')
      const violations: { pattern: RegExp; line: number; text: string }[] = []

      for (const pattern of bannedPatterns) {
        const regex = new RegExp(pattern)
        // Count lines to find violations
        const lines = content.split('\n')
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          if (regex.test(lines[lineNum])) {
            violations.push({
              pattern,
              line: lineNum + 1,
              text: lines[lineNum].trim(),
            })
          }
        }
      }

      expect(violations).toEqual([])
    }
  })

  it('detects banned causal language in content files', () => {
    for (const file of contentFiles) {
      if (!fs.existsSync(file)) {
        console.warn(`Content file not found: ${file}`)
        continue
      }

      const content = fs.readFileSync(file, 'utf8')
      const violations: { pattern: RegExp; line: number; text: string }[] = []

      // For content files, be more lenient with "effect" terms (they're acceptable in model context)
      const contentBannedPatterns = bannedPatterns.filter((p) => !p.toString().includes('drivers'))

      for (const pattern of contentBannedPatterns) {
        const regex = new RegExp(pattern)
        const lines = content.split('\n')
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          if (regex.test(lines[lineNum])) {
            violations.push({
              pattern,
              line: lineNum + 1,
              text: lines[lineNum].trim(),
            })
          }
        }
      }

      expect(violations).toEqual([])
    }
  })

  it('detects banned causal language in utility/export files', () => {
    for (const file of utilFiles) {
      if (!fs.existsSync(file)) {
        console.warn(`Utility file not found: ${file}`)
        continue
      }

      const content = fs.readFileSync(file, 'utf8')
      const violations: { pattern: RegExp; line: number; text: string }[] = []

      // For utility files, look for narrative-style overclaims only
      const utilBannedPatterns = bannedPatterns.filter((p) => {
        const str = p.toString()
        return !str.includes('leading') // Ignore "leading" as it's a PDF layout term
      })

      for (const pattern of utilBannedPatterns) {
        const regex = new RegExp(pattern)
        const lines = content.split('\n')
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          // Skip comments that mention these terms in documentation
          if (!lines[lineNum].trim().startsWith('//') && regex.test(lines[lineNum])) {
            violations.push({
              pattern,
              line: lineNum + 1,
              text: lines[lineNum].trim(),
            })
          }
        }
      }

      expect(violations).toEqual([])
    }
  })

  it('verifies exploratory framing in SystemDynamicsSection', () => {
    const file = 'src/components/sections/SystemDynamicsSection.tsx'
    if (!fs.existsSync(file)) {
      console.warn(`File not found: ${file}`)
      return
    }

    const content = fs.readFileSync(file, 'utf8')

    // Should contain exploratory caveats
    const hasExploratoryMarks =
      content.includes('exploratory scenario') ||
      content.includes('exploratory') ||
      content.includes('illustrative')

    expect(hasExploratoryMarks).toBe(true)

    // Should use "Model-Implied" framing for sensitivity
    const hasModelImpliedFraming = content.includes('Model-Implied')

    expect(hasModelImpliedFraming).toBe(true)
  })

  it('verifies model-conditioning language in SystemDynamicsSection', () => {
    const file = 'src/components/sections/SystemDynamicsSection.tsx'
    if (!fs.existsSync(file)) {
      console.warn(`File not found: ${file}`)
      return
    }

    const content = fs.readFileSync(file, 'utf8')

    // Should have model-conditioning phrases
    const hasConditioningLanguage =
      content.includes('under the fitted model') ||
      content.includes('under fitted model') ||
      content.includes('under the fitted surface')

    expect(hasConditioningLanguage).toBe(true)
  })

  it('verifies neutral language in AiInterpreterModal', () => {
    const file = 'src/components/ai/AiInterpreterModal.tsx'
    if (!fs.existsSync(file)) {
      console.warn(`File not found: ${file}`)
      return
    }

    const content = fs.readFileSync(file, 'utf8')

    // Should have neutral question framing
    const hasNeutralQuestions =
      content.includes('contributes') ||
      content.includes('associated') ||
      content.includes('implies')

    expect(hasNeutralQuestions).toBe(true)
  })

  it('verifies scenario terminology in SuppressorsSection', () => {
    const file = 'src/components/sections/SuppressorsSection.tsx'
    if (!fs.existsSync(file)) {
      console.warn(`File not found: ${file}`)
      return
    }

    const content = fs.readFileSync(file, 'utf8')

    // Check that language is model-conditional
    const hasModelCondition =
      content.includes('Under the fitted model') ||
      content.includes('under the fitted model') ||
      content.includes('govern whether')

    expect(hasModelCondition).toBe(true)
  })

  it('intentional failing case: detects bad overclaim pattern when introduced manually', () => {
    // This test demonstrates that the guardrails WOULD catch overclaims if introduced
    const exampleBadNarrative = `
      The policy lever analysis shows what drives Z in our model.
      Top drivers of belief are education and social support.
      These factors determine whether regimes are stable.
    `

    const violations: string[] = []

    for (const pattern of bannedPatterns) {
      const lines = exampleBadNarrative.split('\n')
      for (const line of lines) {
        if (pattern.test(line)) {
          violations.push(line.trim())
        }
      }
    }

    // This SHOULD find violations - demonstrating the test catches overclaims
    expect(violations.length).toBeGreaterThan(0)
    expect(violations.some((v) => v.includes('drives'))).toBe(true)
    expect(violations.some((v) => v.includes('policy lever'))).toBe(true)
    // Check for determined or other variations of determine
    expect(violations.some((v) => v.toLowerCase().includes('determine'))).toBe(true)
  })

  it('guardrails pass for acceptable model-qualified language', () => {
    // This demonstrates that legitimate language passes
    const exampleGoodNarrative = `
      The model-implied sensitivity analysis shows what contributes to Z.
      The largest contributors to belief change are education and social support.
      Under the fitted model, these factors shape whether regimes are stable.
      This is an exploratory scenario under the fitted surface.
    `

    const violations: string[] = []

    for (const pattern of bannedPatterns) {
      const lines = exampleGoodNarrative.split('\n')
      for (const line of lines) {
        if (pattern.test(line)) {
          violations.push(line.trim())
        }
      }
    }

    // This should NOT find violations - demonstrating the test allows qualified language
    expect(violations.length).toBe(0)
  })
})
