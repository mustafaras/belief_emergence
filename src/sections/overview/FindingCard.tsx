import type { MouseEvent, ReactNode } from 'react'
import type { AppRouteId } from '../../app/routes'
import { Badge, Card, type BadgeVariant } from '../../ui'
import styles from './FindingCard.module.css'

type FindingCardProps = {
  title: string
  metric: ReactNode
  description: string
  status: BadgeVariant
  statusLabel: string
  route: AppRouteId
  routeLabel: string
  onNavigate: (route: AppRouteId) => void
}

export function FindingCard({
  title,
  metric,
  description,
  status,
  statusLabel,
  route,
  routeLabel,
  onNavigate,
}: FindingCardProps) {
  function handleNavigate(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
    event.preventDefault()
    onNavigate(route)
  }

  return (
    <Card className={styles.card}>
      <div className={styles.topline}>
        <p className={styles.kicker}>Finding</p>
        <Badge variant={status}>{statusLabel}</Badge>
      </div>
      <h2 className={styles.title}>{title}</h2>
      <div className={styles.metric}>{metric}</div>
      <p className={styles.description}>{description}</p>
      <a className={styles.link} href={`?v=${route}`} onClick={handleNavigate}>
        <span aria-hidden="true">→</span> {routeLabel}
      </a>
    </Card>
  )
}
