import type { KeyboardEvent } from 'react'
import styles from './Interactive.module.css'

export type SegmentOption<Value extends string> = { value: Value; label: string }

type SegmentedControlProps<Value extends string> = {
  label: string
  options: SegmentOption<Value>[]
  value: Value
  onChange: (value: Value) => void
}

export function SegmentedControl<Value extends string>({ label, options, value, onChange }: SegmentedControlProps<Value>) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const direction = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!direction) return
    event.preventDefault()
    const current = options.findIndex(option => option.value === value)
    const next = (current + direction + options.length) % options.length
    onChange(options[next].value)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
  }

  return (
    <div aria-label={label} className={styles.segmented} role="radiogroup">
      {options.map(option => (
        <button
          aria-checked={option.value === value}
          key={option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={handleKeyDown}
          role="radio"
          tabIndex={option.value === value ? 0 : -1}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
