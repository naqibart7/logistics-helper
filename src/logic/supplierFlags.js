/**
 * supplierFlags.js — H3 "needs attention". Computed on read, never stored.
 *
 * Six flags, each a plain fact about the stored row. No score, no percentage,
 * no celebration. "Never verified" is deliberately NOT one of them: it would
 * flag every seeded row and hide the real problems, so it travels separately.
 *
 * The two contact flags are kept mutually exclusive on purpose (a cell that
 * cannot be used is "malformed", not also "no mobile"):
 *     no_mobile -> a usable landline exists, but no mobile can be found
 *     malformed -> nothing in the cell can be used as written (garbage, or a
 *                  wrong-length number like the seed's 13-digit 011345238888)
 * That split is what the seeded data needed: "no mobile" is actionable ("ask for
 * a mobile"), "malformed" means the number itself has to be retyped.
 */
import { classifySegments, countNumbers, isBlankContact, isUsableNumber, isWhatsAppCapable } from './supplierPhones.js';
import { normalizeKey } from './mergeEngine.js';

export const FLAG_LABELS = {
  no_contact: 'No contact',
  no_mobile: 'No mobile number',
  malformed: 'Malformed number',
  several_numbers: 'Several numbers in one field',
  no_area_or_address: 'No area or address',
  possible_duplicate: 'Possible duplicate',
};

/** Chip order in the hub: worst first, duplicates last (they need a decision, not a fix). */
export const FLAG_ORDER = [
  'no_contact',
  'malformed',
  'no_mobile',
  'several_numbers',
  'no_area_or_address',
  'possible_duplicate',
];

export const NEVER_VERIFIED = 'never_verified';

const blank = (v) => v === null || v === undefined || String(v).trim() === '';

/** Numbers written in national form, for comparing two records' phones. */
const nationalNumbers = (supplier) =>
  classifySegments(supplier && supplier.contact)
    .map((segment) => segment.national)
    .filter(Boolean);

/**
 * Compute the flags for a whole list at once: `possible_duplicate` is a fact
 * about the list, not about one row.
 * @returns {Map<string, {flags: string[], neverVerified: boolean, needsAttention: boolean}>}
 */
export const computeSupplierFlags = (suppliers) => {
  const rows = Array.isArray(suppliers) ? suppliers : [];

  // same number on two records
  const byNumber = new Map();
  for (const row of rows) {
    for (const national of nationalNumbers(row)) {
      if (!byNumber.has(national)) byNumber.set(national, new Set());
      byNumber.get(national).add(row.id);
    }
  }
  const duplicateByNumber = new Set();
  for (const ids of byNumber.values()) {
    if (ids.size > 1) ids.forEach((id) => duplicateByNumber.add(id));
  }

  // same normalised name, different addresses
  const byName = new Map();
  for (const row of rows) {
    const name = normalizeKey(row.businessName);
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push({ id: row.id, address: normalizeKey(row.address) });
  }
  const duplicateByName = new Set();
  for (const group of byName.values()) {
    if (group.length < 2) continue;
    if (new Set(group.map((g) => g.address)).size > 1) group.forEach((g) => duplicateByName.add(g.id));
  }

  const result = new Map();
  for (const row of rows) {
    const flags = [];
    if (isBlankContact(row.contact)) {
      flags.push('no_contact');
    } else if (isWhatsAppCapable(row.contact)) {
      // has at least one number that can actually take a WhatsApp order
    } else if (classifySegments(row.contact).some((s) => s.kind === 'landline' && isUsableNumber(s.number))) {
      flags.push('no_mobile'); // a landline exists: ask for a mobile
    } else {
      flags.push('malformed'); // nothing in the cell can be used as written
    }
    if (countNumbers(row.contact) >= 2) flags.push('several_numbers');
    if (blank(row.area) && blank(row.address)) flags.push('no_area_or_address');
    if (duplicateByNumber.has(row.id) || duplicateByName.has(row.id)) flags.push('possible_duplicate');

    const neverVerified = blank(row.verifiedDate);
    result.set(row.id, {
      flags,
      neverVerified,
      needsAttention: flags.length > 0,
    });
  }
  return result;
};

/** Counts per flag over a list (the hub chips). Headline excludes never-verified. */
export const summarizeFlags = (suppliers) => {
  const rows = Array.isArray(suppliers) ? suppliers : [];
  const perFlag = Object.fromEntries(FLAG_ORDER.map((key) => [key, 0]));
  let needsAttention = 0;
  let neverVerified = 0;

  for (const { flags, neverVerified: unverified, needsAttention: attention } of computeSupplierFlags(rows).values()) {
    for (const flag of flags) perFlag[flag] += 1;
    if (attention) needsAttention += 1;
    if (unverified) neverVerified += 1;
  }

  return {
    total: rows.length,
    needsAttention,
    perFlag,
    labels: FLAG_LABELS,
    neverVerified,
  };
};

export default { computeSupplierFlags, summarizeFlags, FLAG_LABELS, FLAG_ORDER, NEVER_VERIFIED };
