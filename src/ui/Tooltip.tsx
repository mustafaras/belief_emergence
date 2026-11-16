import { useId, useState, type ReactNode } from 'react'
import styles from './Interactive.module.css'

type TooltipProps = { content: string; children: ReactNode }

export function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <span
      aria-describedby={open ? id : undefined}
      className={styles.tooltipTrigger}
      onBlur={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      tabIndex={0}
    >
      {children}
      {open && <span className={styles.tooltip} id={id} role="tooltip">{content}</span>}
    </span>
  )
}
