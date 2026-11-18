/**
 * A JSON tree a reader can walk without leaving the page.
 *
 * Artifacts are the evidence, so the Evidence section has to show one, not summarise it.
 * Two constraints shape this component:
 *
 *   - **Bounded.** `cv_kfold.json` is 1.8 MB. Rendering it whole would lock the main
 *     thread and tell the reader nothing, so the tree stops after `MAX_NODES` entries and
 *     says how many it withheld. A truncated view that announces its truncation is
 *     honest; one that silently stops is not.
 *   - **Navigable.** Arrays and objects collapse, and everything collapsed below the
 *     first level stays collapsed until asked. A reader hunting one coefficient should
 *     not scroll through 2,400 sibling keys.
 */
import { useMemo, useState } from 'react'
import styles from './Reproduce.module.css'

/**
 * How many entries the tree renders before it stops.
 *
 * `cv_kfold.json` holds 105,771 scalar entries. A 2,000-entry cap showed the object's first
 * two keys and withheld 98% of it, which reads as a broken viewer rather than a bounded one.
 * The cap is now large enough to walk a whole fold series, and the withheld count is
 * printed either way — the number is what makes the truncation legible.
 */
export const MAX_NODES = 12000

type JsonValue = unknown

type RenderedNode = {
  /** Pre-order index, used as a stable key. */
  index: number
  /** Path from the root, e.g. `/folds/0/rmse`; the identity a toggle uses. */
  path: string
  depth: number
  /** Key or array index this node sits under; `null` at the root. */
  label: string | null
  value: JsonValue
  /** True when the node has children worth recursing into. */
  branch: boolean
  /** True when this node was the one that hit the cap. */
  truncated: boolean
}

/** `{a:1}` rather than `[object Object]`, and short enough for a single line. */
function summarise(value: JsonValue): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `Array(${value.length})`
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, JsonValue>)
    return `{${keys.length} ${keys.length === 1 ? 'key' : 'keys'}}`
  }
  if (typeof value === 'string') {
    // Long strings (a sentence of note, a base64 blob) are cut, with the cut visible.
    return value.length > 96 ? `"${value.slice(0, 96)}…"` : `"${value}"`
  }
  return String(value)
}

/**
 * Walk the payload, descending only into branches the reader has opened.
 *
 * A collapsed subtree is not visited at all. That is what makes a 105,771-entry artifact
 * usable: the cap then applies to what is actually on screen rather than to the whole
 * document, and a reader who expands one fold series can read all of it. The earlier
 * version flattened everything and then hid most of it, so opening the file spent the
 * entire budget on keys nobody could see.
 *
 * `withheld` counts the children of the last branch that hit the cap, so the message names
 * one subtree — "this key has 300 more entries" — instead of an unexplained total.
 */
export function flattenJson(
  value: JsonValue,
  expanded: ReadonlySet<string>,
  maxNodes = MAX_NODES,
): { nodes: RenderedNode[]; withheld: number; withheldAt: string | null } {
  const nodes: RenderedNode[] = []
  let withheld = 0
  let withheldAt: string | null = null
  let index = 0

  const visit = (current: JsonValue, depth: number, label: string | null, pathKey: string) => {
    const children = childrenOf(current)
    nodes.push({
      index: index++,
      path: pathKey,
      depth,
      label,
      value: current,
      branch: children.length > 0,
      truncated: false,
    })
    if (children.length === 0 || !expanded.has(pathKey)) return
    for (const [childLabel, child] of children) {
      if (nodes.length >= maxNodes) {
        withheld += countLeaves(child)
        withheldAt = withheldAt ?? pathKey
        continue
      }
      visit(child, depth + 1, childLabel, `${pathKey}/${childLabel}`)
    }
  }

  visit(value, 0, null, '')
  return { nodes, withheld, withheldAt }
}

function childrenOf(value: JsonValue): Array<[string, JsonValue]> {
  if (Array.isArray(value)) return value.map((entry, i) => [String(i), entry] as [string, JsonValue])
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, JsonValue>)
  }
  return []
}

function countLeaves(value: JsonValue): number {
  const children = childrenOf(value)
  if (children.length === 0) return 1
  return children.reduce((total, [, child]) => total + countLeaves(child), 0)
}

export function JsonTree({ data, label }: { data: JsonValue; label: string }) {
  // Expanded is opt-in: a 105,771-entry file must not try to draw itself on open. The
  // root's immediate children are visible, one level deep, so the artifact's shape is
  // legible before anything is clicked.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']))

  const { nodes, withheld, withheldAt } = useMemo(
    () => flattenJson(data, expanded),
    [data, expanded],
  )

  const toggle = (pathKey: string) => {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(pathKey)) next.delete(pathKey)
      else next.add(pathKey)
      return next
    })
  }

  return (
    <div className={styles.jsonTree}>
      <p className={styles.jsonMeta}>
        {nodes.length.toLocaleString('en-US')} entries shown
        {withheld > 0
          ? `; ${withheld.toLocaleString('en-US')} more under ${withheldAt === '' ? 'the root' : withheldAt} exceed the ${MAX_NODES.toLocaleString('en-US')}-entry view. Collapse a branch to see its siblings.`
          : ''}
      </p>
      <ul aria-label={label} className={styles.jsonList} role="tree">
        {nodes.map((node) => {
          const path = node.path
          const isOpen = expanded.has(path)
          return (
            <li
              className={styles.jsonRow}
              key={node.index}
              role="treeitem"
              style={{ paddingLeft: `${node.depth * 1.1}rem` }}
            >
              {node.branch ? (
                <>
                  <button
                    aria-expanded={isOpen}
                    className={styles.jsonToggle}
                    onClick={() => toggle(path)}
                    type="button"
                  >
                    <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                    {node.label ?? 'value'}
                  </button>
                  <span className={styles.jsonValue}>{summarise(node.value)}</span>
                </>
              ) : (
                <span className={styles.jsonLeaf}>
                  <span className={styles.jsonKey}>{node.label ?? 'value'}</span>
                  <span className={styles.jsonValue}>{summarise(node.value)}</span>
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
