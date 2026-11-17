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
  return (
    <Element
      aria-label={label}
      className={display ? styles.display : styles.inline}
      role={label === undefined ? undefined : 'math'}
      // KaTeX output from a local literal; no artifact string reaches this sink.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
