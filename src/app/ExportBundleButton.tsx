import { useCallback, useState } from 'react'
import { FileDown } from 'lucide-react'
import styles from './ExportBundleButton.module.css'

/**
 * The header's "Export evidence bundle" control.
 *
 * jsPDF is 380 KiB minified and no other part of the application needs it, so the export
 * path — and the claim registry walk it performs — is imported on click rather than on load.
 * The bundle budget measures this: an eager import would push the landing route over.
 *
 * The button reports what it is doing. A download that fails silently is indistinguishable
 * from one that never started, and the failure mode here is a browser blocking a download or
 * the PDF rejecting a character, both of which a reader should be told about.
 */
const loadBundle = () => import('../export/evidenceBundle')

export function ExportBundleButton() {
  const [state, setState] = useState<'idle' | 'working' | 'error'>('idle')

  const onClick = useCallback(async () => {
    setState('working')
    try {
      const { buildEvidenceBundle, evidenceBundleFilename } = await loadBundle()
      const doc = buildEvidenceBundle({
        url: window.location.href,
        commit: import.meta.env.VITE_COMMIT,
      })
      doc.save(evidenceBundleFilename())
      setState('idle')
    } catch (error) {
      // The message is surfaced in the title attribute so a blocked download is diagnosable
      // without opening a console.
      setState('error')
      console.error('Evidence bundle export failed', error)
    }
  }, [])

  if (state === 'error') {
    return (
      <button
        className={styles.button}
        onClick={() => void onClick()}
        title="The bundle could not be generated. Click to retry; the console has the reason."
        type="button"
      >
        <FileDown aria-hidden="true" size={16} />
        <span>Export failed — retry</span>
      </button>
    )
  }

  return (
    <button
      aria-busy={state === 'working'}
      className={styles.button}
      disabled={state === 'working'}
      onClick={() => void onClick()}
      title="Download a PDF listing every claim on this site with its artifact and generator"
      type="button"
    >
      <FileDown aria-hidden="true" size={16} />
      <span>{state === 'working' ? 'Preparing…' : 'Export evidence bundle'}</span>
    </button>
  )
}
