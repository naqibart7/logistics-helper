/**
 * mdReader.js — Agent 1: reads the 8 markdown sections into rows.
 *
 * Defensive: sections detected by header-text match, not fixed position.
 * Missing/reordered sections => empty array for that section, never a throw.
 * Supports both MD variants:
 *   - Qwen variant: ## H_Order_Ready_Dashboard / ## A_Master_BOM / ...
 *   - Pandas-export variant: ## 1_Project_Summary / ## 2_Master_BOM / ... (Unnamed: columns)
 */
import { buildParsedImport, extractProjectTitle, extractProjectLocation } from './normalize.js';

/** Split markdown into sections keyed by normalized header. */
export const splitSections = (text) => {
  const lines = String(text || '').split(/\r?\n/);
  const sections = [];
  let current = { header: '__preamble__', lines: [] };
  sections.push(current);
  for (const line of lines) {
    const m = line.match(/^#{1,4}\s*(.+?)\s*$/);
    if (m) {
      current = { header: m[1].trim(), lines: [] };
      sections.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return sections;
};

const H = (s) => String(s || '').toLowerCase();

/** Classify a section header into a role. */
export const classifySection = (header) => {
  const h = H(header);
  if (/master|reconciliation/.test(h)) return 'bom';
  if (/purchasing|supplier.*(purchasing|list)|2_|3_/.test(h) && /purchas/.test(h)) return 'purchasing';
  if (/shortage|confirm/.test(h)) return 'shortage';
  if (/calc|detail|basis/.test(h)) return 'calc';
  if (/supplier.*director|local.*supplier|directory|f_local|supplier/.test(h)) return 'suppliers';
  if (/change.*log/.test(h)) return 'changelog';
  if (/dashboard|order.*ready|project.*summary|summary/.test(h)) return 'dashboard';
  if (/qa|checklist/.test(h)) return 'qa';
  return 'other';
};

/** Parse all markdown tables in a section's lines. Returns array of { rows }.
 *
 *  No header assumption: pandas-export variants put a title row + metadata rows
 *  before the true column-header row, so each typed parser below locates its own
 *  header by content. Separator rows (| --- |) are stripped here.
 */
export const parseTables = (lines) => {
  const tables = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].trim().startsWith('|')) { i++; continue; }
    const block = [];
    while (i < lines.length && lines[i].trim().startsWith('|')) {
      block.push(lines[i].trim());
      i++;
    }
    if (block.length >= 2) {
      const splitRow = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const rows = block.map(splitRow).filter((r) => !isSeparatorRow(r));
      if (rows.length > 0) tables.push({ rows });
    }
  }
  return tables;
};

/** A markdown separator row: every cell is dashes (| --- | --- |). */
export const isSeparatorRow = (row) =>
  row.length > 0 && row.every((c) => /^:?-+:?$/.test(String(c).trim()));

const colIndex = (header, patterns) => {
  for (let i = 0; i < header.length; i++) {
    const c = H(header[i]).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (patterns.some((p) => p.test(c))) return i;
  }
  return -1;
};

const cell = (row, idx) => (idx >= 0 && idx < row.length ? row[idx] : '');

/** Extract markdown link URL from "[Link](url)" or bare URL.
 *  Greedy to the last ")" so URLs containing parens survive intact. */
export const extractUrl = (text) => {
  if (!text) return '';
  const s = String(text).trim();
  const m = s.match(/\[.*?\]\(\s*(https?:\/\/\S.*)\)\s*$/);
  if (m) return m[1].trim();
  const b = s.match(/https?:\S+/);
  return b ? b[0].replace(/[)]+$/, '').trim() : s;
};

/** Drop pandas-export "Unnamed:" columns and TOTAL/SUBTOTAL aggregate rows. */
const isAggregateRow = (rowText) =>
  /material\s*total|subtotal|^\s*total/i.test(rowText);

