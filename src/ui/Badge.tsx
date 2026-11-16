import { CheckCircle2, Circle, FlaskConical, HelpCircle, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import styles from './Badge.module.css'

const icons = {
  pass: CheckCircle2,
  withdrawn: XCircle,
  unidentified: HelpCircle,
  exploratory: FlaskConical,
  neutral: Circle
}

export type BadgeVariant = keyof typeof icons

type BadgeProps = {
  variant: BadgeVariant
  children: ReactNode
  label?: string
  className?: string
}

export function Badge({ variant, children, label, className = '' }: BadgeProps) {
  const Icon = icons[variant]
  const accessibleLabel = label ?? (typeof children === 'string' || typeof children === 'number' ? String(children) : undefined)
  return (
    <span
      aria-label={accessibleLabel}
      className={[styles.badge, styles[variant], className].filter(Boolean).join(' ')}
      role="status"
    >
      <Icon aria-hidden="true" className={styles.icon} />
      <span>{children}</span>
    </span>
  )
}
