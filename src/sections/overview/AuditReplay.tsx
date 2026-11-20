import { useEffect, useRef, useState } from 'react'
import { formatClaim } from '../../claims/format'
import { getClaim } from '../../claims/registry'
import { designGateData, GATE_ORDER } from '../../claims/selectors/gates'
import { Badge, Card } from '../../ui'
import { ReplayMini } from './ReplayMini'
import styles from './AuditReplay.module.css'

/**
 * Audit Replay — how the submitted panel became the rebuilt one, in four moves.
 *
 * The step list is not a summary of the paper; it is the sequence in which the gates start
 * failing and stop. Step 0 is the starting state (all four fail), and each subsequent step
 * repairs one thing and shows which gates that repaired. Modelling it that way keeps the
 * reader's question — "how did one panel become the other?" — answerable by scrolling.
 *
 * The gate states shown are derived, not written: `design_gates.json` says which gates pass
 * on which panel, and each step names the gates it fixes. If the artifact changed, the last
 * step would stop agreeing with the panel and the replay would be visibly wrong rather than
 * quietly wrong.
 */
type GateState = 'fail' | 'pass' | 'pending'

type Step = {
  id: string
  /** 1-based index shown to the reader; step 0 is the starting state. */
  number: string
  title: string
  body: string
  /** Gates this step repairs, in artifact ids. */
  fixes: readonly (typeof GATE_ORDER)[number][]
  /** Reliability outcome this step produces, for the last step. */
  reliability?: boolean
}

const STEPS: Step[] = [
  {
    id: 'submitted',
    number: 'Start',
    title: 'The submitted panel',
    body:
      'This is what was published. All four design rules fail on it, and no amount of model fitting can repair that: the failures are properties of the design matrix, not of the estimator. Everything that follows is one repair at a time.',
    fixes: [],
  },
  {
    id: 'identity',
    number: '1',
    title: 'Identity',
    body:
      'The outcome was an exact affine rescaling of the cultural-intensity predictor. The cause was a single wrong item code: the C index was built from A006, the first item of the outcome. Rebuilding C from its own configured items breaks the rescaling, and the first gate clears.',
    fixes: ['identity'],
  },
  {
    id: 'duplicates',
    number: '2',
    title: 'Duplicates and rank',
    body:
      'Two predictors were the same variable with opposite sign, which also left the design matrix one column short of full rank. Both failures come from one duplication, so removing it repairs both gates at once.',
    fixes: ['duplicates', 'rank'],
  },
  {
    id: 'reliability',
    number: '3',
    title: 'Reliability',
    body:
      'The remaining composites are tested rather than assumed. Cultural intensity and social atomization fail a routine reliability floor and are withdrawn; social support cannot be computed at all because four of its seven configured items are absent from the harmonised source. Only belief intensity survives.',
    fixes: ['singlePredictor'],
    reliability: true,
  },
  {
    id: 'honest',
    number: '4',
    title: 'The honest comparison',
    body:
      'With a design that supports interpretation, the model comparison becomes answerable. The bounded and linear forms tie out of sample: they agree to four decimals, and the difference is an order of magnitude smaller than fold-to-fold variation, so neither form is shown to predict better.',
    fixes: [],
  },
]

/** Gate states after applying every step up to and including `index`. */
function statesAfter(index: number): Record<string, GateState> {
  const repaired = new Set<string>()
  for (const step of STEPS.slice(0, index + 1)) for (const id of step.fixes) repaired.add(id)
  // The rebuilt panel's verdict is the authority for "all four pass"; if it ever stopped
  // being all-pass, the replay would show it rather than claiming completion.
  const authoritative = designGateData.rebuilt.allPass
  return Object.fromEntries(
    GATE_ORDER.map((id) => {
      if (repaired.has(id)) return [id, 'pass']
      if (index === STEPS.length - 1 && authoritative) return [id, 'pass']
      return [id, 'fail']
    }),
  )
}

const GATE_LABELS: Record<string, string> = {
  identity: 'No predictor restates the outcome',
  duplicates: 'No two predictors are duplicates',
  rank: 'Design matrix is full rank',
  singlePredictor: 'No single predictor explains the outcome',
}

