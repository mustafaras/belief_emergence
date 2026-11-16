import { useState } from 'react'
import { X } from 'lucide-react'
import '../design/fonts'
import '../design/reset.css'
import '../design/tokens.css'
import { Calibration, CompareBars, DistStrip, Funnel, Heatmap, HexScatter, LineProfile } from '../charts'
import { Badge, Button, Callout, Card, DataTable, Drawer, ErrorState, FigureFrame, IconButton, Kbd, Num, Popover, SectionHeader, SegmentedControl, Skeleton, Slider, Tabs, Toggle, Tooltip } from '../ui'
import styles from './KitGallery.module.css'

const compareSeries = [
  { key: 'linear', label: 'Linear', color: 'var(--linear)' },
  { key: 'bounded', label: 'Bounded', color: 'var(--accent)' }
]

function ComponentGallery() {
  const [segment, setSegment] = useState('A')
  const [sliderValue, setSliderValue] = useState(0.6)
  const [enabled, setEnabled] = useState(true)
  return (
    <>
      <section className={styles.block}>
        <SectionHeader eyebrow="Components" title="Evidence interface" lede="Reusable controls and states for an auditable research surface." />
        <div className={styles.row}>
          <Button>Primary</Button><Button variant="secondary">Secondary</Button><Button variant="ghost">Ghost</Button>
          <IconButton aria-label="Close"><X aria-hidden="true" /></IconButton>
          <Badge variant="pass">Verified</Badge><Badge variant="withdrawn">Withdrawn</Badge>
          <Badge variant="unidentified">Unidentified</Badge><Badge variant="exploratory">Exploratory</Badge><Badge variant="neutral">Neutral</Badge>
          <Kbd>⌘K</Kbd><Skeleton aria-label="Loading preview" />
        </div>
        <div className={styles.row}>
          <Callout variant="finding">A measured finding.</Callout>
          <ErrorState artifact="example.json" message="The example is malformed." />
        </div>
        <Card><p>Evidence card content</p></Card>
      </section>
      <section className={styles.block}>
        <h2>Interactive controls</h2>
        <div className={styles.row}>
          <SegmentedControl label="Model tier" options={[{ value: 'A', label: 'Tier A' }, { value: 'B', label: 'Tier B' }, { value: 'C', label: 'Tier C' }]} value={segment} onChange={setSegment} />
          <Slider label="Reliability threshold" min={0} max={1} step={0.01} value={sliderValue} onChange={setSliderValue} marks={[{ value: 0.5, label: '0.50' }]} paperValue={0.7} />
          <Toggle checked={enabled} label="Include exploratory tier" onChange={setEnabled} />
          <Tooltip content="A source-bound claim."><Button variant="secondary">Hover or focus</Button></Tooltip>
          <Popover label="Evidence detail" trigger="Open popover"><p>Popover content remains in the focus order.</p></Popover>
          <Drawer title="Filter data" trigger="Open drawer"><Button>Apply filters</Button></Drawer>
        </div>
        <Tabs label="Evidence views" tabs={[{ id: 'summary', label: 'Summary', content: <p>Summary content</p> }, { id: 'limits', label: 'Limits', content: <p>Limits content</p> }]} />
        <DataTable caption="Country evidence" columns={[{ key: 'country', header: 'Country', sortable: true }, { key: 'rows', header: 'Rows', align: 'right', sortable: true }]} rows={[{ country: 'Canada', rows: 12 }, { country: 'Türkiye', rows: 8 }]} stickyFirst />
        <FigureFrame number="S1" title="Evidence frame" scope="Current canonical panel" method="Grouped cross-validation" boundary="Descriptive, non-causal evidence." sources={['metrics_authoritative.json', 'cv_kfold.json']}>
          <p>Claim-bound number: <Num id="audit.respondents" /></p>
        </FigureFrame>
      </section>
    </>
  )
}

function ChartGallery() {
  return (
    <section className={styles.block}>
      <h2>Charts</h2>
      <div className={styles.chartGrid}>
        <CompareBars title="Model comparison" description="Grouped in-sample and held-out scores." groups={[{ label: 'In sample', values: [{ series: 'linear', value: 0.4623 }, { series: 'bounded', value: 0.4061 }] }, { label: 'Grouped k-fold', values: [{ series: 'linear', value: 0.3976 }, { series: 'bounded', value: 0.4207 }] }]} series={compareSeries} />
        <DistStrip title="Fold distribution" description="Distribution of validation scores." series={[{ key: 'a', label: 'Tier A', color: 'var(--tier-a)', values: [0.21, 0.36, 0.45, 0.61] }, { key: 'b', label: 'Tier B', color: 'var(--tier-b)', values: [0.18, 0.33, 0.48, 0.64] }]} reference={{ value: 0.4, label: 'Nominal' }} />
        <LineProfile title="Sensitivity profile" description="Outcome response over the tested input range." points={[{ x: 1, y: 0.2 }, { x: 2, y: 0.35 }, { x: 4, y: 0.58 }, { x: 8, y: 0.72 }]} thresholds={[{ y: 0.5, label: 'Midpoint', style: 'dashed' }]} highlightX={[{ x: 2, label: 'Reference' }]} xLabel="Input" yLabel="Response" />
        <Heatmap title="Country-year support" description="Observed panel coverage." rows={['Canada', 'Türkiye', 'Ghana']} cols={['1990', '2000', '2010', '2020']} values={[[0.2, 0.4, null, 0.8], [0.3, 0.5, 0.7, 0.9], [null, 0.25, 0.45, 0.6]]} scale="viridis" legendLabel="Support intensity" />
        <Funnel title="Evidence funnel" description="Respondent, country-year, outcome, and estimation counts." steps={[{ label: 'Respondents', claimId: 'audit.respondents', unit: 'respondents' }, { label: 'Country-years', claimId: 'audit.countryYears', unit: 'country-years' }, { label: 'Outcome cells', claimId: 'audit.Z.cells', unit: 'country-years' }, { label: 'Panel rows', claimId: 'data.panelRows', unit: 'country-years' }]} />
        <HexScatter title="Observed and predicted" description="Hexagonal density of observed and predicted values." points={[{ x: 0.1, y: 0.15 }, { x: 0.2, y: 0.28 }, { x: 0.35, y: 0.32 }, { x: 0.5, y: 0.49 }, { x: 0.68, y: 0.63 }, { x: 0.8, y: 0.75 }]} xLabel="Observed" yLabel="Predicted" />
        <Calibration title="Calibration" description="Predicted values compared with observations." points={[{ predicted: 0.2, observed: 0.24 }, { predicted: 0.4, observed: 0.38 }, { predicted: 0.6, observed: 0.62 }, { predicted: 0.8, observed: 0.76 }]} />
      </div>
    </section>
  )
}

export default function KitGallery() {
  return (
    <main className={styles.gallery}>
      <header className={styles.galleryHeader}><p>Development preview · ?v=__kit</p><h1>Application v2 kit gallery</h1></header>
      {(['light', 'dark'] as const).map(theme => (
        <section className={styles.themePanel} data-theme={theme} key={theme}>
          <h2>{theme} theme</h2>
          <ComponentGallery />
          <ChartGallery />
        </section>
      ))}
    </main>
  )
}
