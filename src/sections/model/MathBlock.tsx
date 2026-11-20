import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import styles from './MathBlock.module.css'

/**
 * Serverless KaTeX.
 *
 * `katex.renderToString` runs in the bundle, so there is no math server, no network round
 * trip, and no flash of unrendered TeX. `throwOnError: false` is deliberate: a malformed
 * expression renders in red rather than taking the whole section down, and a reader who sees
 * red knows the formula is broken instead of assuming it is an image.
 *
 * The output is KaTeX-generated HTML, not user input, so `dangerouslySetInnerHTML` is the
 * intended interface. Nothing here is ever sourced from an artifact string that could carry
 * markup — every formula in this section is a literal in the source.
 */
export function MathBlock({ tex, display = false, label }: { tex: string; display?: boolean; label?: string }) {
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    strict: false,
    trust: false,
    output: 'html',
  })

  // Inline math must be a <span>: it is used inside <p>, and a <div> there is invalid HTML
  // that React reports as a hydration error. Display math stays a block.
  const Element = display ? 'div' : 'span'

  /*
   * Whether this formula is wider than its column, measured rather than assumed.
   *
   * A wide display formula scrolls, and every mobile browser hides the scrollbar until touched,
   * so it looks truncated. A fade is the cue — but only where there is something to reach:
   * applied unconditionally it dims the right edge of formulas that end exactly at the column,
   * which reads as a rendering fault. The flag is set from the element's own `scrollWidth`,
   * and re-measured on resize because a phone rotation changes the answer.
   */
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!display) return
    const host = ref.current
    if (!host) return
    const inner = host.querySelector('.katex-display')
    if (!(inner instanceof HTMLElement)) return

    const measure = () => {
      inner.dataset.overflows = String(inner.scrollWidth > inner.clientWidth + 2)
    }
    measure()
    // KaTeX's layout depends on its web fonts. Measuring before they load gives the fallback
    // metrics, so the first formula on the page reported "fits" while overflowing by 52px once
    // the fonts arrived — the fade was absent on exactly the formula that needed it.
    let cancelled = false
    void document.fonts?.ready.then(() => { if (!cancelled) measure() })

    // `ResizeObserver` is absent in jsdom, and it is an enhancement rather than the mechanism:
    // the initial measurement above is what sets the flag. Guarding it keeps the component
    // renderable in the unit tests without a polyfill in every test file.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(inner)
    return () => {
      cancelled = true
      observer?.disconnect()
    }
  }, [display, html])

  return (
    <Element
      aria-label={label}
      className={display ? styles.display : styles.inline}
      // The ref is only meaningful on the block form; inline math has nothing to scroll.
      ref={display ? (ref as React.Ref<HTMLDivElement>) : undefined}
      role={label === undefined ? undefined : 'math'}
      // KaTeX output from a local literal; no artifact string reaches this sink.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
