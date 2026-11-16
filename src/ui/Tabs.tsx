import { useState, type KeyboardEvent, type ReactNode } from 'react'
import styles from './Interactive.module.css'

export type TabItem = { id: string; label: string; content: ReactNode }

type TabsProps = { label: string; tabs: TabItem[] }

export function Tabs({ label, tabs }: TabsProps) {
  const [active, setActive] = useState(tabs[0]?.id ?? '')

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const current = tabs.findIndex(tab => tab.id === active)
    const target = event.key === 'ArrowRight' ? (current + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (current - 1 + tabs.length) % tabs.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1
    if (target < 0) return
    event.preventDefault()
    setActive(tabs[target].id)
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus()
  }

  return (
    <div className={styles.tabs}>
      <div aria-label={label} className={styles.tabList} role="tablist">
        {tabs.map(tab => (
          <button
            aria-controls={`${tab.id}-panel`}
            aria-selected={tab.id === active}
            id={`${tab.id}-tab`}
            key={tab.id}
            onClick={() => setActive(tab.id)}
            onKeyDown={handleKeyDown}
            role="tab"
            tabIndex={tab.id === active ? 0 : -1}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map(tab => (
        <section aria-labelledby={`${tab.id}-tab`} hidden={tab.id !== active} id={`${tab.id}-panel`} key={tab.id} role="tabpanel">
          {tab.content}
        </section>
      ))}
    </div>
  )
}
