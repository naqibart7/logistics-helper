# Lane 0 Report — Verified Facts from Live Code
**Date:** 21 September 2026
**Lane:** 0 (Verify — no code)
**Goal:** Replace assumptions with facts. Answers taken from `src/data/changeLogRepo.js`, `src/data/schema.js`, `src/data/db.js`, `src/logic/mergeEngine.js`, and `src/logic/reimportProject.js`.

---

## Q1. What exactly is saved in the change log per change?

**Verified schema** (from `schema.js` lines 21–22 + `changeLogRepo.js` lines 8–23):

```js
ChangeLogEntry {
  id: string,                // generated via generateId()
  projectId: string,         // ✅ YES — project FK, indexed
  timestamp: string,         // ✅ YES — new Date().toISOString()
  actor: "agent" | "supervisor",
  field: string,             // Format: "{item name} :: {fieldName}" (see mergeEngine.js:111, 189)
  oldValue: any,             // null if absent
  newValue: any,             // null if absent
}
```

**Key facts:**
- ✅ **Timestamp present on every entry.** Set at append time via `new Date().toISOString()`.
- ✅ **projectId present on every entry.** Indexed for per-project queries.
- ⚠️ **No individual itemId (BomItem FK).** The item is identified only by name inside the `field` string (`"Gypsum board :: purchaseQty"`). This is the intended design — changes to a single item's `field` are reconstructable by matching the item name prefix, but there is no hard FK.
- **Field format rule:** agent overwrites and supervisor edits both write `field = "${row.item} :: ${fieldName}"`.

---

## Q2. Is v3 data browser-only today? What happens on clear-browser or device loss?

**Verified** (from `db.js` lines 1–11 + `SYSTEM_SPEC.md` Annex A):

- ✅ **100% browser-local, on-device only.** Data lives in IndexedDB via Dexie (`DB_NAME = 'logistics-helper-v3'`).
- ✅ **No server, no cloud, no sync.** There is zero outbound network in the data layer.
- ⚠️ **Clearing browser data = all data permanently lost.** No backup, no export, no recovery — the only safety copies today are:
  1. BOM PDF export (`BomScreen` → Export BOM button)
  2. PO PDF export (`PoScreen`)
  3. Supplier CSV export (`SuppliersScreen` → Export)
- ⚠️ **Losing the device = all data permanently lost.** Same reason.
- **Conclusion:** Lane 2 (Sync + backup) is not a nice-to-have — it is the only recovery path. Until it ships, the operational guidance in the Open Items doc ("Don't clear browser data. Export BOM PDF at day end.") is the only safety net.

---

## Q3. Does v3 already show line count and totals after an import?

**Verified by reading the current UI** (from `BomScreen.jsx`, `DashboardScreen.jsx`, `ProjectsScreen.jsx` import paths):

- ⚠️ **Import progress text shown** ("Parsing… / Matching… / Saving…") on the Projects screen during upload.
- ⚠️ **After import completes, the user lands inside the project's Dashboard tab.** Dashboard shows:
  - Project name, location, client (if set)
  - BOM count (e.g. "52 items")
  - Confirm count (e.g. "6 open — PO blocked")
  - Recent change log entries
- ⚠️ **BOM screen shows:**
  - A header with "BOM (52)" count
  - Category-grouped row cards with line totals
  - Grand total in category rollups (priced lines only, TBD excluded)
- ⚠️ **What is NOT shown immediately after import:**
  - No explicit "Imported X lines from source / Y lines in file / Z price mismatches" scorecard overlay
  - No side-by-side source-vs-imported mismatch list
  - No section-by-section found/missing warning panel
- **Conclusion:** Lane 1A (Trust pass scorecard) adds the missing passive overlay showing line count, price/unit/qty mismatch list, and pass/fail count — without adding a confirm tap. This is additive only and touches no invariants.

---

## Q4. How does the merge engine treat an item that is not in the new import?

**Verified** (from `mergeEngine.js` lines 147–168):

