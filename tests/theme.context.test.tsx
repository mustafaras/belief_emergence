// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from '../src/contexts/ThemeContext'
import { useTheme } from '../src/contexts/useTheme'

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme()
  return <button onClick={toggleTheme} type="button">{theme}</button>
}

describe('theme context', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, String(value)),
      clear: () => values.clear()
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    delete document.documentElement.dataset.theme
  })

  it('toggles the root theme and persists the selected value', async () => {
    localStorage.clear()
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    fireEvent.click(screen.getByRole('button'))

    expect(screen.getByRole('button').textContent).toBe('dark')
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    expect(localStorage.getItem('app-v2-theme')).toBe('dark')
  })

  it('restores a saved theme', () => {
    localStorage.setItem('app-v2-theme', 'dark')
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)
    expect(screen.getByRole('button').textContent).toBe('dark')
  })
})
