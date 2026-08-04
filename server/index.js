/**
 * OCR service entry point.
 * Proxies uploads to Unlimited-OCR when configured and falls back to
 * server-side PDF.js extraction so the frontend upload flow still returns text.
 */
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import multer from 'multer';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

dotenv.config();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 20,
  },
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const OCR_PROXY_URL = process.env.UNLIMITED_OCR_URL;
const PORT = Number(process.env.PORT || 3001);

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
    if (yDiff < 5) {
      return a.x - b.x;
    }
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

  if (currentLine.length > 0) {
    lines.push(currentLine.sort((a, b) => a.x - b.x));
  }

  return lines;
}

async function extractPdfTextFallback(buffer) {
  // Node's Buffer is a Uint8Array subclass, but pdfjs-dist rejects it.
  const data = Uint8Array.from(buffer);
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
          if (gap > 40) {
            lineText += '          ';
          } else if (gap > 10) {
            lineText += '    ';
          } else if (gap > 2) {
            lineText += ' ';
          }
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

async function proxyToUnlimitedOCR(files) {
  const form = new FormData();

  if (files.file) {
    form.append(
      'file',
      new Blob([files.file.buffer], { type: files.file.mimetype || 'application/pdf' }),
      files.file.originalname || 'upload.pdf',
    );
  }

  for (const image of files.images || []) {
    form.append(
      'images',
      new Blob([image.buffer], { type: image.mimetype || 'image/png' }),
      image.originalname || 'page.png',
    );
  }

  const response = await fetch(OCR_PROXY_URL, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unlimited-OCR upstream error (${response.status}): ${errorText}`);
  }

  const payload = await response.json();
  return {
    text: cleanExtractedText(payload.text),
    pages: Number(payload.pages || files.images?.length || 1),
    method: 'unlimited-ocr',
  };
}

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    method: OCR_PROXY_URL ? 'unlimited-ocr' : 'fallback',
  });
});

app.post(
  '/ocr',
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'images', maxCount: 20 },
  ]),
  async (req, res) => {
    try {
      const file = req.files?.file?.[0] || null;
      const images = req.files?.images || [];

      if (!file && images.length === 0) {
        return res.status(400).json({ error: 'No file or images uploaded.' });
      }

      if (OCR_PROXY_URL) {
        try {
          const proxied = await proxyToUnlimitedOCR({ file, images });
          if (proxied.text) {
            return res.json(proxied);
          }
        } catch (error) {
          console.warn('Unlimited-OCR proxy failed, falling back:', error.message);
        }
      }

      if (file?.mimetype === 'application/pdf' || file?.originalname?.toLowerCase().endsWith('.pdf')) {
        const fallback = await extractPdfTextFallback(file.buffer);
        return res.json(fallback);
      }

      return res.json({
        text: '',
        pages: images.length || 1,
        method: 'fallback',
      });
    } catch (error) {
      console.error('OCR service error:', error);
      return res.status(500).json({
        error: 'Failed to process OCR request.',
        details: error.message,
      });
    }
  },
);

app.listen(PORT, () => {
  console.log(`OCR service listening on http://localhost:${PORT}`);
});
