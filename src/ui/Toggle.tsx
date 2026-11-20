import styles from './Interactive.module.css'

type ToggleProps = { checked: boolean; label: string; onChange: (checked: boolean) => void }

export function Toggle({ checked, label, onChange }: ToggleProps) {
  return (
    <button
      aria-checked={checked}
      className={styles.toggle}
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span aria-hidden="true" className={checked ? styles.toggleOn : styles.toggleOff} />
      <span>{label}</span>
    </button>
  )
}
