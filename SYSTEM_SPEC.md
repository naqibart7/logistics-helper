# Material-Logi — Consolidated System Specification

**Version:** 2.0.0 + Implementation Annex (2026-09-11)
**Upstream source:** `Material-Logi_System_Specification_v2.md` (2026-09-11, supersedes v1.0.0).
Superseded: v1.0.0 DSG-B-only design (`dsgB.js`, Quick-Kits, Coverage Validator, single-project).
**Core Philosophy:** Deterministic operations inside the app. Math and matching, not guessing.
Correctness > Speed > Feature completeness > Polish.

> **Read-this-first for agents:** this file is the single source of truth. Where it is silent,
> stop and report the gap — do not improvise. Annex B records every place the implementation
> deliberately differs from the upstream v2 text, with the decision. Do not "fix" those
> deltas back toward v2 without a new decision recorded here.

---

## 1. Data Flow (normative, from v2.0.0)

```text
[Upstream: Agent 6 (BOM Reconciliation) + Agent 7 (Grounded Sourcing)] — separate system, outside this app
▼ (.md or .xlsx, 8-section format)
[1. Import Parser] ──► format detect, all 8 sections → one common shape (ParsedImport)
▼
[2. Project Matcher] ──► match title → re-import into project; no match → auto-create (no prompt)
▼
[3. Merge Engine] ──► diff vs stored rows, respect lockedFields, queue new/removed to Confirm
▼
[4. Central Store] ──► BomItem[] per project (single source of truth per project)
├─► [5. Confirm Queue] ──► agent questions + new-item + removed-item; ALL block PO until resolved
├─► [6. Supplier Linker] ──► Global Supplier Directory ⇄ per-project links (never duplicate records)
└─► [7. Change Log] ──► append-only, every entry tagged agent- or supervisor-made
▼ (zero unresolved Confirm items)
[8. PO Generator] ──► deterministic PDF, "TBD" for missing price — never inferred (landed Task F)
▼
[9. WhatsApp Deep-Link] ──► wa.me + po.pdf (landed Task F)
```

Removed in v2 (do not reintroduce — see Kill List): Quick-Kit Injector, Coverage Validator.
Both are handled upstream by Agent 6/7 before any file reaches this app.

## 2. Contracts (normative, from v2.0.0)

**ParsedImport** — every field required, `null` if genuinely absent, never guessed:
```js
{
  projectTitle: string,   // from Master BOM header, e.g. "SURAU DARUL DAKWAH"
  bomItems: [{ item, spec, category, unit, netQty, wastagePct,
               purchaseQty, unitCost, estTotal, basis, confidence, pack, notes }],
  shortageConfirmItems: [{ severity, issue, missingInfo, confirmationRequired, owner }],
  supplierEntries: [{ businessName, contact, address, specialty, logisticsNote, sourceUrl }],
  changeLogFromAgent: [{ description }],
}
```

**Parsing (defensive):** sections found by header-text match, never fixed position.
A missing section → empty array for that section; the import still proceeds.
Merge matching: `(item name + spec)` text, case-insensitive.
Supervisor edit → field appended to `lockedFields` + `ChangeLogEntry(actor: "supervisor")`.
Agent overwrite → `ChangeLogEntry(actor: "agent")`. Locked fields are skipped silently in
storage (the skip is reported in the `MergeResult`, never written as a change).

**Storage (Dexie/IndexedDB):** `Project { id, name, location, createdAt }`,
`BomItem { …, lockedFields: string[] }`,
`ShortageConfirmItem { …, resolved: bool, kind: agent_question | new_item_pending | removed_item_pending }`,
`GlobalSupplier { …, tags }`, `ProjectSupplierLink { projectId, globalSupplierId, assignedToItemId? }`,
`ChangeLogEntry { …, actor: agent | supervisor, field, oldValue, newValue }`.

## 3. Screens (normative intent, from v2.0.0 §3)

Entry: Projects list. Inside a project, bottom tab bar: Dashboard | BOM | Confirm | Suppliers | PO.
Key constraints: Dashboard status reflects the **live** Confirm count, never cached; BOM edits lock
fields + log automatically; **PO is blocked while any unresolved Confirm item of any kind exists**;
supplier assignment creates a link, never a duplicate record; PO renders "TBD", never an inferred price.
Mobile-first: bottom-30% primary actions, deterministic progress text, specific actionable errors,
48×48px minimum tap targets.