/** Parse BOM rows from a section (Master BOM table). */
export const parseBomTables = (tables) => {
  const items = [];
  for (const t of tables) {
    // True header row: carries Item + Qty + a BOM signal. Title/metadata rows above it fail this.
    const hi = t.rows.findIndex((r) => {
      const hasItem = colIndex(r, [/^item$/, /item issue/]) >= 0;
      const hasQty = colIndex(r, [/net qty/, /purchase qty/, /order qty/, /\bqty\b/]) >= 0;
      const hasSignal = colIndex(r, [/unit cost/, /unit price/, /est total/, /wastage/, /\bspec\b/, /purchase qty/, /net qty/]) >= 0;
      return hasItem && hasQty && hasSignal;
    });
    if (hi < 0) continue;
    const h = t.rows[hi];
    // Skip non-BOM tables (shortage/supplier) that also have "item" words:
    // BOM tables must have a purchase/net qty AND (unit cost | est total | wastage | spec)
    const hasBomSignal = colIndex(h, [/unit cost/, /unit price/, /est total/, /wastage/, /\bspec\b/, /purchase qty/, /net qty/]) >= 0;
    if (!hasBomSignal) continue;

    const idx = {
      num: colIndex(h, [/^#$/, /^no\.?$/, /number/]),
      category: colIndex(h, [/^system/, /^category/]),
      item: colIndex(h, [/^item$/, /item issue/]),
      spec: colIndex(h, [/\bspec\b/, /spec \/ pack/]),
      unit: colIndex(h, [/^unit$/]),
      netQty: colIndex(h, [/net qty/]),
      wastagePct: colIndex(h, [/wastage/]),
      purchaseQty: colIndex(h, [/purchase qty/, /order qty/]),
      unitCost: colIndex(h, [/unit cost/, /unit price/]),
      estTotal: colIndex(h, [/est total/]),
      basis: colIndex(h, [/^basis$/]),
      confidence: colIndex(h, [/confidence/]),
      pack: colIndex(h, [/^pack$/, /spec \/ pack/]),
      notes: colIndex(h, [/\bnotes?\b/, /derivation/, /method/]),
    };
    // Fallback: unnamed pandas columns — positional mapping for known 14-col Master BOM
    const positional = idx.item < 0 && h.filter((c) => !/^unnamed/i.test(c)).length <= 2;
    for (const row of t.rows.slice(hi + 1)) {
      const joined = row.join(' ');
      if (!joined.trim() || isAggregateRow(joined)) continue;
      // Numbered-line guard: when the header has a # column, data rows must be
      // numbered — drops note/total/NaN rows that share the table block.
      if (idx.num >= 0 && !/^\d+$/.test(cell(row, idx.num).trim())) continue;
      if (positional && row.length >= 10) {
        // # | System | Item | Spec | Unit | Net | Wastage | Purchase | Cost | Total | Basis | Conf | Pack | Notes
        const p = (n) => (row[n] !== undefined ? row[n] : '');
        if (!p(2) || /^#/i.test(p(0)) === false && !p(2).trim()) continue;
        items.push({
          category: p(1), item: p(2), spec: p(3), unit: p(4), netQty: p(5),
          wastagePct: p(6), purchaseQty: p(7), unitCost: p(8), estTotal: p(9),
          basis: p(10), confidence: p(11), pack: p(12), notes: p(13),
        });
        continue;
      }
      if (idx.item < 0) continue;
      const itemName = cell(row, idx.item);
      if (!itemName || itemName.trim() === '' || /^#/ .test(itemName)) continue;
      if (/^unnamed/i.test(itemName)) continue;
      items.push({
        category: cell(row, idx.category),
        item: itemName,
        spec: cell(row, idx.spec),
        unit: cell(row, idx.unit),
        netQty: cell(row, idx.netQty),
        wastagePct: cell(row, idx.wastagePct),
        purchaseQty: cell(row, idx.purchaseQty),
        unitCost: cell(row, idx.unitCost),
        estTotal: cell(row, idx.estTotal),
        basis: cell(row, idx.basis),
        confidence: cell(row, idx.confidence),
        pack: idx.pack >= 0 && idx.pack !== idx.spec ? cell(row, idx.pack) : '',
        notes: cell(row, idx.notes),
      });
    }
  }
  return items;
};

export const parseShortageTables = (tables) => {
  const out = [];
  for (const t of tables) {
    const hi = t.rows.findIndex((r) =>
      colIndex(r, [/severity/]) >= 0 &&
      (colIndex(r, [/confirm/]) >= 0 || colIndex(r, [/missing/, /uncertain/, /what is/]) >= 0)
    );
    if (hi < 0) continue;
    const h = t.rows[hi];
    const idx = {
      severity: colIndex(h, [/severity/]),
      issue: colIndex(h, [/item issue/, /^issue$/, /^item$/]),
      missingInfo: colIndex(h, [/missing/, /uncertain/, /what is/]),
      confirmationRequired: colIndex(h, [/confirm/]),
      owner: colIndex(h, [/owner/]),
    };
    for (const row of t.rows.slice(hi + 1)) {
      if (!row.join('').trim()) continue;
      out.push({
        severity: cell(row, idx.severity),
        issue: cell(row, idx.issue),
        missingInfo: cell(row, idx.missingInfo),
        confirmationRequired: cell(row, idx.confirmationRequired),
        owner: cell(row, idx.owner),
      });
    }
  }
  return out;
};

export const parseSupplierTables = (tables) => {
  const out = [];
  for (const t of tables) {
    const hi = t.rows.findIndex((r) => colIndex(r, [/business name/]) >= 0);
    if (hi < 0) continue;
    const h = t.rows[hi];
    const idx = {
      businessName: colIndex(h, [/business name/]),
      contact: colIndex(h, [/whatsapp/, /contact/, /phone/]),
      address: colIndex(h, [/address/]),
      specialty: colIndex(h, [/specialty/]),
      logisticsNote: colIndex(h, [/logistics/]),
      sourceUrl: colIndex(h, [/source url/, /^source$/]),
    };
    for (const row of t.rows.slice(hi + 1)) {
      if (!row.join('').trim()) continue;
      out.push({
        businessName: cell(row, idx.businessName),
        contact: cell(row, idx.contact),
        address: cell(row, idx.address),
        specialty: cell(row, idx.specialty),
        logisticsNote: cell(row, idx.logisticsNote),
        sourceUrl: extractUrl(cell(row, idx.sourceUrl)),
      });
    }
  }
  return out;
};

export const parseChangeLogTables = (tables) => {
  const out = [];
  for (const t of tables) {
    const hi = t.rows.findIndex((r) => {
      const hasChange = colIndex(r, [/what changed/, /change/]) >= 0 || colIndex(r, [/\bwhy\b/]) >= 0;
      const hasDate = colIndex(r, [/\bdate\b/]) >= 0;
      if (!hasChange && !hasDate) return false;
      // Avoid QA checklist tables (Check|Status) — require date or agent/what-changed
      if (colIndex(r, [/\bcheck\b/]) >= 0 && !hasDate && colIndex(r, [/\bagent\b/]) < 0) return false;
      return true;
    });
    if (hi < 0) continue;
    const h = t.rows[hi];
    const idx = {
      date: colIndex(h, [/\bdate\b/]),
      agent: colIndex(h, [/\bagent\b/]),
      what: colIndex(h, [/what changed/]),
      why: colIndex(h, [/\bwhy\b/]),
    };
    for (const row of t.rows.slice(hi + 1)) {
      if (!row.join('').trim()) continue;
      const parts = [];
      const d = cell(row, idx.date); const a = cell(row, idx.agent);
      const w = cell(row, idx.what); const y = cell(row, idx.why);
      const head = [d, a].filter(Boolean).join(' | ');
      const body = [w, y].filter(Boolean).join(' — ');
      const desc = [head, body].filter(Boolean).join(': ');
      if (desc) out.push({ description: desc });
    }
  }
  return out;
};

/** Main entry: markdown string -> ParsedImport (via normalize). */
export const parseMarkdown = (text) => {
  const sections = splitSections(text);
  let bomItems = [];
  let shortageConfirmItems = [];
  let supplierEntries = [];
  let changeLogFromAgent = [];
  let titleHint = '';

  for (const s of sections) {
    const role = classifySection(s.header);
    const tables = parseTables(s.lines);
    if (tables.length === 0) continue;
    if (role === 'bom') {
      bomItems = bomItems.concat(parseBomTables(tables));
      if (!titleHint) titleHint = s.header + ' ' + s.lines.slice(0, 4).join(' ');
    } else if (role === 'shortage') {
      shortageConfirmItems = shortageConfirmItems.concat(parseShortageTables(tables));
    } else if (role === 'suppliers') {
      supplierEntries = supplierEntries.concat(parseSupplierTables(tables));
    } else if (role === 'changelog') {
      changeLogFromAgent = changeLogFromAgent.concat(parseChangeLogTables(tables));
    } else if (role === 'other' || role === 'purchasing' || role === 'dashboard') {
      // Fallback: a Master BOM table may sit under an unclassified header
      // (e.g. "2_Master_BOM" classifies as bom already; purchasing lists ignored
      // for bomItems to avoid double-count — Master BOM is the source of truth).
      if (!titleHint && /surau|darul|dakwah|project|master|bom/i.test(s.header + s.lines.slice(0, 3).join(' '))) {
        titleHint = s.header + ' ' + s.lines.slice(0, 4).join(' ');
      }
    }
  }

  // Project title: prefer Master BOM header line (### ... — SURAU DARUL DAKWAH)
  let projectTitle = 'UNKNOWN PROJECT';
  const m = String(text).match(/MASTER\s*\/\s*RECONCILIATION BOM\s*[—–\-:|]+\s*([^\n\r|]+)/i);
  if (m) {
    projectTitle = extractProjectTitle(m[0]);
  } else {
    const d = String(text).match(/SURAU\s+DARUL\s+DAKWAH[^\n\r|]*/i);
    if (d) projectTitle = extractProjectTitle(d[0]);
    else if (titleHint) projectTitle = extractProjectTitle(titleHint);
  }

  // Location: an explicit "Project: NAME, LOCATION" line, if present.
  const pl = String(text).match(/project\s*:\s*([^\n\r|]+)/i);
  const location = pl ? extractProjectLocation(pl[1] || pl[0]) : null;

  return buildParsedImport({ projectTitle, location, bomItems, shortageConfirmItems, supplierEntries, changeLogFromAgent });
};

export default parseMarkdown;
