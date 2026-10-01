/**
 * xlsxReader.js — Agent 1: reads the 8 Excel sheet tabs into rows.
 *
 * Defensive: sheets detected by name-text match, header rows detected by
 * header-text match, not fixed positions. Missing sheets => empty arrays.
 *
 * Expected tabs (name variants handled):
 *   A_Master_Reconciliation_BOM / A_Master_BOM  -> bomItems
 *   C_Shortage_Confirmation / C_Shortage_Confirm -> shortageConfirmItems
 *   F_*Supplier* / *Directory*                  -> supplierEntries
 *   G_*Change_Log* / *BOM_Change_Log*           -> changeLogFromAgent
 * Other tabs (Purchasing List, Calc Detail, Category Summary, QA, Dashboard)
 * are ignored for ParsedImport except project-title hint — Master BOM is
 * the single source of truth for bomItems (avoids double-count).
 */
import * as XLSX from 'xlsx';
import { buildParsedImport, extractProjectTitle, extractProjectLocation } from './normalize.js';

const H = (s) => String(s ?? '').toLowerCase();

const SHEET_ROLE = (name) => {
  const n = H(name);
  if (/master|reconciliation/.test(n)) return 'bom';
  if (/shortage|confirm/.test(n)) return 'shortage';
  if (/supplier.*director|local.*supplier|directory/.test(n)) return 'suppliers';
  if (/supplier.*purchasing/.test(n)) return 'purchasing';
  if (/change.*log/.test(n)) return 'changelog';
  if (/dashboard|summary|project/.test(n)) return 'dashboard';
  if (/calc|basis|detail/.test(n)) return 'calc';
  if (/qa|checklist|assumption|drawing|category/.test(n)) return 'other';
  return 'other';
};

const colFind = (headerRow, patterns) => {
  for (let i = 0; i < headerRow.length; i++) {
    const c = H(headerRow[i]).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!c) continue;
    if (patterns.some((p) => p.test(c))) return i;
  }
  return -1;
};

const cv = (row, idx) => {
  if (idx < 0 || idx >= row.length) return '';
  const v = row[idx];
  return v === undefined || v === null ? '' : String(v).trim();
};

const isAggregate = (joined) => /material\s*total|subtotal/i.test(joined) && !/[a-z]{3,}\s+[a-z]{3,}/i.test(joined.split(/material\s*total|subtotal/i)[0]);

/** Find header row index: row containing Item + a Qty-like column. */
const findHeaderRow = (rows, extraSignals) => {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = rows[r].map((c) => H(c));
    const joined = cells.join(' ');
    const hasItem = /item/.test(joined);
    const hasQty = /qty|quantity|amount/.test(joined);
    if (hasItem && hasQty) {
      if (!extraSignals || extraSignals.test(joined)) return r;
    }
  }
  return -1;
};

