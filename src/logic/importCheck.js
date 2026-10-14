/**
 * importCheck.js — Part A: BOM accuracy checker for AI-generated BOMs.
 *
 * Pure function. checkBomRows(rows) → findings[].
 * Finding = { rowId, rule, message }
 *
 * Rules:
 *   R1 line total  — purchaseQty × unitCost vs estTotal; flag if gap > max(0.01, 0.5% of estTotal)
 *   R2 under-buy   — purchaseQty < netQty or below netQty × (1 + wastagePct/100)
 *   R3 provenance  — basis is A/NS, or confidence is low; AI admitting weakness
 *   R4 essentials  — purchaseQty missing/≤0, unit empty, price is neither number nor TBD marker
 *   R5 duplicates  — same normalised item+spec twice in one project
 *
 * Ground rules (from instruction):
 * - TBD is not zero and not an error. Skip any rule whose input is null or TBD.
 * - Findings are computed on read, never stored.
 * - Never blocks a PO or the Confirm flow.
 */

/** Normalise item+spec key for duplicate detection. */
const normKey = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** Is a value the TBD sentinel (null, undefined, empty string, or "TBD" dash variants)? */
const isTbd = (v) => {
  if (v === null || v === undefined) return true;
  const s = String(v).trim().toUpperCase();
  return s === '' || s === 'TBD' || s === '—' || s === '-';
};

/**
 * Is this a valid numeric price? Returns true only for a finite, non-null number.
 * A TBD marker is NOT a valid price, but is also NOT a malformed price (R4 skips it).
 */
const isValidPrice = (v) => typeof v === 'number' && Number.isFinite(v);

/** Low confidence markers. */
const LOW_CONFIDENCE = new Set(['low', 'l', 'uncertain', 'estimated', 'assumed', 'guess']);
const isLowConfidence = (v) => {
  if (!v) return false;
  return LOW_CONFIDENCE.has(String(v).trim().toLowerCase());
};

/** Weak basis markers: A = assumption, NS = not specified. */
const WEAK_BASIS = new Set(['a', 'ns', 'assumption', 'not specified']);
const isWeakBasis = (v) => {
  if (!v) return false;
  return WEAK_BASIS.has(String(v).trim().toLowerCase());
};

/**
 * R4: is this a malformed price value? True only when it's neither null/TBD
 * nor a valid number — e.g. "TBC", "pending", "check", "N.A", "??".
 * Does NOT flag null/undefined/TBD — those are legitimately unpriced.
 */
const isMalformedPrice = (v) => {
  if (isTbd(v)) return false;          // null/TBD is acceptable
  if (isValidPrice(v)) return false;   // proper number is fine
  const s = String(v).trim().toUpperCase();
  // Numeric strings are fine
  if (/^-?\d+(\.\d+)?$/.test(s)) return false;
  return true;                         // non-numeric, non-TBD string → malformed
};

/**
 * Check a list of BOM rows for accuracy problems.
 *
 * @param {Array<{
 *   id: string,
 *   item: string|null,
 *   spec: string|null,
 *   netQty: number|null,
 *   wastagePct: number|null,
 *   purchaseQty: number|null,
 *   unitCost: number|null,
 *   estTotal: number|null,
 *   basis: string|null,
 *   confidence: string|null,
 *   unit: string|null,
 * }>} rows
 * @returns {Array<{rowId: string, rule: string, message: string}>}
 */
