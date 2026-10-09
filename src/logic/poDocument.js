/**
 * poDocument.js — Agent 3/4 boundary: deterministic PO content builders + PDF renderer.
 *
 * Reads the same BomItem[] the screen reads. Missing price (null/undefined/blank/NaN)
 * renders as "TBD" everywhere — never inferred, never zero-filled. An explicit 0 is a
 * stated price and renders as RM 0.00. Totals sum priced lines only.
 *
 * Pure functions except renderPoPdf (jspdf). No storage, no gate logic — the gate
 * stays exactly as tested in screens/poGate.js.
 */
import { jsPDF } from 'jspdf';

export const isMissingPrice = (v) => {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string' && v.trim() === '') return true;
  if (typeof v === 'number' && Number.isNaN(v)) return true;
  return false;
};

const money = (n) => Math.round(Number(n) * 100) / 100;

export const formatMoney = (n) => `RM ${money(n).toFixed(2)}`;

/** Build render-ready PO lines from stored BomItems. */
export const buildPoLines = (bomItems) =>
  (bomItems || []).map((b) => {
    const missing = isMissingPrice(b.purchaseQty) || isMissingPrice(b.unitCost);
    return {
      item: b.item ?? '(unnamed)',
      spec: b.spec ?? null,
      qty: isMissingPrice(b.purchaseQty) ? null : Number(b.purchaseQty),
      unit: b.unit ?? null,
      unitCost: isMissingPrice(b.unitCost) ? null : Number(b.unitCost),
      lineTotal: missing ? null : money(Number(b.purchaseQty) * Number(b.unitCost)),
    };
  });

/** Grand total over priced lines only (TBD lines excluded, never zero-filled). */
export const buildPoTotal = (lines) =>
  money((lines || []).reduce((s, l) => s + (l.lineTotal === null ? 0 : l.lineTotal), 0));

export const countTbd = (lines) => (lines || []).filter((l) => l.lineTotal === null).length;

export const buildPoSummaryText = ({ projectName, lines, total }) => {
  const priced = (lines || []).length - countTbd(lines);
  const tbd = countTbd(lines);
  return `PO ${projectName}: ${priced} priced lines, ${formatMoney(total)}${tbd > 0 ? `, ${tbd} line(s) TBD` : ''}`;
};

/** Exact deep-link shape per spec: wa.me + text + po.pdf attachment. */
export const buildWhatsAppLink = (summaryText) =>
  `https://wa.me/?text=${encodeURIComponent(summaryText)}&attachment=po.pdf`;

/**
 * Render the PO PDF. ASCII-only content, compression off (deterministic bytes).
 * @param {object} options
 * @param {string} options.projectName
 * @param {string} options.generatedAt
 * @param {Array} options.lines
 * @param {number} options.total
 * @param {number} [options.openConfirmCount] — if >0, prepends a caveat line to the PDF header
 * @returns {ArrayBuffer} the PDF file bytes
 */
export const renderPoPdf = ({ projectName, generatedAt, lines, total, openConfirmCount }) => {
  const doc = new jsPDF({ compress: false });
  const tbd = countTbd(lines);
  let y = 20;

  if (openConfirmCount > 0) {
    doc.setFontSize(10);
    doc.text(`${openConfirmCount} item(s) pending confirmation — this BOM may be incomplete.`, 14, y);
    y += 7;
  }

  doc.setFontSize(16);
  doc.text('PURCHASE ORDER', 14, y);
  y += 8;
  doc.setFontSize(11);
  doc.text(`Project: ${projectName}`, 14, y);
  y += 7;
  doc.text(`Generated: ${generatedAt}`, 14, y);
  y += 10;

  doc.setFontSize(10);
  doc.text('#   Item / Qty / Unit price / Line total', 14, y);
  y += 7;
  lines.forEach((l, i) => {
    if (y > 280) { doc.addPage(); y = 20; }
    const qty = `${l.qty === null ? 'TBD' : l.qty}${l.unit ? ` ${l.unit}` : ''}`;
    const price = l.unitCost === null ? 'TBD' : formatMoney(l.unitCost);
    const totalStr = l.lineTotal === null ? 'TBD' : formatMoney(l.lineTotal);
    doc.text(`${i + 1}. ${l.item} | ${qty} | ${price} | ${totalStr}`, 14, y);
    y += 7;
  });

  y += 3;
  if (y > 280) { doc.addPage(); y = 20; }
  doc.setFontSize(12);
  doc.text(`TOTAL (priced lines): ${formatMoney(total)}`, 14, y);
  y += 8;
  if (tbd > 0) {
    doc.setFontSize(10);
    doc.text(`${tbd} line(s) marked TBD - price to be confirmed, never inferred.`, 14, y);
  }
  return doc.output('arraybuffer');
};

export default {
  isMissingPrice,
  formatMoney,
  buildPoLines,
  buildPoTotal,
  countTbd,
  buildPoSummaryText,
  buildWhatsAppLink,
  renderPoPdf,
};