## 4. Kill List (normative — any PR containing these is rejected)

1. Co-occurrence / "frequently bought together" suggestions.
2. Unlimited-OCR GPU backend + messy-PDF parser.
3. Variant-aware best-seen price tracking.
4. Monday Entry Generator.
5. Public Dashboard.
6. Quick-Kit auto-suggestion logic (removed v2).
7. In-app coverage math — paint/primer ratios etc. (removed v2, upstream owns it).
8. Any runtime AI call inside this app (AI lives only in upstream Agent 6/7).

---

## Annex A — Spec → Repo File Map (as built 2026-09-11)

| Spec module | Implementation | Status |
|---|---|---|
| §2.1 Import Parser (`detectFormat/mdReader/xlsxReader/normalize`) | `src/utils/importParser/` (+ `index.js`) | ✅ Done, tested vs both sample files |
| §2.2 Project Matcher | `src/logic/projectMatcher.js` (+ `src/logic/itemMatcher.js`) | ✅ Done; auto-create on no-match per spec |
| §2.3 Merge Engine | `src/logic/mergeEngine.js` (+ `seedProject.js` first-import path, `approvePending.js` Confirm actions, `reimportProject.js` match-path orchestrator: merge + supplier link) | ✅ Done, 3/3 merge cases pass |
| §2.4 Data Layer | `src/data/{db,schema,projectRepo,bomRepo,supplierRepo,shortageRepo,changeLogRepo,presetRepo}.js` | ✅ Done (`shortageRepo` added: schema table had no owning repo file; `presetRepo` for Annex E) |
| `ProjectsList` | `src/screens/ProjectsScreen.jsx` (import + two-tap project delete) | ✅ Done |
| `FileUploader` | Import control inside `ProjectsScreen.jsx` (no separate file) | ✅ Done, see Deltas D2 |
| `Dashboard` | `src/screens/DashboardScreen.jsx` (recent changes inline = Change Log link; client edit field) | ✅ Done |
| `BOMReview` | `src/screens/BomScreen.jsx` (purchase view + inline edit + 🔒 indicators; qty/price cells are tap targets; `#` order badges; drag + ▲▼ reorder; Export BOM button; supplier picker + Unassigned-first grouping + Quick Order modal; Suppliers/Category/All views, category grouping display-only) | ✅ Done, see Deltas D3 |
| `ConfirmQueue` | `src/screens/ConfirmScreen.jsx` (kind badges; Approve/Dismiss via `approvePending`) | ✅ Done, see Deltas D4 |
| `SupplierDirectory` + global browser + CSV | `src/screens/SuppliersScreen.jsx` (per-project list + searchable Global Directory browser; links run the shared `supplierLinking.js` rule; Export CSV download + Import CSV with pre-commit preview) | ✅ Done (D5 closed 2026-09-11; CSV closed 2026-09-15) |
| `POGenerator` + WhatsApp | `src/screens/PoScreen.jsx` (Generate PO → jspdf bytes download; wa.me link derived from PDF state, gate unchanged) + `src/logic/poDocument.js` (lines/TBD totals/PDF/link builders) | ✅ Done (D6 closed 2026-09-11) |
| PO gate rule | `src/screens/poGate.js` (`getPoGate` / `resolveTabRequest`, pure + tested) | ✅ Done |
| App shell / tab bar | `src/App.jsx` (Projects entry → 5-tab project context) | ✅ Done |
| Tests | `tests/{parser,dataLayer,mergeEngine,poGate,supplierBrowser,poPdf,touchTargets,singleSource,e2eLockedField,xlsxUiImport,reimport,projectDelete,e2eFreshImport,redesignUi,approvePending,bomMigration,bomReorder,bomExportPdf,itemSupplierPresets,quickOrderGate,quickOrderMessage,quickOrderPhoneNormalize,quickOrderUi,projectMatcher,csvReader,csvExport,supplierCsvImport,supplierCsvUi,bomCategoryView,bomCountConsistency}.test.{js,jsx}` (108/108 pass) + `tests/fixtures/` | ✅ Done |
| Supplier CSV | `src/utils/csvImport/{csvReader,csvExport,index}.js` + `src/logic/supplierCsvImport.js` + `getAllSuppliersForExport` (stable read) | ✅ Done (D17) |

