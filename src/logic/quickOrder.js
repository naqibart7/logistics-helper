/**
 * quickOrder.js — Fast Supplier Ordering (pure logic, no storage, no UI).
 *
 * Separate, lighter action beside the formal PO flow: no price needed, only
 * item + spec + qty + unit. poGate.js / poDocument.js untouched.
 *
 * Reference rule: a Confirm entry references an item ONLY through an explicit
 * (refItem, refSpec) payload matched by itemKey — i.e. new/removed pendings.
 * agent_question rows carry no item ref, so they never exclude a single item
 * (they still block the formal PO globally). Anything else would be inference.
 */
import { itemKey } from './itemMatcher.js';
import { byDisplayOrder } from '../utils/helpers.js';

/** Reference keys of open Confirm entries that point at specific items. */
export const confirmRefKeys = (openConfirmItems) => {
  const keys = new Set();
  for (const e of openConfirmItems || []) {
    if (e.refItem == null && e.refSpec == null) continue; // no explicit ref: matches nothing
    keys.add(itemKey(e.refItem, e.refSpec));
  }
  return keys;
};

/**
 * Split a supplier's items into orderable vs excluded, in BOM display order
 * (so message line numbers match what the supervisor sees on screen).
 * @returns {{ eligible: BomItem[], excluded: BomItem[] }}
 */
export const eligibleOrderItems = (bomItems, supplierId, openConfirmItems) => {
  const refs = confirmRefKeys(openConfirmItems);
  const owned = byDisplayOrder((bomItems || []).filter((b) => b.assignedSupplierId === supplierId));
  const eligible = [];
  const excluded = [];
  for (const b of owned) {
    const explicitlyBlocked = refs.has(itemKey(b.item, b.spec));
    // fromStock = "taking this from the shelf, not ordering it" → always excluded.
    // doubtful is a visual-only flag (Annex E restored): it does NOT change quick-order eligibility.
    const fromStock = b.fromStock === true;
    if (explicitlyBlocked || fromStock) {
      excluded.push(b);
    } else {
      eligible.push(b);
    }
  }
  return { eligible, excluded };
};

const qtyText = (b) => `${b.purchaseQty ?? 'TBD'}${b.unit ? ` ${b.unit}` : ''}`.trim();

/**
 * Deterministic message, byte-stable. Built field-by-field from storage —
 * no prices, no summarization, no rounding beyond what's stored.
 */
export const buildQuickOrderMessage = ({ projectName, supplierName, lines, note }) => {
  const body = (lines || [])
    .map((l, i) => `${i + 1}. ${l.item} — ${l.spec || '-'} — ${qtyText(l)}`)
    .join('\n');
  return (
    `Order — ${projectName}\n` +
    `Supplier: ${supplierName}\n\n` +
    `${body}\n\n` +
    `Please confirm availability & delivery date. Thank you.` +
    (note && String(note).trim() ? `\nNote: ${String(note).trim()}` : '')
  );
};

/**
 * Normalize a free-typed phone number to wa.me digits (Malaysia default 60).
 * Returns null for anything implausible — the caller blocks ordering instead
 * of guessing. Multi-number cells ("a / b") resolve deterministically to the
 * FIRST segment; 'NULL'/blank/garbage resolve to null.
 */
export const normalizePhoneForWhatsApp = (raw, defaultCountry = '60') => {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s || /^null$/i.test(s)) return null;
  s = s.split('/')[0].trim(); // first segment, deterministically
  const hasPlus = s.startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return null;
  if (hasPlus) {
    // digits already exclude the '+'
  } else if (digits.startsWith('0') && !digits.startsWith('00')) {
    digits = defaultCountry + digits.slice(1);
  }
  // Plausible shape only: country-prefixed, 10–12 digits total. Else null.
  if (!new RegExp(`^${defaultCountry}\\d{8,10}$`).test(digits)) return null;
  return digits;
};

/** wa.me deep link, or null when the number is unusable (caller shows the fix prompt). */
export const buildQuickOrderLink = (contact, message) => {
  const digits = normalizePhoneForWhatsApp(contact);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};

export default {
  confirmRefKeys,
  eligibleOrderItems,
  buildQuickOrderMessage,
  normalizePhoneForWhatsApp,
  buildQuickOrderLink,
};