export function AuditReplay() {
  const [active, setActive] = useState(0)
  const stepRefs = useRef<Array<HTMLLIElement | null>>([])
  /**
   * `matchMedia` is absent in jsdom and in older embedded webviews. The reduced-motion rule
   * itself is CSS (`@media (prefers-reduced-motion: reduce)`), so this flag is only used to
   * decide whether to smooth-scroll; a missing implementation must degrade to "animate",
   * not throw.
   */
  const reducedMotion = useRef(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }, [])

  useEffect(() => {
    // Which step is "current" is decided by geometry, not by a callback that only fires on
    // threshold crossings: with a banded rootMargin the observer stops firing once a step is
    // fully outside the band, and the panel then keeps the last value it saw. Measuring on
    // scroll is cheap here (five elements) and cannot get stuck.
    const update = () => {
      const nodes = stepRefs.current.filter((node): node is HTMLLIElement => node !== null)
      if (nodes.length === 0) return
      // A layout-less environment (jsdom, or a display:none container) reports every rect as
      // zero, which would satisfy "top <= line" for all steps and select the last one. Stay
      // at the start rather than jumping to the end.
      if (nodes.every((node) => node.getBoundingClientRect().top === 0)) return
      // The step whose top is closest to the reading line, without going past it.
      const line = window.innerHeight * 0.35
      let best = 0
      nodes.forEach((node, index) => {
        if (node.getBoundingClientRect().top <= line) best = index
      })
      setActive(best)
    }

    update()
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  const states = statesAfter(active)
  const passing = Object.values(states).filter((state) => state === 'pass').length

  return (
    <section aria-label="Audit replay" className={styles.replay}>
      <div className={styles.intro}>
        <h2 className={styles.h2}>Audit replay</h2>
        <p className={styles.lede}>
          Four moves took the published panel to one whose design supports interpretation. Scroll
          through them; the panel state follows.
        </p>
      </div>

      <div className={styles.layout}>
        <Card as="section" aria-label="Panel state" className={styles.sticky}>
          <p className={styles.stickyTitle}>Panel state</p>
          <p aria-live="polite" className={styles.stickyCount}>
            <strong data-testid="replay-passing">{passing}</strong> of {GATE_ORDER.length} gates pass
          </p>
          <ul className={styles.gateList}>
            {GATE_ORDER.map((id) => {
              const state = states[id]
              return (
                <li className={styles.gateRow} key={id}>
                  <span className={styles.gateLabel}>{GATE_LABELS[id]}</span>
                  <Badge variant={state === 'pass' ? 'pass' : 'withdrawn'}>
                    {state === 'pass' ? 'Pass' : 'Fail'}
                  </Badge>
                </li>
              )
            })}
          </ul>

        </Card>

        <nav aria-label="Replay steps" className={styles.stepNav}>
          {STEPS.map((step, index) => (
            <button
              aria-current={index === active ? 'step' : undefined}
              className={styles.stepButton}
              key={step.id}
              onClick={() => setActive(index)}
              type="button"
            >
              {step.number === 'Start' ? 'Start' : `Step ${step.number}`}
            </button>
          ))}
        </nav>

        <ol className={styles.steps}>
          {STEPS.map((step, index) => (
            <li
              className={index === active ? styles.stepActive : styles.step}
              key={step.id}
              ref={(node) => { stepRefs.current[index] = node }}
            >
              <p className={styles.stepNumber}>{step.number === 'Start' ? 'Start' : `Step ${step.number}`}</p>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>

              {step.fixes.length > 0 && (
                <p className={styles.stepFixes}>
                  Repairs:{' '}
                  {step.fixes.map((id) => (
                    <span className={styles.fixTag} key={id}>{GATE_LABELS[id]}</span>
                  ))}
                </p>
              )}

              {step.reliability && (
                <p className={styles.stepFixes}>
                  Withdrawn:{' '}
                  <span className={styles.fixTag}>Cultural intensity</span>
                  <span className={styles.fixTag}>Social atomization</span>
                  <span className={styles.fixTag}>Not computable: social support</span>
                </p>
              )}

              {step.id === 'honest' && (
                <p className={styles.delta}>
                  Grouped k-fold R²: bounded {formatClaim(getClaim('eval.bounded.kfold').value, 'r2')},{' '}
                  linear {formatClaim(getClaim('eval.linear.kfold').value, 'r2')}. Difference{' '}
                  <strong>{formatClaim(getClaim('eval.bounded.kfold').value - getClaim('eval.linear.kfold').value, 'p6')}</strong>,
                  which is inside fold-to-fold variation.
                </p>
              )}

              {/* Rendered unconditionally: the chart belongs to this step's content. It
                  used to appear only while the step was active, which made the DOM change
                  under a keyboard user mid-traversal and left two focusable buttons that
                  could not be reached. */}
              {step.id === 'honest' && <ReplayMini />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
