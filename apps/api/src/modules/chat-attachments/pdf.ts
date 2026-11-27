import { extractPdfText } from '@repo/agent-tools';
import { HttpError } from '#shared/lib';

const NO_TEXT_LAYER =
  'This PDF has no text layer (it is a scan or a set of images). ' +
  'Attach a PDF with selectable text, or a .md/.txt file instead.';

export async function pdfToText(bytes: Uint8Array): Promise<string> {
  let text;
  try {
    ({ text } = await extractPdfText(bytes));
  } catch (err) {
    const reason = err instanceof Error ? err.message : err;
    throw new HttpError(400, `The file is not a readable PDF: ${reason}`);
  }
  if (text === '') throw new HttpError(400, NO_TEXT_LAYER);
  return text;
}
