import type { HTMLAttributes } from 'react'
import styles from './Skeleton.module.css'

export function Skeleton({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={[styles.skeleton, className].filter(Boolean).join(' ')} role="status" />
}
