import { resolvePublicPath } from './publicPath';

type JsPdfFontHost = {
  addFileToVFS: (fileName: string, base64: string) => void;
  addFont: (postScriptName: string, fontName: string, fontStyle: string) => void;
  setFont: (fontName: string, fontStyle?: string) => void;
};

const fontCache = new Map<string, string>();

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function fetchFontBase64(url: string): Promise<string> {
  const cached = fontCache.get(url);
  if (cached) return cached;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch font: ${url} (${res.status})`);
  }
  // A single-page-app dev/build server answers an unknown path with index.html and a
  // 200, so `res.ok` is not evidence that this is a font. jsPDF then fails deep inside
  // its TTF parser ("No unicode cmap for font") with an unrelated message, so the real
  // cause — the file is absent — never reaches the console. Check the magic number.
  const buf = await res.arrayBuffer();
  const signature = new Uint8Array(buf.slice(0, 4));
  const isTrueType =
    (signature[0] === 0x00 && signature[1] === 0x01 && signature[2] === 0x00 && signature[3] === 0x00) ||
    (signature[0] === 0x74 && signature[1] === 0x72 && signature[2] === 0x75 && signature[3] === 0x65) || // 'true'
    (signature[0] === 0x4f && signature[1] === 0x54 && signature[2] === 0x54 && signature[3] === 0x4f) || // 'OTTO'
    (signature[0] === 0x77 && signature[1] === 0x4f && signature[2] === 0x46 && signature[3] === 0x32); // 'wOF2'
  if (!isTrueType) {
    throw new Error(`Not a TrueType/OpenType font: ${url} (server returned ${res.headers.get('content-type') ?? 'unknown type'})`);
  }

  const b64 = arrayBufferToBase64(buf);
  fontCache.set(url, b64);
  return b64;
}

export type PdfFontNames = {
  serif: string;
  mono: string;
};

/**
 * jsPDF's built-in PostScript fonts. Used when the vendored TTFs are unavailable.
 *
 * These are Latin-1 only, so Greek glyphs (Φ, α, β) degrade in the exported PDF.
 * That is the honest trade-off: `public/fonts/*.ttf` is not committed to this
 * repository, and without a fallback `registerPdfFonts` rejects, `exportToPDF` throws,
 * and the Export PDF button does nothing at all — a silent dead control, which is worse
 * than a report with some missing symbols.
 */
const STANDARD_PDF_FONTS: PdfFontNames = { serif: 'times', mono: 'courier' };

export async function registerPdfFonts(pdf: JsPdfFontHost): Promise<PdfFontNames> {
  // NOTE: Fonts are served from Vite's public/ folder, which lives under `base`, so
  // these must be resolved rather than hard-coded as absolute paths.
  // We embed them into jsPDF's VFS so Unicode glyphs (Φ, ε, ∈, α, β, en-dash) render
  // correctly and text measurement (getTextWidth) matches the rendered glyphs.
  const serifRegularUrl = resolvePublicPath('/fonts/STIXTwoText-Regular.ttf');
  const serifBoldUrl = resolvePublicPath('/fonts/STIXTwoText-Bold.ttf');
  const serifItalicUrl = resolvePublicPath('/fonts/STIXTwoText-Italic.ttf');
  const monoRegularUrl = resolvePublicPath('/fonts/JetBrainsMono-Regular.ttf');

  try {
    const [serifRegular, serifBold, serifItalic, monoRegular] = await Promise.all([
      fetchFontBase64(serifRegularUrl),
      fetchFontBase64(serifBoldUrl),
      fetchFontBase64(serifItalicUrl),
      fetchFontBase64(monoRegularUrl),
    ]);

    // jsPDF expects the first argument to addFont() to match the internal filename
    // used in addFileToVFS().
    pdf.addFileToVFS('STIXTwoText-Regular.ttf', serifRegular);
    pdf.addFileToVFS('STIXTwoText-Bold.ttf', serifBold);
    pdf.addFileToVFS('STIXTwoText-Italic.ttf', serifItalic);
    pdf.addFileToVFS('JetBrainsMono-Regular.ttf', monoRegular);

    pdf.addFont('STIXTwoText-Regular.ttf', 'Serif', 'normal');
    pdf.addFont('STIXTwoText-Bold.ttf', 'Serif', 'bold');
    pdf.addFont('STIXTwoText-Italic.ttf', 'Serif', 'italic');

    // Mono font for code blocks. (We intentionally keep code blocks unbolded for density.)
    pdf.addFont('JetBrainsMono-Regular.ttf', 'Mono', 'normal');

    // Set a deterministic default.
    pdf.setFont('Serif', 'normal');

    return { serif: 'Serif', mono: 'Mono' };
  } catch (error) {
    // Any of the four fetches failing means none of the family can be embedded, so we
    // fall back for all of them rather than mixing embedded and built-in fonts (which
    // would break the width measurement the layout depends on).
    console.warn(
      '[pdfFonts] Unicode fonts unavailable; falling back to built-in PDF fonts. ' +
        'Greek symbols will not render correctly. Place the STIX Two and JetBrains Mono ' +
        'TTFs in public/fonts/ to restore them.',
      error,
    );
    pdf.setFont(STANDARD_PDF_FONTS.serif, 'normal');
    return STANDARD_PDF_FONTS;
  }
}
