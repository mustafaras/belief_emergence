import type { HTMLAttributes } from 'react'
import styles from './Kbd.module.css'

export function Kbd({ className = '', ...props }: HTMLAttributes<HTMLElement>) {
  return <kbd {...props} className={[styles.kbd, className].filter(Boolean).join(' ')} />
}
