import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useFocusTrap } from './useFocusTrap'
import styles from './Interactive.module.css'

type DrawerProps = { trigger: ReactNode; title: string; children: ReactNode }

export function Drawer({ trigger, title, children }: DrawerProps) {
  const [open, setOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useFocusTrap(open, dialogRef, triggerRef, close)

  return (
    <div className={styles.layer}>
      <button aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(true)} ref={triggerRef} type="button">{trigger}</button>
      {open && (
        <div className={styles.drawerBackdrop}>
          <div aria-label={title} aria-modal="true" className={styles.drawer} ref={dialogRef} role="dialog" tabIndex={-1}>
            <div className={styles.drawerHeader}>
              <h2>{title}</h2>
              <button aria-label="Close drawer" onClick={close} type="button">Close</button>
            </div>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
