/**
 * supplier_audit.mjs — the instruction's "evidence run" (H0/evidence step).
 *
 * Runs the SHIPPING classifier (src/logic/supplierPhones.js) and the SHIPPING
 * flag rules (src/logic/supplierFlags.js) over the 130 seeded suppliers, so the
 * numbers pasted into the report are the numbers the UI will show.
 *
 *     node scripts/supplier_audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifySegments, countNumbers, isBlankContact, isUsableNumber, isWhatsAppCapable, toNationalForm } from '../src/logic/supplierPhones.js';
import { FLAG_LABELS, FLAG_ORDER, computeSupplierFlags, summarizeFlags } from '../src/logic/supplierFlags.js';
import { normalizePhoneForWhatsApp } from '../src/logic/quickOrder.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, '..', 'src', 'data', 'seedSuppliers.json');
const rows = JSON.parse(fs.readFileSync(seedPath, 'utf8')).map((r, i) => ({ id: `seed-${i}`, ...r }));

// ── classifier, per record ────────────────────────────────────────────────────
let mobile = 0;
let landlineOnly = 0;
let unknownOnly = 0;
let noContact = 0;
let multiNumber = 0;
const kindsSeen = { mobile: 0, landline: 0, unknown: 0 };

for (const row of rows) {
  if (isBlankContact(row.contact)) {
    noContact += 1;
    continue;
  }
  if (countNumbers(row.contact) >= 2) multiNumber += 1;
  const kinds = classifySegments(row.contact).map((s) => s.kind);
  for (const kind of kinds) kindsSeen[kind] += 1;
  if (isWhatsAppCapable(row.contact)) mobile += 1;
  else if (classifySegments(row.contact).some((s) => s.kind === 'landline' && isUsableNumber(s.number))) landlineOnly += 1;
  else unknownOnly += 1;
}

// ── Quick Order baseline: which suppliers produce a wa.me link today ──────────
const quickOrderWorks = rows.filter((r) => normalizePhoneForWhatsApp(r.contact) !== null);

// ── H3 flags ─────────────────────────────────────────────────────────────────
const summary = summarizeFlags(rows);
const flagsById = computeSupplierFlags(rows);

const pct = (n) => `${((n / rows.length) * 100).toFixed(0)}%`;
console.log(`Suppliers in the seed: ${rows.length}\n`);

console.log('Classifier (national form, leading 0 kept)');
console.log(`  has at least one mobile (WhatsApp-capable): ${mobile} (${pct(mobile)})`);
console.log(`  landline only (cannot WhatsApp)           : ${landlineOnly} (${pct(landlineOnly)})`);
console.log(`  unknown only (unparseable)                : ${unknownOnly} (${pct(unknownOnly)})`);
console.log(`  no contact at all                         : ${noContact} (${pct(noContact)})`);
console.log(`  several numbers in one cell               : ${multiNumber} (${pct(multiNumber)})`);
console.log(`  numbers seen: mobile ${kindsSeen.mobile}, landline ${kindsSeen.landline}, unknown ${kindsSeen.unknown}\n`);

console.log('H3 flags (a record can carry several)');
for (const key of FLAG_ORDER) {
  const count = summary.perFlag[key];
  console.log(`  ${FLAG_LABELS[key].padEnd(28)} ${String(count).padStart(3)} (${pct(count)})`);
}
console.log(`  ${'NEVER VERIFIED (separate chip)'.padEnd(28)} ${String(summary.neverVerified).padStart(3)} (${pct(summary.neverVerified)})`);
console.log(`\n  HEADLINE "N records need attention": ${summary.needsAttention} of ${summary.total} (${pct(summary.needsAttention)})`);
console.log(`\nQuick Order baseline: ${quickOrderWorks.length} of ${rows.length} produce a wa.me link today (must stay identical)`);

// ── examples, so the numbers can be checked by eye ───────────────────────────
const show = (title, pick, n = 3) => {
  console.log(`\n${title}`);
  for (const row of rows.filter(pick).slice(0, n)) {
    console.log(`  - ${row.businessName} | contact=${JSON.stringify(row.contact)} | address=${JSON.stringify((row.address || '').slice(0, 40))} | flags=${(flagsById.get(row.id).flags || []).join(',')}`);
  }
};

show('Landline-only examples', (r) => !isBlankContact(r.contact) && !classifySegments(r.contact).some((s) => s.kind === 'mobile') && classifySegments(r.contact).some((s) => s.kind === 'landline'));
show('Several-numbers examples', (r) => countNumbers(r.contact) >= 2);
show('Possible-duplicate examples', (r) => (flagsById.get(r.id).flags || []).includes('possible_duplicate'), 4);
show('Malformed examples', (r) => (flagsById.get(r.id).flags || []).includes('malformed'), 4);

const multiSample = rows.find((r) => countNumbers(r.contact) >= 2);
if (multiSample) {
  console.log(`\nProposed split for "${multiSample.businessName}":`);
  for (const proposed of classifySegments(multiSample.contact)) {
    console.log(`  ${JSON.stringify(proposed.number).padEnd(18)} national=${(proposed.national || '—').padEnd(12)} kind=${proposed.kind}`);
  }
}
console.log(`\nNational-form spot checks: ${['+60172820616', '082-455 809', '016-867 7888', '60123456791', 'NULL'].map((v) => `${JSON.stringify(v)} -> ${toNationalForm(v) ?? 'null'}`).join(' | ')}`);
