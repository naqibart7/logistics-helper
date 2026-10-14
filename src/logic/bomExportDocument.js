/**
 * bomExportDocument.js — Task M: "Export BOM" PDF (NOT the PO Generator).
 * Fully separate from poDocument.js / poGate.js — different output, different
 * button, different screen. Layout follows the reference purchase-list template:
 * header block, numbered displayOrder table, category roll-up, grand total.
 *
 * Missing-price rule (same as PO): a genuinely missing unitCost renders TBD on
 * that row, and the row is excluded from its category subtotal and the grand
 * total. Never zero-filled, never inferred. Explicit 0 is a stated price.
 */
import { jsPDF } from 'jspdf';
import { isMissingPrice } from './poDocument.js';
import { byDisplayOrder } from '../utils/helpers.js';

const money = (n) => Math.round(Number(n) * 100) / 100;

export const formatMoney = (n) => `RM ${money(n).toFixed(2)}`;

/** One export row per BomItem, numbered from 1 in displayOrder. */
export const buildBomExportLines = (bomItems) =>
  byDisplayOrder(bomItems).map((b, i) => {
    const missing = isMissingPrice(b.purchaseQty) || isMissingPrice(b.unitCost);
    return {
      no: i + 1,
      category: b.category ?? 'Uncategorised',
      description: b.item ?? '(unnamed)',
      unit: b.unit ?? null,
      qty: isMissingPrice(b.purchaseQty) ? null : Number(b.purchaseQty),
      unitCost: isMissingPrice(b.unitCost) ? null : Number(b.unitCost),
      lineTotal: missing ? null : money(Number(b.purchaseQty) * Number(b.unitCost)),
      notes: b.spec ?? null,
    };
  });

/** Per-category roll-up. lineCount covers all rows; subtotal covers priced rows only. */
export const buildCategoryRollup = (lines) => {
  const map = new Map();
  for (const l of lines || []) {
    if (!map.has(l.category)) map.set(l.category, { category: l.category, lineCount: 0, subtotal: null });
    const r = map.get(l.category);
    r.lineCount += 1;
    if (l.lineTotal !== null) {
      if (r.subtotal === null) r.subtotal = 0;
      r.subtotal = money(r.subtotal + l.lineTotal);
    }
  }
  return [...map.values()];
};

export const buildBomExportTotals = (lines) => {
  const priced = (lines || []).filter((l) => l.lineTotal !== null);
  return {
    grandTotal: money(priced.reduce((s, l) => s + l.lineTotal, 0)),
    itemCount: (lines || []).length,
    tbdCount: (lines || []).length - priced.length,
  };
};

/**
 * Assemble everything the PDF needs. clientLine is '—' when unset (graceful
 * blank); quotationDate/source are caller-provided (unknown → honest defaults).
 * openConfirmCount: when >0, the PDF shows a caveat line that the BOM may be
 * incomplete (items pending confirmation still unresolved).
 */
export const buildBomExportData = ({ project, quotationDate, source, generatedAt, lines, openConfirmCount }) => {
  const rollup = buildCategoryRollup(lines);
  const { grandTotal, itemCount, tbdCount } = buildBomExportTotals(lines);
  return {
    title: 'DSG B - PURCHASE LIST',
    projectName: (project && project.name) || 'UNKNOWN PROJECT',
    location: (project && project.location) || null,
    clientLine: project && project.client ? project.client : '—',
    quotationDate: quotationDate || '—',
    source: source || 'Agent 6/7 Reconciliation Pipeline',
    generatedAt,
    lines: lines || [],
    rollup,
    grandTotal,
    itemCount,
    tbdCount,
    openConfirmCount: typeof openConfirmCount === 'number' ? openConfirmCount : 0,
  };
};

/**
 * Render the export PDF. ASCII body text, compression off (deterministic,
 * byte-searchable). The em-dash in the template's Client blank is rendered as
 * '-' for font safety; the data layer still carries '—'.
 */
