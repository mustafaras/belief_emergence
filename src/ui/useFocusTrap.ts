import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useFocusTrap(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  returnTarget: RefObject<HTMLElement | SVGElement | null>,
  onClose: () => void
) {
  useEffect(() => {
    if (!open || !container.current) return
    const dialog = container.current
    const returnFocus = returnTarget.current
      ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
    focusable()[0]?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) {
        event.preventDefault()
        dialog.focus()
      } else if (event.shiftKey && document.activeElement === elements[0]) {
        event.preventDefault()
        elements[elements.length - 1].focus()
      } else if (!event.shiftKey && document.activeElement === elements[elements.length - 1]) {
        event.preventDefault()
        elements[0].focus()
      }
    }

    dialog.addEventListener('keydown', handleKeyDown)
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      returnFocus?.focus()
    }
  }, [container, onClose, open, returnTarget])
}
