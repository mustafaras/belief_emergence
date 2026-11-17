import { useRoute } from '../../app/useRoute'
import { Num, SectionHeader } from '../../ui'
import { AuditReplay } from './AuditReplay'
import { FindingCard } from './FindingCard'
import styles from './Overview.module.css'

export default function OverviewSection() {
  const { navigate } = useRoute()

  return (
    <section className={styles.overview}>
      <SectionHeader
        eyebrow="Interactive companion · Research article"
        title="Measurement Validity Before Model Geometry"
        subtitle="A Reproducible Audit of Bounded Response Models"
        lede="A retrospective audit of a published bounded country-panel framework checks whether its constructs and design support interpretation before comparing model fit."
      />

      <div aria-label="Main findings" className={styles.findings} role="group">
        <FindingCard
          description="Configured constructs fail reliability."
          metric={<><Num id="audit.failedCount" /> <span className={styles.fractionConnector}>of</span> <Num id="audit.constructCount" /></>}
          onNavigate={navigate}
          route="audit"
          routeLabel="Construct audit"
          status="withdrawn"
          statusLabel="Withdrawn"
          title="Measurement gate"
        />
        <FindingCard
          description="The published outcome was a rescaling of a predictor."
          metric={<Num id="gates.original.identityCorr" />}
          onNavigate={navigate}
          route="gates"
          routeLabel="Design gates"
          status="withdrawn"
          statusLabel="Withdrawn"
          title="Outcome identity"
        />
        <FindingCard
          description="The two models tie at four decimals out of sample; neither shows predictive superiority."
          metric={(
            <div className={styles.metricPair}>
              <span className={styles.metricValue}>
                <span className={styles.metricLabel}>Bounded</span>
                <Num format="p4" id="eval.bounded.kfold" />
              </span>
              <span aria-hidden="true" className={styles.versus}>≈</span>
              <span className={styles.metricValue}>
                <span className={styles.metricLabel}>Linear</span>
                <Num format="p4" id="eval.linear.kfold" />
              </span>
            </div>
          )}
          onNavigate={navigate}
          route="evaluation"
          routeLabel="Evaluation"
          status="neutral"
          statusLabel="Neutral"
          title="Out-of-sample comparison"
        />
        <FindingCard
          description="The profile does not identify the structural exponent within the tested range."
          metric={(
            <>
              <span className={styles.metricDescriptor}>Profile α</span>
              <Num format="p3" id="limits.profile.bonferroniUpper" />
            </>
          )}
          onNavigate={navigate}
          route="limits"
          routeLabel="Limits and sensitivity"
          status="unidentified"
          statusLabel="Unidentified"
          title="Structural exponent"
        />
      </div>

      <section aria-labelledby="how-to-read" className={styles.readingGuide}>
        <h2 id="how-to-read">How to read this</h2>
        <ul>
          <li><strong>Validity first.</strong> Measurement and design checks set the boundary for model interpretation.</li>
          <li><strong>Every number is clickable.</strong> Open a value to inspect its source artifact and path.</li>
          <li><strong>Decisions are interactive.</strong> Compare the reported evidence while keeping each conclusion within its limits.</li>
        </ul>
      </section>

      <AuditReplay />
    </section>
  )
}
