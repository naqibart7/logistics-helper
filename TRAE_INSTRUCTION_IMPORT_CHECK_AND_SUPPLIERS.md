# Instruction for Trae — Import Check + Suppliers tab (14 Oct 2026)
### Paste this to Trae. Independent of the Lane 3 corrective file; do not mix the two.

## Context
BOM files now come from a free online chat AI (Grok) following the Agent 6/7 prompt. Material-Logi
only needs a file in the 8-section format and cannot tell which AI made it. Rule of the split:
the AI proposes, code checks arithmetic and internal consistency, and the human checks anything
that depends on the drawings. Code never fixes, rounds or fills a value. It only flags.

## Ground rules
- Prove it by running it. Paste real output.
- Never weaken an assertion or widen a timeout to pass a test without saying so.
- Protected: `mergeEngine.js`, `poGate.js`, `supplierLinking.js`, `poDocument.js`. Do not edit.
- No AI calls, no web lookups (Kill List). No new colour token without contrast numbers.
  Reuse the existing pending accent, not the lock accent.
- Findings are **computed on read, never stored**. Only a supervisor's "Verified" is stored.
- TBD is not zero and not an error. Skip any rule whose input is null or TBD.

## Part A — Import Check (accuracy of AI-made BOMs)

**A1. `src/logic/importCheck.js`:** pure `checkBomRows(rows) → findings`.
Finding = `{ rowId, rule, message }` with a plain-language message that includes the numbers.
- **R1 line total:** `purchaseQty × unitCost` vs `estTotal`; flag if the gap exceeds
  max(0.01, 0.5% of `estTotal`).
- **R2 under-buy:** `purchaseQty < netQty`, or below `netQty × (1 + wastage)`. Check how the
  parser normalises `wastagePct` (percent vs fraction) against the fixtures before writing it.
- **R3 provenance:** `basis` is `A` (assumption) or `NS` (not specified), or `confidence` is low.
  This is the AI admitting weakness; surface it first.
- **R4 missing essentials:** `purchaseQty` missing or ≤ 0, `unit` empty, or a price that is
  neither a number nor a TBD marker (for example "TBC").
- **R5 duplicates:** the same normalised item + spec twice in one project.
- Not now (do not build): cross-checks against the file's own totals (needs the parser to expose
  Dashboard and Sheet B totals, which `ParsedImport` does not carry), and outliers against your
  own history (wait for 10+ projects).

**A2. Prove it is not noise.** Run the checker on both real fixtures (Surau, Kediaman v2). Paste
the full findings list and mark each one real or false positive. Tune tolerances only on that
evidence, then keep the list as a golden test.

**A3. UI, non-blocking.**
- Order flagged lines R3 and R1 first, then by `estTotal` descending, so review starts where the
  money is.
- Dashboard line: "Import check: N lines to review", linking to a BOM filter "To review (N)"
  that composes with the existing grouping. With zero flags say: "No automatic flags. This does
  not check your drawings." No percentage, no score, no celebration.
- Flagged rows get the word "Check" plus the reason text. Colour is never the only signal. Tap
  targets stay 48px.
- Import Check never blocks the PO. It is separate from Confirm.

**A4. Verified.** One tap on a flagged row locks the current `purchaseQty` (and `unitCost` if
numeric) through the existing edit/lock path, and writes a `ChangeLogEntry` (actor supervisor,
field `verified:purchaseQty`, old = new). Add a Dashboard diary sentence ("You verified quantity
12 for Gypsum Board 9mm") so no raw field name leaks. A row leaves "To review" once its
`purchaseQty` is locked and R1 passes. Re-import behaviour is unchanged: locked fields are
skipped and the skipped count is reported.

**Tests:** `tests/importCheck.test.js` — each rule on synthetic rows; the golden fixture list;
TBD or null price never raises R1; ordering; Verified locks, logs and removes the flag; findings
are not persisted (re-import creates none); no raw field name in the diary sentence.

## Part B — Suppliers tab usable on its own (no AI)
The log shows a 130-supplier directory seeded from Naqib's own CSV, Browse All with search, CSV
import/export, linking, presets and Quick Order. It does **not** show the items below.

**B0. Audit first.** Report a present/missing table for: add one supplier in-app, edit a phone
number, delete, one-tap WhatsApp from a directory row, one-tap call, tag/town filter, per-supplier
note. Build only the missing ones.

**B1. Add / edit / delete in-app** (name, contact, address, specialty, tags, note). Adding uses
the `linkSupplierEntry` dedupe rule through its public function: same name and address never
creates a second record. Delete is blocked while the supplier is linked to a project; show "used
in N projects" and offer to remove the link instead.

**B2. One-tap actions on each directory row.**
- **WhatsApp:** `wa.me/<number>` using the existing phone normaliser. A malformed number shows an
  inline "Fix number" instead of a broken link. Copy: "Opens WhatsApp. Nothing is sent."
- **Call:** a `tel:` link.
- A supplier with no contact shows no buttons and never the text "NULL".

**B3. Optional, last. Verified date per supplier,** set by hand when Naqib has confirmed the
number. Show it as a word badge ("Verified 14 Oct"). The Quick Order preview adds a soft note for
an unverified supplier ("Number not verified"). It is a warning, never a block.

**Tests:** add dedupes; edit persists; delete blocked when linked; exact `wa.me` and `tel:` link
shapes; malformed number blocks WhatsApp with the fix prompt; null contact renders no buttons and
no "NULL"; `touchTargets` covers the new buttons.

## Order of work
A1 → A2 → A3 → A4 → B0 → B1 → B2 → B3.

## Do not
- Add any AI call, web lookup or auto-enrichment for suppliers.
- Block the PO on Import Check findings.
- Touch the protected files.

## Report back with
1. Table: task → done / partial / not done → evidence (command output, test names, screenshot).
2. The A2 findings list with real / false-positive marks.
3. `npx vitest run` and `npx vite build` output with the new test count.
4. Every deviation from this file, and every question left unguessed.