const parseBomSheet = (rows) => {
  if (!Array.isArray(rows)) return [];
  const hIdx = findHeaderRow(rows, /unit cost|unit price|est total|wastage|spec|basis|confidence|pack/);
  if (hIdx < 0) return [];
  const header = rows[hIdx];
  const idx = {
    category: colFind(header, [/^system/, /^category/]),
    // Agent exports may use the more descriptive "Item / Canonical Name".
    // Keep Item as the leading, unambiguous signal without mistaking an ID
    // column for the BOM item name.
    item: colFind(header, [/^item\b/]),
    spec: colFind(header, [/\bspec\b/]),
    unit: colFind(header, [/^unit$/]),
    netQty: colFind(header, [/net qty/]),
    wastagePct: colFind(header, [/wastage/]),
    purchaseQty: colFind(header, [/purchase qty/, /order qty/]),
    unitCost: colFind(header, [/unit cost/, /unit price/]),
    estTotal: colFind(header, [/est total/]),
    basis: colFind(header, [/^basis$/]),
    confidence: colFind(header, [/confidence/]),
    pack: colFind(header, [/^pack$/]),
    notes: colFind(header, [/\bnotes?\b/, /reason/]),
  };
  if (idx.item < 0) return [];
  const out = [];
  for (let r = hIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    const name = cv(row, idx.item);
    if (!name || name.length < 2) continue;
    if (/^#/ .test(name)) continue;
    const joined = row.join(' ');
    if (/material\s*total/i.test(joined) && !name) continue;
    if (/material\s*total/i.test(name) && cv(row, idx.purchaseQty) === '') continue;
    out.push({
      category: cv(row, idx.category),
      item: name,
      spec: cv(row, idx.spec),
      unit: cv(row, idx.unit),
      netQty: cv(row, idx.netQty),
      wastagePct: cv(row, idx.wastagePct),
      purchaseQty: cv(row, idx.purchaseQty),
      unitCost: cv(row, idx.unitCost),
      estTotal: cv(row, idx.estTotal),
      basis: cv(row, idx.basis),
      confidence: cv(row, idx.confidence),
      pack: idx.pack >= 0 ? cv(row, idx.pack) : '',
      notes: cv(row, idx.notes),
    });
  }
  // Filter aggregate TOTAL row (empty item or MATERIAL TOTAL marker)
  return out.filter((b) => b.item && !/^material\s*total$/i.test(b.item));
};

const parseShortageSheet = (rows) => {
  if (!Array.isArray(rows)) return [];
  const hIdx = findHeaderRow(rows, /severity|confirm|missing/);
  let headerIdx = hIdx;
  if (headerIdx < 0) {
    for (let r = 0; r < Math.min(rows.length, 15); r++) {
      const joined = rows[r].map((c) => H(c)).join(' ');
      if (/severity/.test(joined) && /confirm|missing/.test(joined)) { headerIdx = r; break; }
    }
  }
  if (headerIdx < 0) return [];
  const header = rows[headerIdx];
  const idx = {
    severity: colFind(header, [/severity/]),
    issue: colFind(header, [/item issue/, /^issue$/, /^item$/]),
    missingInfo: colFind(header, [/missing/, /uncertain/, /what is/]),
    confirmationRequired: colFind(header, [/confirm/]),
    owner: colFind(header, [/owner/]),
  };
  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.join('').trim()) continue;
    out.push({
      severity: cv(row, idx.severity),
      issue: cv(row, idx.issue),
      missingInfo: cv(row, idx.missingInfo),
      confirmationRequired: cv(row, idx.confirmationRequired),
      owner: cv(row, idx.owner),
    });
  }
  return out.filter((s) => s.issue || s.confirmationRequired);
};

const parseSupplierSheet = (rows) => {
  if (!Array.isArray(rows)) return [];
  let headerIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const joined = rows[r].map((c) => H(c)).join(' ');
    if (/business name/.test(joined)) { headerIdx = r; break; }
  }
  if (headerIdx < 0) return [];
  const header = rows[headerIdx];
  const idx = {
    businessName: colFind(header, [/business name/]),
    contact: colFind(header, [/whatsapp/, /contact/, /phone/]),
    address: colFind(header, [/address/]),
    specialty: colFind(header, [/specialty/]),
    logisticsNote: colFind(header, [/logistics/]),
    sourceUrl: colFind(header, [/source url/, /^source$/]),
  };
  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.join('').trim()) continue;
    out.push({
      businessName: cv(row, idx.businessName),
      contact: cv(row, idx.contact),
      address: cv(row, idx.address),
      specialty: cv(row, idx.specialty),
      logisticsNote: cv(row, idx.logisticsNote),
      sourceUrl: cv(row, idx.sourceUrl),
    });
  }
  return out.filter((s) => s.businessName);
};