## Annex B — Conformance Deltas (decisions, do not revert without a new entry here)

- **D1 — UI lives in `src/screens/`, not `src/components/`.** The §3 component names map 1:1 to
  the table above. Do NOT create a parallel `src/components/` tree — that duplicates tested screens.
- **D2 — No standalone `FileUploader.jsx`.** The import control lives in `ProjectsScreen` (wiring only;
  parse/match/seed decisions live in Agent 1/3 + repos). Missing sections yield empty arrays per the
  defensive-parsing contract — they are not parse failures. "Show which section couldn't be found"
  (§3) is accepted as future UI polish: surface section presence as warnings, not errors.
- **D3 — No Purchase/Audit toggle in `BomScreen`.** Purchase view only. Audit toggle is deferred
  (needs a decision on what the audit view shows beyond the Change Log link on Dashboard).
- **D4 — `ConfirmScreen` uses kind badges, not three grouped sections.** Grouping by
  `agent_question / new_item_pending / removed_item_pending` is deferred UI polish; the data
  distinction exists in `kind` and is fully tested.
- **D5 — CLOSED 2026-09-11 (Task D).** "Browse All Suppliers" browser exists in
  `SuppliersScreen`: searchable full-directory list (name/specialty/address substring covers
  region, e.g. "Kuching"; tag chips are data-driven from tags present). Tapping links via
  `src/logic/supplierLinking.js`, the single home of the dedupe rule — (name, address)
  both normalized, both must match (hardened Task E: same name in different towns stays two
  records) — shared with the import path (`seedProject` refactored onto it, behavior unchanged) — a tap can only add a
  `ProjectSupplierLink`, never a duplicate `GlobalSupplier`. `mergeEngine.js` untouched.
- **D6 — CLOSED 2026-09-11 (Task F).** PO PDF + WhatsApp landed: `poDocument.js` builds
  lines from the same `BomItem[]` (missing price → TBD, totals sum priced lines only), renders
  jspdf bytes (asserted byte-searchable in tests), `wa.me/?text=…&attachment=po.pdf` link.
  `PoScreen` exposes Generate PO only inside the already-open gate branch; `poGate.js` untouched.
- **D7 — No Zustand.** §1.2 recommends it for in-memory UI state; current screens use React
  `useState` with Dexie as the store. Decision: deferred until prop-drilling actually appears.
  Dexie (persistent) is adopted as specified.
- **D8 — CLOSED 2026-09-11 (Task G1).** All interactive elements 48×48px minimum
  (`src/index.css`; tab-bar `min-height:auto` override removed). Verified by
  `tests/touchTargets.test.jsx` (stylesheet contract + every rendered tap target).
  Honest limit: jsdom has no layout engine, so the test asserts applied CSS minimums —
  real tap feel stays in the G4 manual checklist.
- **D9 — Merge engine extras (documented, inside its layer):** re-import idempotency guard (no
  duplicate open pendings), `snapshot` payload on pending rows (powers approvals), `skippedLocked`
  reporting in `MergeResult`. None change first-run behavior specified in §2.3.
- **D10 — Single-source-of-truth review (Task G2), PASS with one fix.** Grep audit 2026-09-11:
  direct Dexie table access now exists only in `src/data/` (repos + `db.js`) — zero in
  `src/screens/` or `src/App.jsx`. The single bypass found (`SuppliersScreen` reading
  `db.globalSuppliers` directly) was fixed via new `supplierRepo.getSupplier`. All screen
  state is render-scoped (fresh repo read on every mount — tab switches remount — plus
  reload-after-every-mutation); no persistent cross-screen cache exists to drift. Guarded by
  `tests/singleSource.test.js` (static zero-bypass scan + `getSupplier` round-trip).
- **D11 — Import robustness (Task H1).** A missing `await` on async `parseXlsx` shipped a
  Promise as ParsedImport down the UI path (unit tests awaited it directly, so only the app
  crashed with "Cannot read properties of undefined (reading 'map')"). Fixed; every
  sheet/section parse resolves non-arrays to `[]`; `friendlyImportError` maps failures to
  readable messages (raw JS strings to console only); `isEmptyImport` refuses content-less
  files without creating a project. Regression: `tests/xlsxUiImport.test.jsx`.
