import { useCallback, useRef, useState, type ReactNode } from 'react'
import { useFocusTrap } from './useFocusTrap'
import styles from './Interactive.module.css'

type DrawerProps = {
  trigger: ReactNode
  title: string
  children: ReactNode
  /**
   * Controlled open state.
   *
   * Optional so existing callers keep the internal state they were written against. The
   * Countries table needs it because the open row is part of the URL: `?iso=EST` has to
   * reopen the drawer, or a shared link lands on a table instead of the country it names.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Drawer({ trigger, title, children, open: openProp, onOpenChange }: DrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const open = openProp ?? internalOpen
  const setOpen = (next: boolean) => {
    setInternalOpen(next)
    onOpenChange?.(next)
  }
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setInternalOpen(false)
    onOpenChange?.(false)
  }, [onOpenChange])
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
