import { useMemo, useState, type ReactNode } from 'react'
import styles from './Interactive.module.css'

export type DataColumn<Row> = {
  key: keyof Row & string
  header: string
  align?: 'left' | 'center' | 'right'
  render?: (row: Row) => ReactNode
  sortable?: boolean
}

type DataTableProps<Row extends object> = {
  columns: DataColumn<Row>[]
  rows: Row[]
  stickyFirst?: boolean
  caption: string
  /**
   * Per-row DOM attributes, keyed by the row object identity.
   *
   * Verification scripts and tests need to address a specific row (`data-construct`,
   * `data-verdict`) without depending on its position, which changes the moment a column
   * becomes sortable. Passing attributes in keeps the table a presentational component: it
   * does not need to know that "construct" is a concept.
   */
  rowAttributes?: (row: Row) => Record<string, string | undefined>
}

type SortDirection = 'ascending' | 'descending'

function compareValues(first: unknown, second: unknown): number {
  if (typeof first === 'number' && typeof second === 'number') return first - second
  return String(first ?? '').localeCompare(String(second ?? ''), 'en', { numeric: true })
}

export function DataTable<Row extends object>({ columns, rows, stickyFirst = false, caption, rowAttributes }: DataTableProps<Row>) {
  const [sortKey, setSortKey] = useState<keyof Row & string | null>(null)
  const [direction, setDirection] = useState<SortDirection>('ascending')
  const sortedRows = useMemo(() => {
    if (!sortKey) return rows
    const sign = direction === 'ascending' ? 1 : -1
    return [...rows].sort((first, second) => sign * compareValues(first[sortKey], second[sortKey]))
  }, [direction, rows, sortKey])

  function sortBy(key: keyof Row & string) {
    if (key === sortKey) setDirection(direction === 'ascending' ? 'descending' : 'ascending')
    else {
      setSortKey(key)
      setDirection('ascending')
    }
  }

  return (
    <div className={styles.tableScroll}>
      <table className={stickyFirst ? styles.stickyTable : undefined}>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column, index) => {
              const active = sortKey === column.key
              return (
                <th aria-sort={active ? direction : 'none'} className={index === 0 && stickyFirst ? styles.stickyFirst : undefined} key={column.key} scope="col">
                  {column.sortable
                    ? <button onClick={() => sortBy(column.key)} type="button">{column.header}</button>
                    : column.header}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, rowIndex) => (
            <tr key={String(rowIndex)} {...(rowAttributes?.(row) ?? {})}>
              {columns.map((column, index) => (
                <td className={[column.align ? styles[column.align] : '', index === 0 && stickyFirst ? styles.stickyFirst : ''].filter(Boolean).join(' ')} key={column.key}>
                  {column.render ? column.render(row) : String(row[column.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
