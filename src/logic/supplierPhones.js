/**
 * supplierPhones.js — H2 phone facts. Pure: no storage, no UI, no guessing.
 *
 * The mobile/landline distinction is made on the **national form** (leading 0
 * kept), exactly as the instruction specifies:
 *
 *     ^01\d   -> mobile
 *     ^0[3-9] -> landline
 *     else    -> unknown
 *
 * Any accepted input ("+6012-700 8939", "60127008939", "0127008939",
 * "012-700 8939") collapses to 0127008939 first, so the rule sees one shape.
 * A cell holding several numbers is split on `/ , ; &` or the word "or" before
 * classification: "082-455 809 / 016-867 7888" is a landline plus a mobile.
 *
 * WhatsApp eligibility reuses the shipped normaliser (quickOrder.js). It is NOT
 * forked here: that function is the single definition of "digits wa.me will
 * accept", and Quick Order keeps calling it unchanged.
 */
import { normalizePhoneForWhatsApp } from './quickOrder.js';

/** Split a raw contact cell into candidate numbers ("/ , ; & or"). */
export const splitPhoneSegments = (raw) => {
  if (raw === null || raw === undefined) return [];
  const text = String(raw).trim();
  if (!text) return [];
  return text
    .split(/\s*(?:\/|,|;|&|\bor\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
};

/**
 * National form with the leading 0 kept ('6082455809' -> '082455809').
 * Returns null when the segment carries no digits at all.
 */
export const toNationalForm = (raw) => {
  const [segment = ''] = splitPhoneSegments(raw);
  let digits = segment.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('60') && digits.length > 2) digits = `0${digits.slice(2)}`;
  if (digits.startsWith('0')) return digits;
  // International (+65…) or a bare local without 0: not classifiable.
  return null;
};

/** 'mobile' | 'landline' | 'unknown' for one number. */
export const classifyPhone = (raw) => {
  const national = toNationalForm(raw);
  if (!national) return 'unknown';
  if (/^01\d/.test(national)) return 'mobile';
  if (/^0[3-9]/.test(national)) return 'landline';
  return 'unknown';
};

/** Every number in a multi-number cell, classified, in the order written. */
export const classifySegments = (raw) =>
  splitPhoneSegments(raw).map((segment) => ({
    number: segment,
    national: toNationalForm(segment),
    kind: classifyPhone(segment),
  }));

/** True when at least one number in the cell is a mobile (WhatsApp-capable). */
export const hasMobileNumber = (raw) =>
  splitPhoneSegments(raw).some((segment) => classifyPhone(segment) === 'mobile');

/** True when the cell is empty, blank or the literal "NULL". */
export const isBlankContact = (raw) => {
  const text = String(raw ?? '').trim();
  return !text || /^null$/i.test(text);
};

/** True when wa.me would accept the number (the shipped normaliser's verdict). */
export const isUsableNumber = (raw) => normalizePhoneForWhatsApp(raw) !== null;

/**
 * WhatsApp-capable = a mobile that wa.me also accepts. Kind alone is not enough:
 * the seed holds "011345238888" (13 digits, a typo of 011-3452 3888) which is a
 * mobile by prefix but un-usable as a link. Found by the evidence run.
 */
export const isWhatsAppCapable = (raw) =>
  splitPhoneSegments(raw).some(
    (segment) => classifyPhone(segment) === 'mobile' && isUsableNumber(segment)
  );

/** 2+ numbers in one cell -> a split proposal is offered (H2). Blank/"NULL" = 0. */
export const countNumbers = (raw) => (isBlankContact(raw) ? 0 : splitPhoneSegments(raw).length);

/**
 * Proposed split for a multi-number cell. Returns null when there is nothing to
 * split, so the UI never shows a suggestion that would change nothing.
 */
export const proposePhoneSplit = (raw) => {
  const segments = classifySegments(raw);
  if (segments.length < 2) return null;
  return segments.map(({ number, national, kind }) => ({ number, national, kind }));
};

/**
 * wa.me digits for the number the hub should offer. Prefers the first mobile in
 * the cell, then any number the shipped normaliser accepts. Returns
 * { digits, kind } or null. Landlines ARE returned (with kind 'landline') so the
 * caller can render a Call button — the caller decides WhatsApp eligibility from
 * `kind`, so a landline can never be offered WhatsApp by accident.
 */
export const preferredNumber = (raw) => {
  const segments = classifySegments(raw);
  const mobile = segments.find((s) => s.kind === 'mobile');
  const pick = mobile || segments.find((s) => normalizePhoneForWhatsApp(s.number));
  if (!pick) return null;
  const digits = normalizePhoneForWhatsApp(pick.number);
  return digits ? { digits, kind: pick.kind, number: pick.number } : null;
};
