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
  const buf = await res.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  fontCache.set(url, b64);
  return b64;
}

export type PdfFontNames = {
  serif: string;
  mono: string;
};

export async function registerPdfFonts(pdf: JsPdfFontHost): Promise<PdfFontNames> {
  // NOTE: Fonts are served from Vite's public/ folder.
  // We embed them into jsPDF's VFS so Unicode glyphs (Φ, ε, ∈, α, β, en-dash) render
  // correctly and text measurement (getTextWidth) matches the rendered glyphs.
  const serifRegularUrl = '/fonts/STIXTwoText-Regular.ttf';
  const serifBoldUrl = '/fonts/STIXTwoText-Bold.ttf';
  const serifItalicUrl = '/fonts/STIXTwoText-Italic.ttf';
  const monoRegularUrl = '/fonts/JetBrainsMono-Regular.ttf';

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
}
