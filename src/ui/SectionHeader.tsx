import styles from './SectionHeader.module.css'

type SectionHeaderProps = {
  eyebrow: string
  title: string
  lede: string
  subtitle?: string
}

export function SectionHeader({ eyebrow, title, lede, subtitle }: SectionHeaderProps) {
  return (
    <header className={styles.header}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1 className={styles.title}>{title}</h1>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      <p className={styles.lede}>{lede}</p>
    </header>
  )
}
