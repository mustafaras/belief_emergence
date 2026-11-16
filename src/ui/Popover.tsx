import { useCallback, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useFocusTrap } from './useFocusTrap'
import styles from './Interactive.module.css'

type PopoverProps = {
  trigger?: ReactNode
  label: string
  children: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  hideTrigger?: boolean
  returnFocusRef?: RefObject<HTMLElement | SVGElement | null>
}

export function Popover({ trigger, label, children, open, onOpenChange, hideTrigger = false, returnFocusRef }: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const isControlled = open !== undefined
  const isOpen = open ?? internalOpen
  const changeOpen = useCallback((next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }, [isControlled, onOpenChange])
  const close = useCallback(() => changeOpen(false), [changeOpen])
  useFocusTrap(isOpen, dialogRef, returnFocusRef ?? triggerRef, close)

  return (
    <div className={styles.layer}>
      {!hideTrigger && <button aria-expanded={isOpen} aria-haspopup="dialog" onClick={() => changeOpen(!isOpen)} ref={triggerRef} type="button">{trigger}</button>}
      {isOpen && (
        <div aria-label={label} aria-modal="true" className={styles.popover} ref={dialogRef} role="dialog" tabIndex={-1}>
          <button aria-label="Close popover" onClick={close} type="button">Close</button>
          {children}
        </div>
      )}
    </div>
  )
}
