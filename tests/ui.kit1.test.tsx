// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  Badge,
  Button,
  Callout,
  Card,
  ErrorState,
  IconButton,
  Kbd,
  SectionHeader,
  Skeleton
} from '../src/ui'

describe('UI kit part one', () => {
  it('renders every component with its accessible content', () => {
    render(
      <>
        <Button>Continue</Button>
        <IconButton aria-label="Close"><span aria-hidden="true">×</span></IconButton>
        <Badge variant="pass">Verified</Badge>
        <Card>Evidence card</Card>
        <Callout variant="finding">Measured finding</Callout>
        <SectionHeader eyebrow="Evidence" title="The result" lede="A bounded claim." />
        <Kbd>⌘K</Kbd>
        <Skeleton aria-label="Loading results" />
        <ErrorState artifact="metrics.json" message="The file is malformed." />
      </>
    )

    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
    expect(screen.getByRole('status', { name: 'Verified' })).toBeTruthy()
    expect(screen.getByText('Evidence card')).toBeTruthy()
    expect(screen.getByText('Measured finding')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'The result' })).toBeTruthy()
    expect(screen.getByText('⌘K')).toBeTruthy()
    expect(screen.getByLabelText('Loading results')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain(
      'Could not read metrics.json. This is a build defect, not missing data.'
    )
  })

  it('does not activate a disabled button', () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>Unavailable</Button>)
    const button = screen.getByRole('button', { name: 'Unavailable' })
    expect(button).toHaveProperty('disabled', true)
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })
})