const parseChangeLogSheet = (rows) => {
  if (!Array.isArray(rows)) return [];
  let headerIdx = -1;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const joined = rows[r].map((c) => H(c)).join(' ');
    if (/what changed/.test(joined) || (/\bdate\b/.test(joined) && /\bagent\b/.test(joined))) { headerIdx = r; break; }
  }
  if (headerIdx < 0) return [];
  const header = rows[headerIdx];
  const idx = {
    date: colFind(header, [/\bdate\b/]),
    agent: colFind(header, [/\bagent\b/]),
    what: colFind(header, [/what changed/]),
    why: colFind(header, [/\bwhy\b/]),
  };
  const out = [];
  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row.join('').trim()) continue;
    const head = [cv(row, idx.date), cv(row, idx.agent)].filter(Boolean).join(' | ');
    const body = [cv(row, idx.what), cv(row, idx.why)].filter(Boolean).join(' — ');
    const desc = [head, body].filter(Boolean).join(': ');
    if (desc) out.push({ description: desc });
  }
  return out;
};

const sheetToRows = (sheet) => {
  if (!sheet) return [];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => (Array.isArray(r) ? r : []).map((c) => (c === undefined || c === null ? '' : c)));
};

/** Main entry: ArrayBuffer/File -> ParsedImport. */
export const parseWorkbook = (workbook) => {
  let bomItems = [];
  let shortageConfirmItems = [];
  let supplierEntries = [];
  let changeLogFromAgent = [];
  let titleHint = '';
  let locationHint = '';

  // A corrupt/foreign file can read without SheetNames — resolve to empty, never crash.
  const names = workbook && Array.isArray(workbook.SheetNames) ? workbook.SheetNames : [];
  const sheets = (workbook && workbook.Sheets) || {};
  for (const name of names) {
    const role = SHEET_ROLE(name);
    const rows = sheetToRows(sheets[name]);
    if (rows.length === 0) continue;
    // Capture project title hint from first rows of master/dashboard sheets.
    // Standard agent exports use "Project: …"; some valid exports put the
    // title directly in "MASTER / RECONCILIATION BOM — <project>" instead.
    if (role === 'bom' || role === 'dashboard') {
      const top = rows.slice(0, 5).map((r) => r.join(' ')).join(' ');
      const projMatch = top.match(/project\s*:\s*([^\n|]+)/i);
      const m = projMatch || top.match(/surau\s+darul\s+dakwah[^\n|]*/i);
      // Location comes only from an explicit "Project: NAME, LOCATION" line.
      if (projMatch && !locationHint) {
        locationHint = projMatch[1] || projMatch[0];
      }
      // The Master BOM is more canonical than a dashboard summary, which can
      // omit quotation/reference text needed to distinguish projects. Read
      // its title row directly before considering a generic text match.
      if (role === 'bom') {
        const masterTitle = rows.slice(0, 5)
          .map((r) => r.join(' ').trim())
          .find((text) => /master|reconciliation/.test(H(text)) && /bom/.test(H(text)));
        if (masterTitle) titleHint = masterTitle;
        else if (m) titleHint = m[1] || m[0];
      } else if (m && !titleHint) titleHint = m[1] || m[0];
    }
    if (role === 'bom') bomItems = bomItems.concat(parseBomSheet(rows));
    else if (role === 'shortage') shortageConfirmItems = shortageConfirmItems.concat(parseShortageSheet(rows));
    else if (role === 'suppliers') supplierEntries = supplierEntries.concat(parseSupplierSheet(rows));
    else if (role === 'changelog') changeLogFromAgent = changeLogFromAgent.concat(parseChangeLogSheet(rows));
    // purchasing/calc/other/dashboard ignored for ParsedImport body
  }

  const projectTitle = titleHint ? extractProjectTitle(titleHint) : 'UNKNOWN PROJECT';
  const location = locationHint ? extractProjectLocation(locationHint) : null;
  return buildParsedImport({ projectTitle, location, bomItems, shortageConfirmItems, supplierEntries, changeLogFromAgent });
};

export const parseXlsx = async (fileOrBuffer) => {
  const buffer = fileOrBuffer instanceof ArrayBuffer
    ? fileOrBuffer
    : await fileOrBuffer.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  return parseWorkbook(workbook);
};

export default parseXlsx;
