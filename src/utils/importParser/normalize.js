/**
 * normalize.js — Agent 1 shared normalizer.
 *
 * Both mdReader and xlsxReader output through here into one ParsedImport shape.
 * Deterministic only: never invents values. Missing => null. No guessing.
 *
 * ParsedImport = {
 *   projectTitle: string,
 *   bomItems: [{ item, spec, category, unit, netQty, wastagePct,
 *                purchaseQty, unitCost, estTotal, basis, confidence, pack, notes }],
 *   shortageConfirmItems: [{ severity, issue, missingInfo, confirmationRequired, owner }],
 *   supplierEntries: [{ businessName, contact, address, specialty, logisticsNote, sourceUrl }],
 *   changeLogFromAgent: [{ description }],
 * }
 */

const toNullString = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' || s.toUpperCase() === 'NAN' || s === '—' || s === '-' ? null : s;
};

const toNullNumber = (v) => {
  if (v === undefined || v === null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim().replace(/,/g, '');
  if (s === '' || s.toUpperCase() === 'NAN') return null;
  // Handle "20.0%" or "20%" or "0.2" (fraction) for wastage
  const isPct = s.includes('%');
  // A cell with no digit at all ("—", "-", "TBD", "(empty after strip)") is
  // "no value / not costed" -> null, not 0. Number('') is 0, which would
  // silently turn an explicitly un-costed price into RM 0.00 instead of TBD.
  if (!/\d/.test(s)) return null;
  const n = Number(s.replace(/[^0-9.\-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return { value: n, isPct };
};

const normalizeWastage = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const parsed = toNullNumber(v);
  if (parsed === null) return null;
  if (typeof parsed === 'number') return cleanNum(parsed);
  // { value, isPct }
  if (parsed.isPct) return cleanNum(parsed.value); // "20%" -> 20
  // fraction like 0.2 -> 20 ; integer like 20 -> 20
  if (parsed.value > 0 && parsed.value < 1) return cleanNum(parsed.value * 100);
  return cleanNum(parsed.value);
};

const numOrNull = (v) => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const parsed = toNullNumber(v);
  if (parsed === null) return null;
  if (typeof parsed === 'number') return cleanNum(parsed);
  return cleanNum(parsed.value);
};

/** Kill IEEE-754 dust (e.g. 28.000000000000004 from an xlsx 0.28 fraction). */
const cleanNum = (n) => {
  if (!Number.isFinite(n)) return n;
  return Math.round(n * 1e4) / 1e4;
};

export const normalizeBomItem = (raw) => ({
  item: toNullString(raw.item),
  spec: toNullString(raw.spec),
  category: toNullString(raw.category),
  unit: toNullString(raw.unit),
  netQty: numOrNull(raw.netQty),
  wastagePct: normalizeWastage(raw.wastagePct),
  purchaseQty: numOrNull(raw.purchaseQty),
  unitCost: numOrNull(raw.unitCost),
  estTotal: numOrNull(raw.estTotal),
  basis: toNullString(raw.basis),
  confidence: toNullString(raw.confidence),
  pack: toNullString(raw.pack),
  notes: toNullString(raw.notes),
});

export const normalizeShortageItem = (raw) => ({
  severity: toNullString(raw.severity),
  issue: toNullString(raw.issue),
  missingInfo: toNullString(raw.missingInfo),
  confirmationRequired: toNullString(raw.confirmationRequired),
  owner: toNullString(raw.owner),
});

export const normalizeSupplierEntry = (raw) => ({
  businessName: toNullString(raw.businessName),
  contact: toNullString(raw.contact),
  address: toNullString(raw.address),
  specialty: toNullString(raw.specialty),
  logisticsNote: toNullString(raw.logisticsNote),
  sourceUrl: toNullString(raw.sourceUrl),
});

export const normalizeChangeLog = (raw) => {
  if (typeof raw === 'string') {
    const s = raw.trim();
    return s ? { description: s } : null;
  }
  return { description: toNullString(raw.description) };
};

/** Extract "SURAU DARUL DAKWAH" from headers like "MASTER / RECONCILIATION BOM — SURAU DARUL DAKWAH".
 *  Canonical form, applied in order:
 *  1. If a BOM marker chunk exists (MASTER/RECONCILIATION + BOM), the project name is the
 *     chunk immediately AFTER it — never the last chunk (which may be a version suffix
 *     like "v2 Cost Sheet"; taking it produced the "V2 COST SHEET" bug, Task N).
 *  2. "Client:/Pipeline:/Drawing:" tails removed.
 *  3. Location tail after the first comma stripped ("X, BETONG, SARAWAK" -> "X").
 *  4. Trailing parenthetical refs stripped ("X (S71354)" -> "X"). Refs differ per
 *     export (S71354 vs Q260163) and are not the name; matching uses bare names.
 *  (Location lives in Project.location, not the title.) */
export const extractProjectTitle = (headerText, fallback = '') => {
  if (!headerText) return fallback || 'UNKNOWN PROJECT';
  const s = String(headerText);
  // Split on em-dash / en-dash / hyphen-pipe patterns
  const parts = s.split(/[—–|]/).map((p) => p.trim()).filter(Boolean);
  let candidate;
  const markerIdx = parts.findIndex(
    (p) => /master|reconciliation/i.test(p) && /bom/i.test(p)
  );
  if (markerIdx >= 0 && markerIdx + 1 < parts.length) {
    candidate = parts[markerIdx + 1];
  } else {
    candidate = parts.length > 1 ? parts[parts.length - 1] : s.trim();
  }
  // Strip leading section words ("MASTER ...", "PROJECT ...") when no marker split applied
  candidate = candidate.replace(/^(master|reconciliation|bom|project|supplier|purchasing|list|dashboard)\W*/i, '').trim();
  // Remove "Client:..." / "Pipeline:..." / "Drawing:..." tails if concatenated
  candidate = candidate.split(/client:|pipeline:|drawing:/i)[0].trim();
  // Strip location tail ("X, BETONG, SARAWAK" -> "X")
  candidate = candidate.split(',')[0].trim();
  // Strip trailing parenthetical refs ("X (S71354)" -> "X")
  candidate = candidate.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!candidate) return fallback || 'UNKNOWN PROJECT';
  // Normalize: collapse spaces, uppercase for stable matching
  return candidate.replace(/\s+/g, ' ').toUpperCase().replace(/,+$/, '').trim() || 'UNKNOWN PROJECT';
};

/** Build final ParsedImport with required keys, empty arrays for absent sections. */
export const buildParsedImport = ({ projectTitle, bomItems = [], shortageConfirmItems = [], supplierEntries = [], changeLogFromAgent = [] }) => {
  // Array.isArray (not just defaults): an explicit null must also resolve to [], never crash .map.
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    projectTitle: projectTitle && String(projectTitle).trim() ? String(projectTitle).trim() : 'UNKNOWN PROJECT',
    bomItems: arr(bomItems).map(normalizeBomItem).filter((b) => b.item !== null),
    shortageConfirmItems: arr(shortageConfirmItems).map(normalizeShortageItem).filter((s) => s.issue !== null || s.confirmationRequired !== null),
    supplierEntries: arr(supplierEntries).map(normalizeSupplierEntry).filter((s) => s.businessName !== null),
    changeLogFromAgent: arr(changeLogFromAgent).map(normalizeChangeLog).filter((c) => c && c.description !== null),
  };
};

export default buildParsedImport;
