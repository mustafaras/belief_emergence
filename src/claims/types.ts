export type ClaimFormat = 'int' | 'r2' | 'p4' | 'p3' | 'p2' | 'pct1' | 'exact' | 'signed2' | 'signed3' | 'p6' | 'year'

export type PaperRef = {
  section: string
  line?: number
  texValue?: string
}

export type Claim = {
  id: string
  label: string
  value: number
  format: ClaimFormat
  artifact: string
  path: string
  generator?: string
  paperRef?: PaperRef
  note?: string
}