- **D12 — Re-import links suppliers (Task H2).** The match path merged BOM rows but never
  suppliers, and cross-run re-imports queued everything as pending — the "98 pendings, no
  suppliers" report. `reimportProject.js` runs merge + shared supplier linking;
  `mergeEngine.js` untouched. Compounded state is cleaned via project delete (Task I).
- **D13 — Project deletion (Task I, new scope).** Two-tap Delete on `ProjectsScreen` over
  cascading `deleteProject` (own rows go; shared `GlobalSupplier` records survive).
- **D14 — BOM numbering + BOM export (Tasks L & M).** `BomItem.displayOrder` and
  `Project.client` (manual, optional, never inferred) added. displayOrder is cosmetic-only:
  invisible to `mergeEngine.js`/`itemMatcher.js` by construction (absent from MERGE_FIELDS).
  Seed assigns import order; approvals append at max+1; reorder persists immediately via
  `bomRepo.reorderBomItems`; legacy rows backfilled once by a v2 upgrade. Export BOM
  (`bomExportDocument.js`, `BomScreen` button) follows the reference layout with TBD-excluded
  subtotals/grand total; `poDocument.js`/`poGate.js` untouched.
- **D15 — Fast Ordering: stored `unit`/`pack` restored.** The stored `BomItem` shape was
  silently dropping the parser's `unit` (and `pack`) — every seeded row read back with a
  blank unit, which the Quick Order message template needs. Both now persist; `unit` and
  `pack` also merge as descriptive fields (locks still respected). `byDisplayOrder` factored
  into `utils/helpers.js` (was triplicated) and reused for message line order, so message
  numbering always matches the on-screen BOM.
