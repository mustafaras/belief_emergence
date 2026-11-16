import type { HTMLAttributes } from 'react'
import styles from './Callout.module.css'

type CalloutProps = HTMLAttributes<HTMLElement> & {
  variant?: 'info' | 'caution' | 'finding'
}

export function Callout({ variant = 'info', className = '', ...props }: CalloutProps) {
  return (
    <aside
      {...props}
      role="note"
      className={[styles.callout, styles[variant], className].filter(Boolean).join(' ')}
    />
  )
}