export const checkBomRows = (rows) => {
  if (!Array.isArray(rows)) return [];

  const findings = [];

  /** Push a finding for a row. */
  const flag = (rowId, rule, message) => findings.push({ rowId, rule, message });

  // ── R5 duplicate scan (full pass first so we know which are dupes) ──────
  const seen = new Map(); // normKey → first rowId
  const dupeIds = new Set();
  for (const row of rows) {
    const k = normKey(row.item) + '|' + normKey(row.spec);
    if (k === '|') continue; // blank item — skip R5
    if (seen.has(k)) {
      dupeIds.add(row.id);
      // Also flag the first occurrence (only once)
      if (!dupeIds.has(seen.get(k))) {
        dupeIds.add(seen.get(k));
      }
    } else {
      seen.set(k, row.id);
    }
  }

  for (const row of rows) {
    const id = row.id;
    const itemLabel = String(row.item ?? '(no name)').trim();

    // ── R3 provenance — surface first because it's the AI admitting weakness ──
    if (isWeakBasis(row.basis)) {
      flag(id, 'R3', `"${itemLabel}": basis is "${row.basis}" (assumption or not specified) — verify with drawings.`);
    }
    if (isLowConfidence(row.confidence)) {
      flag(id, 'R3', `"${itemLabel}": confidence is "${row.confidence}" — AI flagged this value as uncertain.`);
    }

    // ── R1 line total: purchaseQty × unitCost vs estTotal ──────────────────
    // Skip if any input is TBD/null
    if (!isTbd(row.purchaseQty) && !isTbd(row.unitCost) && !isTbd(row.estTotal)) {
      const q = Number(row.purchaseQty);
      const c = Number(row.unitCost);
      const t = Number(row.estTotal);
      if (Number.isFinite(q) && Number.isFinite(c) && Number.isFinite(t)) {
        const expected = Math.round(q * c * 1e4) / 1e4;
        const tolerance = Math.max(0.01, Math.abs(t) * 0.005);
        const gap = Math.abs(expected - t);
        if (gap > tolerance) {
          flag(
            id,
            'R1',
            `"${itemLabel}": line total mismatch — expected RM ${expected.toFixed(2)} (Qty × Price) but file shows RM ${t.toFixed(2)} (gap RM ${gap.toFixed(2)}).`
          );
        }
      }
    }

    // ── R2 under-buy: purchaseQty vs netQty (with/without wastage) ─────────
    if (!isTbd(row.purchaseQty) && !isTbd(row.netQty)) {
      const purchaseQty = Number(row.purchaseQty);
      const netQty = Number(row.netQty);
      if (Number.isFinite(purchaseQty) && Number.isFinite(netQty) && netQty > 0) {
        // wastagePct: normalize.js stores it as the raw percent (e.g. 20 means 20%, not 0.20)
        const wastage = typeof row.wastagePct === 'number' && Number.isFinite(row.wastagePct)
          ? row.wastagePct / 100
          : 0;
        const required = netQty * (1 + wastage);
        const gap = required - purchaseQty;
        if (purchaseQty < netQty) {
          flag(
            id,
            'R2',
            `"${itemLabel}": purchase qty ${purchaseQty} is less than net qty ${netQty} — under-buying.`
          );
        } else if (wastage > 0 && purchaseQty < required && gap > 0.1) {
          flag(
            id,
            'R2',
            `"${itemLabel}": purchase qty ${purchaseQty} is below net qty ${netQty} × (1 + ${row.wastagePct}% wastage) = ${required.toFixed(2)} — under-buying with wastage.`
          );
        }
      }
    }

    // ── R4 missing essentials ────────────────────────────────────────────────
    if (isTbd(row.purchaseQty) || Number(row.purchaseQty) <= 0) {
      // Only flag if it was not explicitly TBD — a zero is always suspicious
      if (!isTbd(row.purchaseQty)) {
        flag(id, 'R4', `"${itemLabel}": purchase qty is ${row.purchaseQty} (must be > 0).`);
      }
      // null/TBD purchaseQty is R4 as well
      if (row.purchaseQty === null || row.purchaseQty === undefined) {
        flag(id, 'R4', `"${itemLabel}": purchase qty is missing.`);
      }
    }
    if (!row.unit || String(row.unit).trim() === '') {
      flag(id, 'R4', `"${itemLabel}": unit is empty.`);
    }
    if (isMalformedPrice(row.unitCost)) {
      flag(
        id,
        'R4',
        `"${itemLabel}": unit cost is "${row.unitCost}" — not a number and not TBD. Change to a number or leave blank.`
      );
    }

    // ── R5 duplicates ────────────────────────────────────────────────────────
    if (dupeIds.has(id)) {
      const k = normKey(row.item) + (row.spec ? ` / ${normKey(row.spec)}` : '');
      flag(id, 'R5', `"${itemLabel}": appears more than once in this import (duplicate: "${k}").`);
    }
  }

  // Sort: R3 and R1 first, then by estTotal descending
  const ruleOrder = { R3: 0, R1: 1, R2: 2, R4: 3, R5: 4 };
  // Build a map from rowId → estTotal for sort
  const totalMap = new Map(rows.map((r) => [r.id, Number(r.estTotal ?? 0) || 0]));

  findings.sort((a, b) => {
    const ro = (ruleOrder[a.rule] ?? 99) - (ruleOrder[b.rule] ?? 99);
    if (ro !== 0) return ro;
    return totalMap.get(b.rowId) - totalMap.get(a.rowId); // higher total first
  });

  return findings;
};

export default { checkBomRows };
