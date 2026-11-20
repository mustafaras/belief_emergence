export type SeriesDefinition = { key: string; label: string; color: string }
export type TableCell = string | number | null
export type AccessibleTable = { columns: string[]; rows: TableCell[][] }
export type Point = { x: number; y: number }

export function requireTokenColor(color: string): string {
  if (!/^var\(--[a-z0-9-]+\)$/.test(color)) {
    throw new Error(`Chart colors must reference a CSS variable: ${color}`)
  }
  return color
}
