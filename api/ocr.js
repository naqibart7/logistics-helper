/**
 * Vercel serverless function — OCR fallback for the frontend.
 *
 * The browser posts a PDF to `/api/ocr` when pdfjs detects a scanned document
 * (little embedded text). On the local dev server this route is proxied to the
 * Express OCR service (`server/index.js`); on Vercel it is served by this
 * function, which performs server-side pdfjs text extraction.
 *
 * When a GPU `UNLIMITED_OCR_URL` proxy is desired on Vercel, point
 * `VITE_OCR_API_URL` at the deployed proxy instead (see UPGRADE.md).
 */
import busboy from 'busboy';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

function cleanExtractedText(text) {
  return String(text || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function groupItemsByLine(items) {
  const sorted = [...items].sort((a, b) => {
    const yDiff = Math.abs(a.y - b.y);
    if (yDiff < 5) return a.x - b.x;
    return b.y - a.y;
  });

  const lines = [];
  let currentLine = [];
  let currentY = null;

  for (const item of sorted) {
    if (currentY === null || Math.abs(item.y - currentY) < 5) {
      currentLine.push(item);
      currentY = item.y;
      continue;
    }
    lines.push(currentLine.sort((a, b) => a.x - b.x));
    currentLine = [item];
    currentY = item.y;
  }
  if (currentLine.length > 0) lines.push(currentLine.sort((a, b) => a.x - b.x));
  return lines;
}

async function extractPdfTextFallback(buffer) {
  const data = Uint8Array.from(buffer); // pdfjs rejects Buffer
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.map((item) => ({
      str: item.str || '',
      x: item.transform ? item.transform[4] : 0,
      y: item.transform ? item.transform[5] : 0,
      width: item.width || 0,
    }));

    const lineTexts = groupItemsByLine(items).map((line) => {
      let lineText = '';
      let lastX = 0;
      for (const item of line) {
        const gap = item.x - lastX;
        if (lastX > 0) {
          if (gap > 40) lineText += '          ';
          else if (gap > 10) lineText += '    ';
          else if (gap > 2) lineText += ' ';
        }
        lineText += item.str;
        lastX = item.x + item.width;
      }
      return lineText.trimEnd();
    });

    pages.push(lineTexts.join('\n'));
  }

  return {
    text: cleanExtractedText(pages.join('\n--- PAGE BREAK ---\n')),
    pages: pdf.numPages,
    method: 'fallback',
  };
}

/** Parse a multipart body, returning the first file as a Buffer. */
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    let buffer = null;
    let filename = null;
    const bb = busboy({ headers: req.headers });

    bb.on('file', (_field, file, info) => {
      const chunks = [];
      file.on('data', (chunk) => chunks.push(chunk));
      file.on('end', () => {
        buffer = Buffer.concat(chunks);
        filename = info.filename;
      });
    });
    bb.on('close', () => resolve({ buffer, filename }));
    bb.on('error', reject);

    req.pipe(bb);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { buffer, filename } = await parseMultipart(req);
    if (!buffer) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const name = (filename || '').toLowerCase();
    if (!name.endsWith('.pdf')) {
      return res.json({ text: '', pages: 1, method: 'fallback' });
    }

    const result = await extractPdfTextFallback(buffer);
    return res.json(result);
  } catch (error) {
    console.error('Vercel OCR error:', error);
    return res.status(500).json({
      error: 'Failed to process OCR request.',
      details: error.message,
    });
  }
}
