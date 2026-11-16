import type { HTMLAttributes } from 'react'
import styles from './ErrorState.module.css'

type ErrorStateProps = HTMLAttributes<HTMLDivElement> & {
  artifact: string
  message: string
}

export function ErrorState({ artifact, message, className = '', ...props }: ErrorStateProps) {
  return (
    <div {...props} className={[styles.error, className].filter(Boolean).join(' ')} role="alert">
      <p className={styles.summary}>
        Could not read {artifact}. This is a build defect, not missing data.
      </p>
      <p className={styles.message}>{message}</p>
    </div>
  )
}
