# Corrective Instruction for Trae — Lane 3, round 2 (12 Oct 2026)
### Paste this to Trae. It follows the review of "Lane 3 Progress Review" (9 Oct).

## Read first
1. Your own "Lane 3 Progress Review", `SYSTEM_SPEC.md`, `BUILD_PROGRESS.md`.
2. `RUN_INSTRUCTION.md` (key items list, "unset is not zero"), `STOCK_MODULE_DESIGN.md`,
   `BOM_CHECKLIST_MODE_SPEC.md`. Where they differ from the Architecture doc's Lane 3 section,
   the Architecture doc wins.

## Ground rules
- Prove it by running it. Paste real output. Reading the code is not proof.
- Never edit an assertion, or widen a timeout, to make a test pass without saying so.
- Protected: `mergeEngine.js`, `poGate.js`, `supplierLinking.js`, `poDocument.js`. The only
  permitted edit is the revert in Task 5a.
- Do not change behaviour that is not listed here. Anything ambiguous goes in the report as a
  question, not a guess.

## Order of work
Task 1 → Task 4 → Task 3 → Task 2 → Task 5. Tests come first because they expose Task 4 and
the unset-count bug below.

## Task 1 — Tests for the stock ledger (none exist yet)
Total is still 143, so nothing from the last round is covered. Add `tests/stockRepo.test.js`,
`tests/bomChecklist.test.jsx` and extend `tests/bomExportPdf.test.js`.

**1a. Fix this first. Your doc says `computePredictedBalance` coalesces a null `startingCount`
to 0.** That breaks the rule "unset is not zero". Required behaviour:
- No `startingCount` → predicted balance is `null`, the UI shows "Needs starting count", and the
  item never counts toward the low-stock badge.
- No `minThreshold` → no low-stock flag. A minimum of 0 is a real value and is not "unset".
- Coalescing is allowed for summing movements, never for the baseline.
- Write the unset-count test first and show it **failing** before you fix the code.

**1b. Required cases:**
- Balance = start + received − used, with every movement type and partial arrivals.
- Low stock is strictly `balance < minThreshold` (equal is not low).
- From-stock tick writes one `used` movement for `purchaseQty` against the current project.
  No matching stock item means no movement and no error.
- Matching uses `itemKey(item, spec)` plus the aliases from the key items table.
- Short-stock confirmation: confirming writes the movement, cancelling writes nothing and leaves
  the box unticked.
- Untick reverses the quantity that was **actually written**, not the current `purchaseQty`.
  Test: tick, edit `purchaseQty`, untick, balance returns exactly to the start. Ten tick/untick
  cycles cause no drift.
- `eligibleOrderItems` still excludes from-stock rows and still follows the Annex E rule.
- `renderBomExportPdf`: the caveat line appears if and only if `openConfirmCount > 0`, with the
  right count. Assert the text calls' `y` values so the caveat never shares a `y` with the title.

**Done when:** the new tests are listed with counts, and for the core behaviours (balance sign,
reversal, caveat condition) you show a test failing against a deliberately broken line.

## Task 4 — Untick must write `reversal`, not `adjustment`
- Add movement type `reversal`, with `reversesId` pointing at the movement it undoes. Its effect
  on the balance is the exact opposite of that movement.
- Untick, and any undo, writes `reversal`. Only `recordRecount` may write `adjustment`.
- The future accuracy digest must read only recount adjustments and ignore reversals.
- Do not rewrite old rows. Just stop creating `adjustment` from unticks.
- **Test:** untick creates a `reversal` and zero `adjustment` rows; `recordRecount` still
  creates `adjustment`.

## Task 3 — Build the checklist that was asked for
Per `BOM_CHECKLIST_MODE_SPEC.md`. This is separate from `fromStock`.
- `prepared` (boolean) and `preparedNote` (free text) on each BOM row. Ticking writes a
  `ChangeLogEntry` (actor supervisor, field `prepared`). They must be invisible to
  `mergeEngine.js`, like `displayOrder`. Test: a re-import leaves ticked rows untouched.
- Header text "N of M prepared". Plain count: no percentage, no progress bar. Assert it after the
  async load, as in the T8 lesson.
- Filter All / Not yet prepared / Prepared. It composes with the Suppliers/Category/All
  grouping, and group counts still sum to the header total.
- Tint with the existing `--saved` token. The checkbox is at least 48px, and `touchTargets`
  covers it.
- `fromStock` keeps its meaning: "taking this from the shelf, not ordering it". Keep its quick
  order exclusion.
- **Revert** the `doubtful` exclusion from quick orders, so the Annex E eligibility rule is
  restored. Keep `doubtful` as a visual flag only until Naqib decides otherwise. Add a schema
  comment that this BOM-row flag is unrelated to the stock "doubtful" state used by the weekly
  check. Rename it if you can do so safely.

## Task 2 — Receiving without typing IDs
My review said an arrival should come from marking an order received. That holds only under
the "hub" model in Decision D10 below, so Task 2 is split.

**Build now (needed under either model):**
- A **Received** control on each BOM row: "Received in full" in one tap, or a partial quantity.
  `receivedQty` is cumulative, never below 0, and writes a `ChangeLogEntry`. This is delivery
  tracking only and does not touch stock yet.
- Remove every `window.prompt`. The Stock screen's Receive and Use buttons become inline
  controls (48px) with a list picker for item, supplier and project by **name**, never a typed ID.
- **Test:** partial then full receipt, over-receipt clamped or flagged, no `prompt(` left in
  `src`.

**Wait for D10 before building:** automatic `received` and `used` stock movements from BOM
rows. Do not pick a model yourself.

## Task 5 — Small items from the same review
- **5a.** Revert the `openConfirmCount` parameter and its test from `poDocument.js`. It was added
  this session, so nothing depends on it. `git diff` of that file against the pre-Lane-3 commit
  must be empty.
- **5b.** `handleDelete` now removes the card before the delete completes. If the delete fails,
  it must restore the card and show an error. Add a test with a rejected delete. Also say which
  `redesignUi` assertion originally failed ("TUAN DIN" or the delete one) and show before/after.
- **5c.** Render the Export BOM PDF with the caveat, convert page 1 to an image
  (`pdftoppm -png`), look at it, and attach it to the report. Confirm no overlap.
- **5d.** Paste `grep -n -i "digitalocean\|botfather" dailybot/DEPLOY.md`. Update the
  `BUILD_PROGRESS.md` header with the real test and build numbers.

## Decisions waiting on Naqib (do not guess)
**D10 — Do deliveries that arrive for a project add to workshop stock?**
- **Shelf model (recommended; matches his Option A, "workshop stock, BOMs separate"):** no. Stock
  changes only when stock is pulled from the shelf for a job (`fromStock`) or when a restock
  delivery is received on the Stock screen.
- **Hub model:** yes. Every delivery of a key item enters stock and every `prepared` tick takes
  it out. Fully automatic, but one missed tick makes the balance drift upward. Under this model
  `used` must be written on `prepared`, and `fromStock` must stop writing it, so nothing is
  deducted twice.

**D9 (still open):** when stock counts as used. Recommended default: on the `fromStock` tick.

## Do not
- Mark anything done without pasted proof.
- Touch the protected files, apart from 5a.
- Start the stock movements for D10, the weekly quick-check screen, or the accuracy digest.

## Report back with
1. A table: task → done / partial / not done → evidence (command output, test names, screenshot).
2. `npx vitest run` and `npx vite build` output, with the new test count.
3. Every deviation from this file, and every question you left unguessed.