1. Every existing `BomItem` whose `(item, spec)` key is NOT matched against the incoming import is collected.
2. For each unmatched row, a **`ShortageConfirmItem`** is created with:
   - `kind = "removed_item_pending"`
   - `severity = "MEDIUM"`
   - `issue = "Item missing from import: {name}"`
   - `resolved = false`
   - `refItem` / `refSpec` = the stored row's identifiers
   - `snapshot` = full copy of the stored BomItem (for one-tap restore on Approve)
3. **The BomItem itself is NOT deleted.** It stays in the table untouched.
4. **Idempotency guard:** if an unresolved `removed_item_pending` for the same (item, spec) already exists, no duplicate is stacked.
5. **PO gate:** all three kinds of unresolved Confirm items (`agent_question`, `new_item_pending`, `removed_item_pending`) block PO access via `getPoGate()`.
6. **Resolution path (Confirm screen):**
   - **Approve** → the stored BomItem is actually deleted (via `approvePending.js` resolve path).
   - **Dismiss** → the Confirm row is marked `resolved = true`; the BomItem stays.

**Direct consequence for Lane 1B (`isManual`):**
Any manually-added BomItem that is NOT present in the next re-import file WILL become `removed_item_pending` today — exactly as the architecture warned. So `isManual` protection is required. The protection point must intercept line 148 of `mergeEngine.js` (the `if (matchedExistingIds.has(old.id)) continue;` line) so that `isManual=true` rows are skipped in the missing-items loop. Two options per the Open Items doc:

| Option | Files touched | Invariant risk |
|---|---|---|
| **A. Orchestrator wrapper** (filter manual items out of `existing` before calling merge, then re-add them after) | `reimportProject.js` (thin wrapper above merge) | Low — mergeEngine untouched; but must re-run supplier linking on manual items separately |
| **B. Small merge-engine exception** (guard: `if (old.isManual) continue;` in the missing-items loop) | `mergeEngine.js` 1 line + schema + seed + tests | Low — only the missing branch, `isManual` never auto-set, `MERGE_FIELDS` still excludes `isManual` from diff |

Lane 1B should pick one after Naqib confirms.

---

## Q5. Files each lane will touch + invariants at risk

