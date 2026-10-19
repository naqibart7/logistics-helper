# Supplier Hub — H0 audit and evidence run

Source: `TRAE_INSTRUCTION_SUPPLIER_HUB.md` (14 Oct 2026). This file is the audit + evidence the
instruction asks for **before** any UI is built, plus the decisions taken from it.

Reproduce the numbers with `node scripts/supplier_audit.mjs` (it imports the shipping classifier and
flag rules, so the counts here are the counts the hub will show).

---

## H0 — what the in-project Suppliers tab already has

| Capability | In-project tab today | Where | Hub needs |
|---|---|---|---|
| Add supplier | ✅ present | `SuppliersScreen` "Add supplier" modal → `linkSupplierEntry` (name+address dedupe) | reuse |
| Edit supplier | ✅ present | inline edit form → `updateSupplier` | reuse |
| Delete supplier | ✅ present, blocked when linked | `deleteSupplier` + `countSupplierProjectLinks`, message "used in N projects" | reuse (same rule in hub mode) |
| WhatsApp | ✅ present | `wa.me` from `normalizePhoneForWhatsApp(contact)` + "Fix number" fallback | replace with kind-aware buttons (H2) |
| Call | ✅ present | `tel:` link | keep, extend to every number |
| Tags | ✅ present | tag chips + form field, filters the list | reuse |
| Verified date (B3) | ✅ present | "Verified 14 Oct 2026" badge + toggle | keep |
| CSV import | ✅ present | `Import CSV` → header-based parse → dry-run preview → confirm | move to hub (H6) |
| CSV export | ✅ present | `Export CSV` → `supplier-directory.csv` | append new columns at the end (H6) |
| Search | ✅ present | name/placeholder search | reuse |
| Filters | ✅ present | tag chips + region via address text | reuse, add flag chips (H3) |
| Top-level entry | ❌ missing | only reachable inside a project | **H1** |
| `phones[]` with kind | ❌ missing | one `contact` string, kind unknown | **H2** |
| Landline-aware actions | ❌ missing | WhatsApp is offered for any parsable number, including landlines | **H2** |
| Split proposal | ❌ missing | nothing detects several numbers in one cell | **H2** |
| Contact person / email / area / archived | ❌ missing | — | **H2** |
| Needs-attention flags | ❌ missing | — | **H3** |
| Duplicate review + merge | ❌ missing | — | **H4** |
| Usage facts | ❌ missing | — | **H5** |

