import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The module keeps two caches at module scope — successful fetches and known-unavailable
 * URLs — so each case has to start from a fresh module or the first test's success leaks
 * into the next one's failure path. `vi.resetModules()` plus a dynamic import is the only
 * way to get that without exporting a test-only reset.
 */
let registerPdfFonts: typeof import('../src/utils/pdfFonts').registerPdfFonts

beforeEach(async () => {
  vi.resetModules()
  ;({ registerPdfFonts } = await import('../src/utils/pdfFonts'))
})

/**
 * The PDF font fallback.
 *
 * `public/fonts/` is not committed, so on a clean checkout every export attempt fetches
 * four files that are not there. The loader must notice and fall back to jsPDF's built-in
 * fonts rather than rejecting — a rejected promise makes `exportToPDF` throw and the button
 * do nothing at all, which is worse than a report with some missing glyphs.
 *
 * The subtlety this pins: an SPA dev server answers a missing path with `index.html` and a
 * **200**, so `res.ok` is not evidence that the response is a font. The loader checks the
 * magic number, and these cases cover both the 404 path and the 200-HTML path.
 */

/** A jsPDF stand-in that records what was registered. */
function fakePdf() {
  const calls: string[] = []
  return {
    calls,
    addFileToVFS: (name: string) => calls.push(`vfs:${name}`),
    addFont: (name: string, family: string) => calls.push(`font:${family}`),
    setFont: (family: string) => calls.push(`set:${family}`),
  }
}

const TRUETYPE_HEADER = new Uint8Array([0x00, 0x01, 0x00, 0x00, 0x00, 0x00])

function response(
  body: Uint8Array | string,
  init: { ok?: boolean; status?: number; type?: string } = {},
) {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: () => init.type ?? 'font/ttf' },
    arrayBuffer: async () => bytes.buffer,
  } as unknown as Response
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('registerPdfFonts', () => {
  it('embeds the vendored fonts when they are present', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(TRUETYPE_HEADER)))
    const pdf = fakePdf()

    const names = await registerPdfFonts(pdf as never)

    expect(names).toEqual({ serif: 'Serif', mono: 'Mono' })
    expect(pdf.calls).toContain('font:Serif')
    expect(pdf.calls).toContain('font:Mono')
    expect(pdf.calls).toContain('set:Serif')
  })

  it('falls back to built-in fonts when the files are absent', async () => {
    // The real condition on a clean checkout: four 404s.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response('', { ok: false, status: 404 })),
    )
    const pdf = fakePdf()

    const names = await registerPdfFonts(pdf as never)

    expect(names).toEqual({ serif: 'times', mono: 'courier' })
    expect(pdf.calls).toContain('set:times')
    // Nothing was embedded, so no VFS writes should have happened.
    expect(pdf.calls.filter((c) => c.startsWith('vfs:'))).toEqual([])
  })

  it('falls back when the server answers 200 with HTML instead of a font', async () => {
    // This is the failure that produced "Cannot read properties of undefined (reading
    // 'widths')" from inside jsPDF: the fetch succeeded, so the loader handed HTML to the
    // TTF parser.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response('<!doctype html><html></html>', { type: 'text/html' })),
    )
    const pdf = fakePdf()

    const names = await registerPdfFonts(pdf as never)

    expect(names).toEqual({ serif: 'times', mono: 'courier' })
    expect(pdf.calls).toContain('set:times')
  })

  it('does not reject, because a rejection makes the export button do nothing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )
    const pdf = fakePdf()

    await expect(registerPdfFonts(pdf as never)).resolves.toEqual({
      serif: 'times',
      mono: 'courier',
    })
  })

  it('does not re-request fonts already known to be unavailable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => response('', { ok: false, status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    await registerPdfFonts(fakePdf() as never)
    const afterFirst = fetchMock.mock.calls.length
    await registerPdfFonts(fakePdf() as never)

    // Four fonts on the first attempt; none on the second, because the unavailable set
    // short-circuits before the network.
    expect(afterFirst).toBe(4)
    expect(fetchMock.mock.calls.length).toBe(4)
  })
})
