import { useState, type KeyboardEvent, type ReactNode } from 'react'
import styles from './Interactive.module.css'

export type TabItem = { id: string; label: string; content: ReactNode }

type TabsProps = {
  label: string
  tabs: TabItem[]
  /**
   * Controlled selection. Optional so existing callers keep the internal state they were
   * written against; a section that mirrors the tab into the query string passes both.
   */
  activeId?: string
  onActiveChange?: (id: string) => void
}

export function Tabs({ label, tabs, activeId, onActiveChange }: TabsProps) {
  const [internal, setInternal] = useState(tabs[0]?.id ?? '')
  const active = activeId ?? internal
  const setActive = (id: string) => {
    setInternal(id)
    onActiveChange?.(id)
  }

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
