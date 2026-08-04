/**
 * Smart PDF text extraction chooses fast PDF.js parsing for text PDFs and
 * falls back to the OCR backend for scanned documents.
 */
import { convertPDFToText } from './pdfExtractor';

const OCR_ENDPOINT = import.meta.env.VITE_OCR_API_URL || '/api/ocr';

export async function extractTextSmart(file, options = {}) {
  const { onStatus } = options;

  onStatus?.('Detecting PDF type...');
  const pdfText = await convertPDFToText(file);
  const compactLength = pdfText.replace(/\s/g, '').length;
  const textDensity = compactLength / Math.max(1, file.size / 1024);

  if (textDensity > 30 && compactLength > 80) {
    return {
      text: pdfText,
      method: 'pdfjs',
      pages: Math.max(1, (pdfText.match(/--- PAGE BREAK ---/g) || []).length),
      textDensity,
    };
  }

  onStatus?.('Running Unlimited-OCR (this may take 10-40s)...');
  const form = new FormData();
  form.append('file', file);

  const response = await fetch(OCR_ENDPOINT, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'OCR request failed.');
  }

  const data = await response.json();
  return {
    text: data.text || '',
    method: data.method || 'fallback',
    pages: Number(data.pages || 1),
    textDensity,
  };
}