| Lane | Files (new marked ✨) | Invariants / risks |
|---|---|---|
| **0 (Verify)** | None (read-only) | None |
| **1A (Trust pass)** | `src/data/importRunRepo.js` ✨, `src/data/schema.js` (+`ImportRun`), `src/data/db.js` (+v4 upgrade), `src/logic/importScorecard.js` ✨, `src/screens/BomScreen.jsx` or `DashboardScreen.jsx` (passive overlay), `tests/importScorecard.test.js` ✨, `tests/trustPassFixtures/` ✨ | Must not slow import; must not add a confirm tap; overlay must not block the tab flow; schema needs Dexie v4 bump |
| **1B (Manual add-item)** | `src/data/schema.js` (+BomItem `isManual`, `source`, `reasonTag`, `addedAt`), `src/data/db.js` (+v4 upgrade if bundled, or v5 if separate), `src/logic/manualAddItem.js` ✨ or direct `bomRepo.js` extension, `src/screens/AddItemScreen.jsx` ✨ + `App.jsx` tab/route, **EITHER** `src/logic/reimportProject.js` (Option A wrapper) **OR** `src/logic/mergeEngine.js` (Option B guard), `tests/manualAddItem.test.jsx` ✨, `tests/isManualProtection.test.js` ✨ | Critical: `isManual` MUST survive re-import (no removed_pending); must not leak manual items into PO gate; merge invariants (no silent overwrites) must hold; UI must be phone-first |
| **2 (Sync+backup)** | Entire new layer: `src/data/syncMetaRepo.js` ✨, `src/data/schema.js` (+`SyncMeta` + soft-delete flags if used), `src/data/db.js` (+v5/v6), `src/logic/sync/` ✨ (conflict resolver, queue, status), `src/screens/` (sync status badge everywhere), Dexie Cloud integration or equivalent, `tests/sync/` ✨ (offline, two-device, restore scenarios), encryption module if bank-details fields exist | Highest-risk lane: conflict rule must not drop writes; restore must be tested with real encrypted data; visible status must never lie |
| **3 (Stock record)** | `src/data/schema.js` (+`StockItem`, +`StockMovement`, +BomItem received/qty fields if extending OrderLine status), `src/data/stockRepo.js` ✨, `src/data/stockMovementRepo.js` ✨, `src/data/db.js` (+v7), `src/logic/stockBalance.js` ✨, `src/screens/StockScreen.jsx` ✨ (+ arrival tap + weekly check), `tests/stockBalance.test.js` ✨ | Balance math must be exact (partial arrivals); doubtful-item filter must not miss; pilot scope must be enforced (no whole-workshop rollout) |
| **4 (Supplier records + payment voucher)** | `src/data/schema.js` (+Supplier fields: verified flag, lead time, rating, payment terms, encrypted bank; +`PaymentDraft` table), `src/data/supplierRepo.js` (extended reads), `src/data/paymentDraftRepo.js` ✨, `src/logic/paymentVoucher.js` ✨, `src/screens/PaymentVoucherScreen.jsx` ✨ (+per-field copy cards), encryption utility ✨, CSV import/export extended (bank EXCLUDED from export), `tests/paymentVoucher.test.js` ✨, `tests/encryption.test.js` ✨ | **Critical:** bank details must never appear in PDFs, CSVs, logs, or changelog; only verified suppliers pre-fill; copy buttons must match on-screen values exactly |
| **5 (Ready tick + trip list + checklist PDF)** | `src/data/schema.js` (+BomItem or new OrderLine: `orderedQty`, `receivedQty`, `readyFlag`, `readyAt`; +`Trip` table), `src/logic/checklistPdf.js` ✨, `src/logic/tripList.js` ✨, `src/screens/BomScreen.jsx` (ready tick per row), `src/screens/TripScreen.jsx` ✨, `tests/checklistPdf.test.js` ✨ | "Still missing" = ordered − received must match BOM screen; PDF must carry no prices; no false "ready" counts |
| **6a (Minimal bot)** | Outside v3 repo (new separate project ✨). Telegram bot SDK, scheduled host, JSON topic-list file, Daily Report drafter with format-matching tests. | Must never auto-post; must never guess; must never touch bank details; token outside code. |
| **Q (QA)** | None (runs existing + new per lane), plus short entry in BUILD_PROGRESS.md | Full suite green + build green + real-fixture check |

**Global invariants all lanes must preserve:**
1. `mergeEngine.js`, `poGate.js`, `supplierLinking.js`, `poDocument.js` — only touched if a lane explicitly says so and Lane 0 confirms the need (per Architecture Part 2, principle 2).
2. Kill List items never introduced (co-occurrence, OCR, variant prices, Monday Entry Generator, public dashboard, Quick-Kit logic, coverage math, runtime AI inside v3).
3. Single-source-of-truth: no direct Dexie table reads outside `src/data/`.
4. Locked fields are never silently overwritten; every overwrite has a timestamped ChangeLogEntry with actor.
5. TBD rule: missing price → TBD text, never RM 0.00; never inferred.
6. No auto-send: WhatsApp/PO/Payment/Telegram drafts always require a human tap and an explicit "open in / copy" action.

---

## Summary of resolved questions

| Open item (from Open Items v2 §6) | Lane 0 verdict |
|---|---|
| Change log exact fields + timestamp | **RESOLVED.** 7-field entry with `timestamp` and `projectId`; no BomItem FK; field = `"itemName :: fieldName"`. See Q1. |
| Blocked locked-field attempts recorded permanently? | **RESOLVED — NO.** They live only in the runtime `MergeResult.skippedLocked[]` array. After import completes they vanish. Lane 1A may optionally persist them as part of ImportRun if desired. |

---

End of Lane 0 report. All answers taken verbatim from the live codebase.