- **D16 — Inverted-order title fix (Task N).** The master-preference rule picked a title
  row it couldn't parse (last dash-chunk → "V2 COST SHEET"). Names now come from the chunk
  after the BOM marker; trailing parenthetical refs stripped everywhere including
  `normalizeTitle`, so re-quotes match. Earlier ref-bearing expectation updated (documented
  reversal: refs aren't stable identifiers). Real inverted-order file staged as a fixture.
- **D17 — Supplier CSV import/export.** `csvReader` (header-name matching, quote handling,
  `;`-split tags, row-numbered rejections) → `supplierCsvImport` (existing linkKey reuse,
  skip-by-default, flag-gated non-blank overwrite, dryRun for confirm counts) →
  `csvExport` (fixed column order, inverse `;`-join) + `getAllSuppliersForExport`
  (businessName-ordered stable read). UI: Export/Import buttons + pre-commit preview +
  verbatim summary on `SuppliersScreen`. Round-trip proven twice: automated test and a
  real-data run (14 fixture suppliers → export → re-import → 0 created, 14 skipped).
- **D18 — Visual polish pass (parallel agent).** Page headers, stat grid, file-picker
  label, hover states, responsive rules. Verified presentational-only; one test repaired
  for split heading text. No logic, schema, or gate changes.
- **D19 — Slice-8 follow-ups.** NULL contacts → "Contact not listed"; severity tints per
  tier (case-normalized lookup, INFO included); locked gets cool blue (was sharing default
  white with LOW); 1024px grid breakpoint; display-only category grouping with supplier
  default kept (deviation from flat-default recommendation, recorded in 08).
- **D20 — Slice-9 follow-ups.** Tab bar: `overflow-x: auto` at ≤640px with horizontal
  scroll, buttons `flex: 0 0 auto`, short labels (Dash/Cfm/Supp) at narrow widths, hidden
  scrollbar. BOMScreen: duplicate-key warning fixed (index-suffixed unassigned group keys);
  async-load timing bug in test fixed (capture header after rows render); debug
  console.logs removed; 3 debug test files deleted. `redesignUi` PO-tab selector fixed
  for nested-span label structure.

## Annex C — Agent Work Queue (ordered; pipeline + redesign + L/M + fast ordering + Task N + CSV + slice 8+9 done, verified 113/113 + prod build green)

### Core v3 — DONE
1. **~~Delete dead v1 files~~ DONE 2026-09-11 (Task B):** `src/utils/excelParser/dsgB.js`,
   `src/data/structuralKits.js`, `src/utils/coverageRules.js` deleted (empty parent dirs removed).
   `QuickKitPrompt.jsx` / `CoverageGate.jsx` never existed — verified absent. Zero references
   remain in `src/` + `tests/`; tests + build green. Phase 5 "zero Kill List items" audit passes
   on presence.
2. **~~Phase 4~~ DONE 2026-09-11 (Task F):** PO PDF (`poDocument.js` TBD-rendering, byte-asserted) + WhatsApp deep-link.
3. **Deferred UI polish:** D2 section warnings, D3 audit toggle, D4 grouped Confirm sections.
4. **Phase 5 audit:** D8 48px ✅ (automated proxy; real feel in G4) · single-source review ✅
   (D10) · UI-driven locked-field re-import ✅ (`tests/e2eLockedField.test.jsx`) ·
   **OPEN: G4 one-thumb physical-device test — human-run, checklist in BUILD_PROGRESS.**
5. **~~Redesign~~ DONE 2026-09-11:** full pipeline in `docs/redesign/` (handoffs 01–07,
   summary, decision register, QA evidence, before/after shots). No logic/schema/gate
   changes; two evidence-found fixes (banner race, WhatsApp copy).
6. **Adopt Zustand only if** a screen starts prop-drilling (D7); do not pre-empt.

### v3 Extension Phase 2/3 — Architecture v1 (see `docs/extension/Architecture_v1_Logistics_Helper_v3_Extension.md` Part 8)
**Lane order:** Lane 0 ✅ → Lane 1A + 1B → Lane 2 → Lane 3 → Lanes 4/5 provisional → Lane 6a (parallel, outside v3). Run Lane Q (QA) after every lane.

| Lane | Title | Status | Key files touched |
|---|---|---|---|
| **0** | Verify (no code) | ✅ **DONE 2026-09-21** — report in `docs/extension/Lane0_Verification_Report_2026-09-21.md` | None (read-only) |
| **1A** | Trust pass tooling (import scorecard) | OPEN — passive overlay, no confirm tap | `importRunRepo.js` ✨, `importScorecard.js` ✨, schema (+ImportRun), db (+v4) |
| **1B** | Manual add-item + `isManual` protection | OPEN — phone-first screen; `isManual` survives re-import (Option A/B decision pending) | `AddItemScreen.jsx` ✨, schema (+isManual/source/reasonTag/addedAt), **either** `reimportProject.js` wrapper (A) **or** `mergeEngine.js` guard (B, needs lane approval) |
| **2** | Sync + backup (Dexie Cloud Option A recommended; spike first) | OPEN — step 0 = options compare (no code), step 1 = spike, step 2 = integrate + status, step 3 = backup/restore | New `src/logic/sync/` ✨ layer, schema (+SyncMeta + soft-delete flags), status badge everywhere |
| **3** | Stock record (pilot, ~50 lines / 1 project) | OPEN — starting count, arrivals tap, predicted balance, key-item mins, doubtful weekly check | `stockRepo.js` ✨, `stockMovementRepo.js` ✨, `stockBalance.js` ✨, `StockScreen.jsx` ✨, schema (+StockItem/StockMovement + received qty fields) |
| **4** | Supplier verification + Payment voucher drafter | OPEN (provisional) — verified flag/rating/leadtime, encrypted bank details, 14-field Monday.com voucher (Appendix A) with per-field copy cards | Extended `supplierRepo.js`, `paymentDraftRepo.js` ✨, `paymentVoucher.js` ✨, `PaymentVoucherScreen.jsx` ✨, encryption utility ✨, CSV import/export extended (BANK EXCLUDED from export) |
| **5** | Ready tick + trip list + checklist PDF | OPEN (provisional) — per-line ready flag, ticked trip-list copy to Telegram, checklist PDF = to order / received / still missing (no prices) | `checklistPdf.js` ✨, `tripList.js` ✨, BomScreen ready tick, schema (+orderedQty/receivedQty/readyFlag/readyAt + Trip) |
| **6a** | Minimal Telegram bot (Daily Report draft only) | OPEN, parallel-approved (D4, does not touch v3) | **Separate repo ✨** outside v3. Private bot chat, end-of-day check-in, data-driven topic list, project list refreshed Mon/Fri, one reminder, character-for-character Daily Report format match, never auto-post, never guess, token outside code. |
| **Q** | QA (after every lane) | N/A — mandatory gate | Full suite green + build green + real-fixture check + short `BUILD_PROGRESS.md` entry |

**Extension invariants (from Architecture v1 Part 2):**
- Local-first. v3 works offline; cloud = copy, not boss.
- Additive only. Do **not** modify `mergeEngine.js`, `poGate.js`, `supplierLinking.js`, or `poDocument.js` unless a lane explicitly says so AND Lane 0 confirms the need.
- Follow the v3 pattern: data (`src/data/*Repo.js`), logic (`src/logic/*`), thin UI (`src/screens/*`).
- Schema changes → Dexie version bump with tested migration (as with displayOrder v2 and presets v3).
- No silent overwrites or silent deletions. Every change timestamped.
- Human in the loop. PO, WhatsApp, Telegram, Monday.com text = always drafts. Never auto-send.
- <2 minutes a day of user effort.
- Bank details: encrypted at rest, masked in UI, never in PDFs/exports/logs/bot/AI prompts.
- Every lane ends with: passing tests · green build · short `BUILD_PROGRESS.md` entry.

## Annex D — Sources & Supersession

### Normative sources (core v3)
- Upstream normative: `Material-Logi_System_Specification_v2.md` (Downloads, 2026-09-11).
  Superseded: v1.0.0 (`Material-Logi_System_Specification.md`, DSG-B-only world).
- Execution plan: `logistics_helper_v3_build_pipeline.md` (5-agent split; consistent with this spec).
- Build record: `BUILD_PROGRESS.md` (measured fixture table, test results, env fixes, extension lane summary).
- Ground-truth fixtures: `tests/fixtures/Qwen_markdown_20260910_k171vvnlq.md`,
  `tests/fixtures/Surau_Darul_Dakwah_BOM_A7_Grounded_Sourcing.xlsx` — a true same-run pair
  (one Agent 6/7 run 2026-09-10, 52/6/14/5 in both; `parser.test.js` asserts deep equality).
  Plus `tests/fixtures/Surau_Darul_Dakwah_BOM.md` — pandas-export variant of the same project
  (title/metadata rows above header, 6 sections; 52/6 parsed, regression-locked, not
  deep-equal to Qwen by wording).
  Plus `tests/fixtures/Artseven_BOM_Q260163_Kediaman_Puan_Hashima_v2.xlsx` — real
  inverted-order file (dashboard first, comma-less Master title; 11/4/7/7, title exact).

### Extension planning documents (Phase 1→2, imported 2026-09-21)
Placed in `docs/extension/`. Informative, not normative for core v3. Become normative lane-by-lane
as each lane starts and Naqib confirms.

| File | Phase | Role |
|---|---|---|
| `docs/extension/Work_Map_and_System_Plan_v2.md` | **Phase 1 (Brainstorming)** | Interviews → 4-bucket sort (Eliminate/Systemise/Optimise/Automate), work map ×7 areas, constraints, core insights, v3 backlog, bot/report drafter drafts, 13-item open list. Supersedes `Work_Map_and_Pilot_v1.md`. |
| `docs/extension/Architecture_v1_Logistics_Helper_v3_Extension.md` | **Phase 2 (Architecture)** | 13 parts: plain-language overview, invariants, components (C1–C6), data additions (11 tables/fields), sync design options A/B/C/D + conflict rule + tests, bot schedule/answers/formats, 3 fixed daily formats + weekly format mapping, 9 build lanes 0→Q+6a, testing/security, decisions D1–D10, open items/do-not-assume, Payment Voucher Appendix A (14 fields ↔ v3 source), agent guardrail/lane prompts. |
| `docs/extension/Logistics_Helper_v3_Open_Items_Resolved_2026-09-21_v2.md` | **Status tracker** | §1 Key-items decision table (draft, 12 + 2 blank rows). §2 Weekly Report template (RESOLVED character-for-character from real files). §3 Lane 0 code gaps (open before verification). §4 Baseline correction (paper tally now). §5 Balance reminder B revised (in-app badge first). §6 8-row status table. Next actions 1–5 for Naqib. |
| `docs/extension/Lane0_Verification_Report_2026-09-21.md` | **Lane 0 OUTPUT** | 5 answered questions from live code: Q1 change-log 7 fields (timestamp+projectId verified), Q2 Dexie-only storage, Q3 post-import UI state, Q4 missing-item → removed_item_pending flow exact, Q5 per-lane file×invariant matrix. Resolves 2 rows of Open Items §6. Locked-field blocked attempts confirmed NOT permanently logged. |

### Read order for agents working on Extension lanes
1. `SYSTEM_SPEC.md` (this file) — Annex C (lane table) + Annex B (conformance deltas) + Annex E (Fast Ordering).
2. `docs/extension/Architecture_v1_Logistics_Helper_v3_Extension.md` — Part 2 (invariants) → Part 8 (your lane) → Part 13 (guardrail prompt).
3. `docs/extension/Lane0_Verification_Report_2026-09-21.md` — Q4 (isManual) + Q5 (files/risk) for your lane.
4. `docs/extension/Logistics_Helper_v3_Open_Items_Resolved_2026-09-21_v2.md` — any open item that intersects your lane.
5. `BUILD_PROGRESS.md` — latest entry, test count (113), env fixes, supplier seed note.
6. **End of every lane:** `npx vitest run` → all green; `npx vite build` → green; 1-paragraph `BUILD_PROGRESS.md` entry with date.

## Annex E — Fast Supplier Ordering (Presets + One-Tap WhatsApp)

Lighter ordering path beside the formal PO flow. The PO gate is untouched: a formal PO still
requires zero open confirmations and real prices. Quick Order needs only item + spec + qty +
unit, so per-item eligibility replaces the global gate — with excluded items always counted
aloud, never silently dropped.

- **Presets** (`ItemSupplierPreset`, PK = itemKey): supervisor-set memory, global across
  projects, written only via the explicit "Always use this supplier for [item]?" checkbox.
  Never learned or suggested — a co-occurrence engine would be Kill List item 1.
  Resolution runs on row creation (seed, approval-insert) and re-import for still-unassigned
  rows, via `itemMatcher.itemKey` (shared function, not reimplemented). Manual assignments
  are never overridden; stale presets (supplier deleted) leave rows unassigned.
- **Assignment model:** `BomItem.assignedSupplierId` → `GlobalSupplier`. Grouping joins the
  record live — a dangling id falls back to Unassigned, which also covers the "item in a group
  lacks a supplier" edge deterministically. Assignment is relational: plain update, never
  locked, never merged.
- **Reference rule:** a Confirm entry references an item only through an explicit
  `(refItem, refSpec)` payload (i.e. new/removed pendings). `agent_question` rows carry no
  item ref and exclude nothing by themselves — mapping their prose to items would be
  inference. They still block the formal PO globally.
- **Phone rule (R1):** `normalizePhoneForWhatsApp` — digits, first `/`-segment only, leading
  `0` → `60` default, plausible shape `^60\d{8,10}$`, else `null` which blocks the send with
  a fix prompt (never dials a guess). Fixture table uses the real shipped contact strings.
- **Unassigned flow (R2):** per-row inline pickers always visible; the Unassigned Order button
  guides ("pick a supplier on each row") and focuses the first picker. Assigned rows move
  groups immediately, orderable in the same flow.
- **Note (R3):** optional per-send text appended as `Note: {text}`, transient except for an
  optional ride-along in the `quick_order_sent` log entry.
- **Decisions as specified:** partial orders allowed (ready items send, gaps counted aloud);
  presets global, not per-project. Phone default `60` is Malaysia-only — must not apply
  blindly if a non-Malaysian supplier ever appears.
- **Honesty copy:** preview modal shows the exact message; "Send via WhatsApp" opens
  `wa.me/{digits}?text=…` after writing the traceability log — the app never sends itself.

> *"A site supervisor drops the reconciled file, sees which of their projects it belongs to,
> resolves any open questions the agent flagged, taps through supplier assignment, generates a PO,
> and sends it — without the app ever asking them to trust a guess, without a shortage surfacing
> after the fact, and without a hand-edited number ever silently reverting."*
