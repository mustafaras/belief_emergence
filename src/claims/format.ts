import type { ClaimFormat } from './types'

const fixed = (value: number, digits: number): string => value.toFixed(digits)

export function formatClaim(value: number, format: ClaimFormat): string {
  switch (format) {
    case 'int':
      return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
    case 'r2':
    case 'p4':
      return fixed(value, 4)
    case 'p3':
      return fixed(value, 3)
    case 'p2':
      return fixed(value, 2)
    case 'pct1':
      return `${fixed(value * 100, 1)}%`
    case 'exact':
      return String(value)
    case 'signed2':
      return value < 0 ? `−${fixed(Math.abs(value), 2)}` : `+${fixed(value, 2)}`
  }
}