Nothing on the list had to be built twice: the hub reuses this screen, its editor and the same repo
functions (the instruction's "one implementation" rule).

---

## Evidence run — 130 seeded suppliers

```
Classifier (national form, leading 0 kept: ^01\d mobile | ^0[3-9] landline | else unknown)
  has at least one mobile (WhatsApp-capable):  96 (74%)
  landline only (cannot WhatsApp)           :  33 (25%)
  unknown only (unparseable)                :   1 (1%)
  no contact at all                         :   0 (0%)
  several numbers in one cell               :   0 (0%)
  numbers seen: mobile 97, landline 33, unknown 0

H3 flags (a record can carry several)
  No contact                      0 (0%)
  Malformed number                1 (1%)
  No mobile number               33 (25%)
  Several numbers in one field    0 (0%)
  No area or address              8 (6%)
  Possible duplicate              4 (3%)
  NEVER VERIFIED (separate chip) 130 (100%)

  HEADLINE "N records need attention": 45 of 130 (35%)

Quick Order baseline: 129 of 130 produce a wa.me link today (must stay identical)
```

The three landline-only examples: `Sin Ban Lee Hardware Sdn Bhd`, `Ban Hin Bee Hardware Sdn Bhd`,
`Teck Seng Hardware Trading` — all `+60392213533`-style Pudu landlines.
The 8 no-address rows: `ESL LIGHTING`, `Mohin Uddin`, `GOOD EFFICIENT ENTERPRISE`, `JON KWONG`,
`POLYTEC LAMINATES`, `TIMURAN SETIA`, `LKS KLASSE`, `Kemudi Timur Elektronik`.
The duplicate pairs: `Quinny Sign` / `Quinny Sign Trading` (same number 0123456791, different
addresses) and `LIGHTROOM GALLERY SDN BHD` / `Lightroom Gallery` (same number 0123456792).

## What the evidence changed

1. **The instruction's premise about multi-number cells does not hold for this seed.** It says one
   `contact` can hold "082-455 809 / 016-867 7888"; in the 130 seeded rows, **0** contain `/ , ; &`
   or the word "or". The split feature is still built (CSV imports can produce them, and the rule is
   cheap), but it has no seeded row to tune on — so it is tested with real-shaped fixtures instead of
   claiming a data win.
2. **There are no missing contacts** in the seed either (0 of 130). The old "Contact not listed"
   handling covers project-imported suppliers, not the seed. The `no_contact` chip stays and is tested
   on a row that has none.
3. **A 13-digit mobile exists**: `LKS KLASSE HOME INTERIOR SDN BHD` → `011345238888`. It matches
   `^01\d` (so a prefix-only classifier calls it mobile) but the shipped normaliser rejects it, so
   Quick Order has no link for it today (the 1 of 130 that fails). That is why **malformed** is
   defined as "nothing in the cell can be used", not "no prefix match", and why
   `isWhatsAppCapable` requires a mobile *that the normaliser also accepts*.
4. **"Never verified" really is all 130** — which is exactly why the instruction keeps it out of the
   headline. Following that: the headline is 45 (33 landline-only + 1 malformed + 8 no address + 4
   duplicates, with 1 record carrying two flags), never-verified is a separate chip at 130.
5. **"No area or address" is tuned to mean both blank.** `area` does not exist until H2, so "no area"
   alone would flag 130/130 and hide the real 8. After H2 the rule is evaluated on `area ?? ''` and
   `address ?? ''`, so it keeps meaning "we know neither the town nor the street".
6. No rule flags more than half the records, so nothing else needed widening.

## Decisions and proposals

- **Hub label: "Supplier Hub".** The project tab keeps its label "Suppliers", so no two visible
  tab-bar buttons share a label (the hub's own nav is `Projects | Supplier Hub`). No rename of the
  in-project tab is needed under these names; if you would rather the hub read plainly "Suppliers",
  then the project tab should become "Project Suppliers" (and its short label "Supp").
- **Where Stock is reached today** (asked by H1, not moved): Projects screen → "Stock & Inventory"
  card → "Open stock ledger". Its own nav is `Projects | Stock`.
- Flags are computed on read from the stored row + the whole list (duplicates need the list), never
  stored, never auto-fixed. `src/logic/supplierFlags.js` returns a `Map<id, {flags, neverVerified,
  needsAttention}>`; `summarizeFlags` gives the chips and the headline.
- Phone facts live in `src/logic/supplierPhones.js` and reuse `normalizePhoneForWhatsApp` — the
  normaliser is not forked. Quick Order itself is untouched and keeps reading `contact`.

## Build status

| Task | Status |
|---|---|
| H0 audit | ✅ this file |
| Evidence run | ✅ above, `scripts/supplier_audit.mjs` |
| Phone classifier + flags (H2/H3 logic) | ✅ `src/logic/supplierPhones.js`, `src/logic/supplierFlags.js` + 14 tests |
| H1 top-level hub | ✅ reuses `SuppliersScreen` with no `projectId`; Projects card + in-project link; 7 tests + browser proof |
| H2 additive fields (schema/repo) | ✅ `phones[]`, `contactPerson`, `email`, `area`, `status`, `mergedInto`; `getSupplier` follows the pointer |
| H2 editor UI (kind-aware buttons, split proposal) | ⬜ |
| H3 flag chips + headline | ⬜ (logic ready) |
| H6 CSV in hub + new columns at the end | ⬜ |
| H4 duplicate review + merge | ⬜ |
| H5 usage facts | ⬜ |

### Finding from the browser run (for H3)

The hub renders the full tag list as chips: ~120 distinct tags across the 130 suppliers, which fills
more than one screen before the first supplier row. The chips are correct and filter properly, but the
list needs the flag chips (H3) to be the primary filter and the tag wall capped or collapsed ("show all
tags"), otherwise the directory itself is pushed below the fold. Not changed in H1 — H1 forbids scope
creep and this is a filter-design decision for H3.
