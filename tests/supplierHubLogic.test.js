/**
 * supplierHubLogic.test.js — the pure half of the Supplier Hub (H2/H3).
 *
 * Phone facts and flags are computed on read from real data, so the tests use
 * real numbers from the seeded directory (and the whole seed for the counts the
 * audit in docs/supplier-hub-audit.md quotes).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

import {
  classifyPhone,
  countNumbers,
  isBlankContact,
  isUsableNumber,
  isWhatsAppCapable,
  preferredNumber,
  proposePhoneSplit,
  splitPhoneSegments,
  toNationalForm,
} from '../src/logic/supplierPhones.js';
import { computeSupplierFlags, summarizeFlags } from '../src/logic/supplierFlags.js';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  fs.readFileSync(path.join(testDir, '..', 'src', 'data', 'seedSuppliers.json'), 'utf8')
).map((row, i) => ({ id: `seed-${i}`, ...row }));

describe('national form and kind (real seed numbers)', () => {
  it('collapses every accepted spelling to the national form, leading 0 kept', () => {
    // Houses Lightings (seed) — international form
    expect(toNationalForm('+60172820616')).toBe('0172820616');
    // Sin Ban Lee Hardware (seed) — Kuala Lumpur landline in international form
    expect(toNationalForm('+60392213533')).toBe('0392213533');
    // the instruction's Sarawak example
    expect(toNationalForm('082-455 809')).toBe('082455809');
    expect(toNationalForm('60123456791')).toBe('0123456791');
    expect(toNationalForm('012-700 8939')).toBe('0127008939');
  });

  it('classifies mobile / landline / unknown from the national form only', () => {
    expect(classifyPhone('+60172820616')).toBe('mobile');
    expect(classifyPhone('016-867 7888')).toBe('mobile');
    expect(classifyPhone('+60392213533')).toBe('landline');
    expect(classifyPhone('082-455 809')).toBe('landline'); // Sarawak 082 is a landline
    expect(classifyPhone('083-322 100')).toBe('landline');
    expect(classifyPhone('NULL')).toBe('unknown');
    expect(classifyPhone('')).toBe('unknown');
    expect(classifyPhone('+6591234567')).toBe('unknown'); // not a Malaysian national form
  });

  it('treats "NULL", blank and whitespace as no contact', () => {
    expect(isBlankContact('NULL')).toBe(true);
    expect(isBlankContact('null')).toBe(true);
    expect(isBlankContact('   ')).toBe(true);
    expect(isBlankContact(null)).toBe(true);
    expect(isBlankContact('+60172820616')).toBe(false);
  });

  it('splits several numbers on / , ; & or "or"', () => {
    expect(splitPhoneSegments('082-455 809 / 016-867 7888')).toHaveLength(2);
    expect(splitPhoneSegments('03-9221 3533; 012-345 6789')).toHaveLength(2);
    expect(splitPhoneSegments('0123456789 & 0112345678')).toHaveLength(2);
    expect(splitPhoneSegments('0123456789 or 0112345678')).toHaveLength(2);
    expect(splitPhoneSegments('0123456789')).toHaveLength(1);
    expect(countNumbers('NULL')).toBe(0);
  });

  it('separates kind from usability: 011345238888 is a mobile prefix but wa.me rejects it', () => {
    // LKS KLASSE HOME INTERIOR SDN BHD in the seed — the one broken Quick Order link
    expect(classifyPhone('011345238888')).toBe('mobile');
    expect(isUsableNumber('011345238888')).toBe(false);
    expect(isWhatsAppCapable('011345238888')).toBe(false);
    // and a real mobile is usable
    expect(isWhatsAppCapable('+60172820616')).toBe(true);
  });
});

describe('split proposal and preferred number', () => {
  it('proposes the split only when the cell really holds several numbers', () => {
    expect(proposePhoneSplit('+60172820616')).toBeNull();
    expect(proposePhoneSplit('NULL')).toBeNull();
    const proposal = proposePhoneSplit('082-455 809 / 016-867 7888');
    expect(proposal).toEqual([
      { number: '082-455 809', national: '082455809', kind: 'landline' },
      { number: '016-867 7888', national: '0168677888', kind: 'mobile' },
    ]);
  });

  it('prefers the first mobile, and falls back to any usable number (landline included)', () => {
    const mixed = preferredNumber('082-455 809 / 016-867 7888');
    expect(mixed.kind).toBe('mobile');
    expect(mixed.digits).toBe('60168677888'); // wa.me digits, not the national form

    const landline = preferredNumber('+60392213533');
    expect(landline).toEqual({ digits: '60392213533', kind: 'landline', number: '+60392213533' });

    expect(preferredNumber('NULL')).toBeNull();
    expect(preferredNumber('011345238888')).toBeNull();
  });
});

describe('H3 flags', () => {
  const rows = [
    { id: 'a', businessName: 'Mobile Shop', contact: '+60172820616', address: 'Puchong' },
    { id: 'b', businessName: 'Landline Shop', contact: '+60392213533', address: 'Pudu' },
    { id: 'c', businessName: 'Broken Shop', contact: '011345238888', address: 'Klang' },
    { id: 'd', businessName: 'No Contact Shop', contact: 'NULL', address: 'Kajang' },
    { id: 'e', businessName: 'Two Numbers', contact: '082-455 809 / 016-867 7888', address: 'Betong' },
    { id: 'f', businessName: 'No Address Shop', contact: '+60127123211', address: '' },
    { id: 'g', businessName: 'Twin A', contact: '+60123456791', address: 'Selangor' },
    { id: 'h', businessName: 'Twin B', contact: '0123456791', address: 'Kuala Lumpur' },
    { id: 'i', businessName: 'Same Name', contact: '+60111111111', address: 'Same Street' },
    { id: 'j', businessName: 'Same Name', contact: '+60122222222', address: 'Same Street' },
  ];
  const flags = computeSupplierFlags(rows);

  it('flags a missing contact and a landline-only record differently', () => {
    expect(flags.get('d').flags).toContain('no_contact');
    expect(flags.get('b').flags).toEqual(['no_mobile']);
    expect(flags.get('a').flags).toEqual([]);
  });

  it('flags a number nothing can use as malformed, not as "no mobile"', () => {
    expect(flags.get('c').flags).toContain('malformed');
    expect(flags.get('c').flags).not.toContain('no_mobile');
  });

  it('flags several numbers, an unknown area/address, and both duplicate rules', () => {
    expect(flags.get('e').flags).toContain('several_numbers');
    expect(flags.get('e').flags).not.toContain('no_mobile'); // one of them is a mobile
    expect(flags.get('f').flags).toContain('no_area_or_address');
    // same national number written two different ways
    expect(flags.get('g').flags).toContain('possible_duplicate');
    expect(flags.get('h').flags).toContain('possible_duplicate');
    // same name AND same address is the import dedupe key, not a duplicate
    expect(flags.get('i').flags).not.toContain('possible_duplicate');
    expect(flags.get('j').flags).not.toContain('possible_duplicate');
  });

  it('counts a record once in the headline and keeps never-verified out of it', () => {
    const summary = summarizeFlags(rows);
    expect(summary.total).toBe(10);
    // b, c, d, e, f, g, h need attention; a, i, j do not
    expect(summary.needsAttention).toBe(7);
    expect(summary.perFlag.no_contact).toBe(1);
    expect(summary.perFlag.no_mobile).toBe(1);
    expect(summary.perFlag.malformed).toBe(1);
    expect(summary.perFlag.several_numbers).toBe(1);
    expect(summary.perFlag.no_area_or_address).toBe(1);
    expect(summary.perFlag.possible_duplicate).toBe(2);
    // no verifiedDate anywhere -> the chip is 10, the headline stays 7
    expect(summary.neverVerified).toBe(10);
    expect(summary.needsAttention).toBeLessThan(summary.total);
  });

  it('clears each flag when the data is fixed (computed on read)', () => {
    const fixed = rows.map((row) =>
      row.id === 'b' ? { ...row, contact: '+60172820616' } : row
    );
    const after = computeSupplierFlags(fixed);
    expect(after.get('b').flags).not.toContain('no_mobile');
  });
});

describe('the seeded directory (locks the audit numbers in docs/supplier-hub-audit.md)', () => {
  it('is 130 records with 96 mobile / 33 landline-only / 1 unusable', () => {
    expect(seed).toHaveLength(130);
    const whatsapp = seed.filter((r) => isWhatsAppCapable(r.contact)).length;
    const landlineOnly = seed.filter(
      (r) => !isWhatsAppCapable(r.contact)
        && splitPhoneSegments(r.contact).some((s) => classifyPhone(s) === 'landline' && isUsableNumber(s))
    ).length;
    const unusable = seed.filter((r) => !isBlankContact(r.contact)).length - whatsapp - landlineOnly;
    expect({ whatsapp, landlineOnly, unusable }).toEqual({ whatsapp: 96, landlineOnly: 33, unusable: 1 });
  });

  it('needs attention on 45 of 130 and never-verified on all 130', () => {
    const summary = summarizeFlags(seed);
    expect(summary.needsAttention).toBe(45);
    expect(summary.perFlag.no_mobile).toBe(33);
    expect(summary.perFlag.malformed).toBe(1);
    expect(summary.perFlag.no_area_or_address).toBe(8);
    expect(summary.perFlag.possible_duplicate).toBe(4);
    expect(summary.perFlag.no_contact).toBe(0);
    expect(summary.perFlag.several_numbers).toBe(0);
    expect(summary.neverVerified).toBe(130);
  });
});