export const renderBomExportPdf = (data) => {
  const doc = new jsPDF({ compress: false });
  let y = 15;
  let pageNum = 1;
  const pageHeight = 297; // A4 portrait
  const bottomMargin = 20;

  const addFooter = () => {
    doc.setFontSize(10);
    doc.text(`Page ${pageNum} of {total_pages}`, 105, pageHeight - 10, { align: 'center' });
  };

  const checkPageBreak = (step = 7) => {
    if (y + step > pageHeight - bottomMargin) {
      addFooter();
      doc.addPage();
      pageNum++;
      y = 20;
    }
  };

  const next = (step = 7) => {
    checkPageBreak(step);
    y += step;
  };

  if (data.openConfirmCount > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(`${data.openConfirmCount} item(s) pending confirmation — this BOM may be incomplete.`, 14, y);
    y += 7;
  }

  // Header Block
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(data.title, 14, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  const proj = `Project: ${data.projectName}${data.location ? `, ${data.location}` : ''}`;
  doc.text(proj, 14, y);
  y += 6;
  doc.text(`Client: ${data.clientLine === '—' ? '-' : data.clientLine}`, 14, y);
  y += 6;
  doc.text(`Quotation Date: ${data.quotationDate}`, 14, y);
  y += 6;
  doc.text(`Source: ${data.source}`, 14, y);
  y += 6;
  doc.text(`Generated: ${data.generatedAt}`, 14, y);
  y += 10;

  // Table Headers
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');

  const cols = [
    { name: '#', x: 14, w: 8, align: 'left' },
    { name: 'Category', x: 22, w: 35, align: 'left' },
    { name: 'Item', x: 57, w: 45, align: 'left' },
    { name: 'Unit', x: 102, w: 12, align: 'left' },
    { name: 'Qty', x: 114, w: 15, align: 'right' },
    { name: 'Cost (RM)', x: 129, w: 22, align: 'right' },
    { name: 'Total (RM)', x: 151, w: 22, align: 'right' },
    { name: 'Notes', x: 175, w: 21, align: 'left' }
  ];

  const drawRow = (rowObj, isBold = false) => {
    checkPageBreak(7);
    if (isBold) doc.setFont('helvetica', 'bold');
    else doc.setFont('helvetica', 'normal');

    // Draw borders
    doc.rect(12, y - 5, 184, 7);
    let currentX = 12;
    for(let i=0; i<cols.length-1; i++){
      currentX += cols[i].w;
      doc.line(currentX, y - 5, currentX, y + 2);
    }

    cols.forEach(col => {
      const val = rowObj[col.name];
      if (val !== undefined && val !== null) {
        let textStr = String(val);
        // Truncate if too long (rough approx)
        if(textStr.length > 25 && col.align === 'left') {
           textStr = textStr.substring(0, 22) + '...';
        }
        const textX = col.align === 'right' ? col.x + col.w - 2 : col.x;
        doc.text(textStr, textX, y, { align: col.align });
      }
    });
    y += 7;
  };

  // Render Table Header
  const headerObj = {};
  cols.forEach(c => headerObj[c.name] = c.name);
  drawRow(headerObj, true);

  // Render Items
  for (const l of data.lines) {
    drawRow({
      '#': l.no,
      'Category': l.category,
      'Item': l.description,
      'Unit': l.unit || '-',
      'Qty': l.qty === null ? 'TBD' : l.qty,
      'Cost (RM)': l.unitCost === null ? 'TBD' : formatMoney(l.unitCost).replace('RM ', ''),
      'Total (RM)': l.lineTotal === null ? 'TBD' : formatMoney(l.lineTotal).replace('RM ', ''),
      'Notes': l.notes || '-'
    });
  }

  y += 5;
  checkPageBreak(15);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('--- Category Roll-Up ---', 14, y);
  y += 7;

  doc.setFontSize(10);
  for (const r of data.rollup) {
    checkPageBreak(6);
    doc.setFont('helvetica', 'normal');
    doc.text(r.category, 14, y);
    doc.text(String(r.lineCount) + ' items', 80, y);
    const subVal = r.subtotal === null ? 'TBD' : formatMoney(r.subtotal);
    doc.text(subVal, 150, y, { align: 'right' });
    y += 6;
  }

  y += 4;
  checkPageBreak(10);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('GRAND TOTAL', 14, y);
  doc.text(String(data.itemCount) + ' items', 80, y);
  doc.text(formatMoney(data.grandTotal), 150, y, { align: 'right' });

  if (data.tbdCount > 0) {
    y += 8;
    checkPageBreak(6);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'italic');
    doc.text(`${data.tbdCount} line(s) TBD - excluded from subtotals and grand total.`, 14, y);
  }

  addFooter();

  // Replace {total_pages} placeholder if supported by jspdf
  if (typeof doc.putTotalPages === 'function') {
    const totalPagesExp = '{total_pages}';
    doc.putTotalPages(totalPagesExp);
  }

  return doc.output('arraybuffer');
};

export default {
  buildBomExportLines,
  buildCategoryRollup,
  buildBomExportTotals,
  buildBomExportData,
  renderBomExportPdf,
  formatMoney,
};
