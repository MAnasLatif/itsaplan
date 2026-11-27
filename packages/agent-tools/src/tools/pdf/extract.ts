import { extractText, getDocumentProxy, getMeta } from 'unpdf';

export interface PdfText {
  title: string | null;
  pageCount: number;
  /** Empty when the PDF has no text layer (a scan or a set of images). */
  text: string;
}

// unpdf runs the serverless build of pdf.js, which needs no native binary, so the same
// code runs on Bun and on Cloudflare Workers.
export async function extractPdfText(bytes: Uint8Array): Promise<PdfText> {
  // pdf.js detaches the buffer it is given; the copy keeps the caller's bytes usable.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const [{ totalPages, text }, { info }] = await Promise.all([extractText(pdf), getMeta(pdf)]);
  return {
    title: typeof info.Title === 'string' && info.Title !== '' ? info.Title : null,
    pageCount: totalPages,
    text: text
      .map((page) => page.trim())
      .filter(Boolean)
      .join('\n\n'),
  };
}
