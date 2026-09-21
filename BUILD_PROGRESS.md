# Logistics Helper v3 — Build Progress

> Source of truth: [`SYSTEM_SPEC.md`](./SYSTEM_SPEC.md). This file is the build record.

Pipeline: `logistics_helper_v3_build_pipeline.md` (5 agents). Status: **all 5 agents done, verified**.
Follow-ups Task A (same-run fixtures) + Task B (dead-file deletion) + Tasks C/D (README count, supplier browser) + Tasks E/F (dedupe key, PO PDF) + Task G (Phase 5 audit): **done, verified** (G4 physical-device test is human-run — checklist below).
Verification: `npx vitest run` → **31 files, 113 tests, all pass**. `npx vite build` → **green**.

## Agent 1 — Parser ✅ (Task A: deep equality, 2026-09-11)
Files: `src/utils/importParser/{detectFormat,mdReader,xlsxReader,normalize,index}.js`
- Extension routing (`.md`/`.xlsx`), header-text section/sheet detection (no fixed positions),
  shared normalizer → single `ParsedImport` shape (`null` if absent, never guessed).
- Fixtures (`tests/fixtures/`) are now a **true same-run pair** — one Agent 6/7 run 2026-09-10
  (~14:00), exported as `.md` (15:01) and `.xlsx` (14:08, 8 sheets incl. supplier directory +
  change log). The Sep-08 xlsx from a different run was replaced.

| File | Title | BOM | Shortage | Suppliers | Change log |
|---|---|---|---|---|---|
| `Qwen_markdown_20260910_k171vvnlq.md` | SURAU DARUL DAKWAH | 52 | 6 | 14 | 5 |
| `Surau_Darul_Dakwah_BOM_A7_Grounded_Sourcing.xlsx` | SURAU DARUL DAKWAH | 52 | 6 | 14 | 5 |

- `parser.test.js` asserts **full deep equality** (`toEqual`) between the two `ParsedImport`
  outputs — same item count, same values field-by-field — plus anchor spot checks. Any
  cross-format data drift fails loudly.
- Three deterministic parser rules make deep equality hold (all in `normalize.js`/`mdReader.js`,
  documented in code): canonical `projectTitle` (location tail stripped — location belongs in
  `Project.location`, same rule as `projectMatcher.normalizeTitle`); numbers cleaned to 4dp
  (kills xlsx float dust, e.g. `28.000000000000004` from a 0.28 fraction); markdown-link URLs
  parsed greedily so paren-containing URLs (waze link) survive intact.

## Agent 2 — Data Layer ✅
Files: `src/data/{db,schema,projectRepo,bomRepo,supplierRepo,shortageRepo,changeLogRepo}.js` (+ `dexie` dep,
`fake-indexeddb` dev-dep for tests). IndexedDB via Dexie, schema exactly per spec.
`shortageRepo.js` added (schema table had no owning repo file; merge engine + UI need it).
Acceptance: write → `lockField` → `closeDb()`/`openDb()` → data + `lockedFields` intact (tested).

## Agent 3 — Merge Engine ✅
Files: `src/logic/{projectMatcher,itemMatcher,mergeEngine,seedProject,approvePending}.js`
- Exact spec algorithm: locked skip (reported, not logged) / unlocked diff → agent log + overwrite /
  new → `new_item_pending` (not added) / missing → `removed_item_pending` (not deleted) /
  `supervisorEdit` → lock + supervisor log. All three acceptance cases pass.
- Additions inside this layer (UI stays logic-free): idempotency guard (no duplicate open pendings
  on re-import), `seedProjectFromImport` (first-import path), `approvePending` (Confirm actions:
  insert snapshot / delete match / resolve). Pending rows carry a `snapshot` for approvals.

## Agent 4 — UI Screens ✅
Files: `src/screens/{ProjectsScreen,DashboardScreen,BomScreen,ConfirmScreen,SuppliersScreen,PoScreen,poGate}.js`,
`src/App.jsx` rewired (Projects entry → 5-tab project view). No business logic in components.
Hard rule: `resolveTabRequest('po', unresolvedCount)` → `'confirm'` when count > 0 (used by tab bar
and tested); `PoScreen` also re-checks the gate itself and renders a blocked panel with Go-to-Confirm.
The old DSG-B-only flow in `App.jsx` was replaced; its dead utils are now deleted (Task B).

## Agent 5 — QA ✅
Files: `tests/{parser,dataLayer,mergeEngine,poGate,supplierBrowser,poPdf,touchTargets,singleSource,e2eLockedField,xlsxUiImport,reimport,projectDelete,e2eFreshImport,redesignUi,approvePending,bomMigration,bomReorder,bomExportPdf,itemSupplierPresets,quickOrderGate,quickOrderMessage,quickOrderPhoneNormalize,quickOrderUi,projectMatcher,csvReader,csvExport,supplierCsvImport,supplierCsvUi,bomCategoryView,bomCountConsistency}.test.{js,jsx}` (Vitest). 108/108 pass.
`poGate.test.js` seeds the **real MD sample** (52 lines, 6 open confirmations) and asserts
PO-request → Confirm redirect, then gate opens after resolving all.
Test-count note: 14 → 11 was the Task A rewrite (7 shape-only parser tests consolidated into
4, with strictly stronger deep-equality assertions); 11 → 13 is Task D's new
`supplierBrowser.test.js` (2 tests); 13 → 18 Tasks E/F; 18 → 25 Task G; 25 → 27 md rework.
Task B removed zero tests — nothing live depended on the deleted files.

## Task B — Dead Kill-List files deleted ✅ (2026-09-11)
Deleted: `src/utils/excelParser/dsgB.js`, `src/data/structuralKits.js`, `src/utils/coverageRules.js`
(empty parent dirs `src/utils/excelParser/`, `src/components/` removed too).
`src/components/QuickKitPrompt.jsx` + `CoverageGate.jsx` never existed (spec §3 "Removed from
v1.0.0" — they were never built); verified absent. Grep for `parseDSGB`, `STRUCTURAL_KITS`,
`findMatchingKit`, `validateCoverage`, `coverageRules`, `structuralKits`, `excelParser`,
`QuickKitPrompt`, `CoverageGate` across `src/` + `tests/`: **zero hits**. Tests + build green.
Phase 5 "zero Kill List items" audit now passes on presence (remaining Kill List items were
never introduced).

## Task C — README count ✅ (2026-09-11)
One line: `npx vitest run` comment 14/14 → 11/11 → 13/13 (Task D) → 18/18 (Tasks E/F) → 25 (Task G) → 27 (md rework) → 34 (H-tasks) → 43 (redesign) → 44 (canonical-name) → 53 (L/M) → 83 (fast ordering) → 85 (Task N) → 100 (supplier CSV) → 104 (slice 8) → 108 (slice 9) → 113 (supplier seed).

## Task D — Global supplier browser ✅ (2026-09-11, closes Delta D5)- New `src/logic/supplierLinking.js`: single home of the dedupe-by-normalized-businessName
  rule (`linkSupplierEntry`: find-or-create + link). `seedProject.js` refactored onto it —
  same behavior (poGate full-seed test still green). `mergeEngine.js` and the import path
  untouched.
- `SuppliersScreen.jsx`: "Browse All Suppliers" opens the full `GlobalSupplier` directory —
  search box over name/specialty/address/contact (region via address text, e.g. "Kuching"),
  data-driven tag chips, per-row Link / Linked ✓ (idempotent `put`). Tapping runs the shared
  rule: only a `ProjectSupplierLink` is ever added, never a duplicate supplier record.
- `tests/supplierBrowser.test.js` (2 tests): A seeded with one supplier from its own import;
  B browses + links it → exactly 1 `GlobalSupplier` row + 2 links (one per project, same id);
  re-link and case-variant entries never duplicate.
- Spec: D5 logged done-with-date in Annex B, Annex A row reflects the browser, D5 removed
  from Annex C item 2. D3 (audit toggle) and D6 (PO PDF/WhatsApp) unchanged in the queue.

## Task E — Harden supplier dedupe key ✅ (2026-09-11)
`supplierLinking.js` dedupes on **(normalized name, normalized address)** — both must match.
Same common name in different towns ("ABC Hardware" Betong vs Kuching) now stays two records
instead of silently merging. New case in `supplierBrowser.test.js`; existing same-name /
case-variant cases pass unchanged. Spec D5 text updated to the hardened rule.

## Task F — Phase 4: PO PDF + WhatsApp ✅ (2026-09-11, closes Delta D6)
- New `src/logic/poDocument.js`: `buildPoLines` (same `BomItem[]`), missing price
  (null/blank/NaN — explicit 0 stays a real price) → TBD line, `buildPoTotal` sums priced
  lines only, `renderPoPdf` (jspdf, compression off, ASCII deterministic bytes),
  `buildWhatsAppLink` = exact `https://wa.me/?text=…&attachment=po.pdf` shape.
- `PoScreen.jsx`: Generate PO button lives only in the already-open gate branch; the
  on-screen table shows TBD instead of zero-filled RM 0.00; the WhatsApp anchor derives
  strictly from pdfUrl state (no PDF → no link, by construction). `poGate.js`, parser,
  merge engine untouched.
- `tests/poPdf.test.js` (4 tests): resolved-gate open; TBD-only-on-missing-row + 336 total;
  PDF bytes contain project/item names, TBD, and 336.00; link shape exact.
- Spec: D6 logged done-with-date in Annex B, Annex A row reflects the deliverable, Phase 4
  marked done in Annex C item 2. D3 (audit toggle) deferred as agreed — untouched.

## MD rework — pandas-export variant ✅ (2026-09-11)
Root file `Surau_Darul_Dakwah_BOM.md` (pandas dump: title/metadata rows above the true
header, `Unnamed:` columns, 6 sections, no supplier/change-log sections) parsed to
all-zeros — `parseTables` assumed block[0] is the header. Fixed in `mdReader.js`: each
typed parser now locates its own true header row by content, separator rows stripped
centrally, plus a numbered-`#` guard so note/total rows can't leak in as items. Result:
52 lines + 6 confirmations (was 0/0/0/0); Qwen + xlsx outputs byte-identical to before
(deep-equality still holds, no regression). Regression-locked by
`tests/fixtures/Surau_Darul_Dakwah_BOM.md` + 2 new parser cases (not deep-equal to Qwen —
different export wording, same anchor values).
Note: root `Surau_Darul_Dakwah_BOM_A7_Grounded_Sourcing.md` is byte-identical (same SHA)
to the Qwen fixture — same file under two names, parses 52/6/14/5 with no changes.

## Task H1 — xlsx import crash ✅ (2026-09-11, blocking)
Reproduced exactly (`Import failed: Cannot read properties of undefined (reading 'map')`)
by driving the real xlsx through the UI path in jsdom. Root cause: a missing `await` on
async `parseXlsx` inside `parseImport` shipped a Promise as ParsedImport (unit tests always
awaited it directly, so only the UI path crashed). Fixed + hardened: every sheet/section
parse resolves non-arrays to `[]`, `buildParsedImport` tolerates explicit `null`, new
`friendlyImportError` (password/corrupt/empty → specific messages, raw JS strings go to
console only), `isEmptyImport` guard refuses content-less files without creating a project.
Regression: `tests/xlsxUiImport.test.jsx` (real xlsx → 52/6/14 through the UI + message mapping).

## Task H2 — reimport routing + suppliers ✅ (2026-09-11, most important)
Investigation first: the seed path was correct — a fresh import always seeded. The "98
pendings + no suppliers" came from the MATCH path: a second import of the same project
merged (by design) but merge never touched suppliers, and cross-run item keys queued
everything as pending (52 new + 44 removed + questions ≈ the reported count). Fix: new
`src/logic/reimportProject.js` orchestrator (merge diff + supplier linking via the shared
rule; `mergeEngine.js` untouched), wired into `ProjectsScreen`. `tests/reimport.test.js`
(3 tests): clean re-import, price+supplier update without dupes, new-line pending intact.

## Task H3 — tappable edit targets ✅ (2026-09-11)
The wire-up existed and was tested (G3) — users tapped the qty/price VALUES, which weren't
clickable, only the small Edit buttons. Qty + unit-cost cells now open the same
`supervisorEdit` editor (cursor pointer, larger padding, 🔒 shown inline in the cell).
No logic touched. G3's assertion updated for the new "99 🔒" cell text.

## Task I — project deletion ✅ (2026-09-11, new scope)
Two-tap Delete per project on `ProjectsScreen` ("Tap again to confirm delete") over the
existing cascading `deleteProject` (BOM, confirmations, links, log go; `GlobalSupplier`
records survive — verified). `tests/projectDelete.test.js`: cascade exact, survivor link
intact, supplier re-linkable from a new project. This is also the cleanup path for H2-style
compounded imports: delete the messy project, re-import clean.

## Task J — fresh-import e2e ✅ (2026-09-11)
`tests/e2eFreshImport.test.jsx`: brand-new project, real `.md`, first import through the UI
(not a repo call) → exactly 52 BOM / 6 confirm (all `agent_question`, zero spurious pendings)
/ 14 suppliers; then a value-cell edit persists and locks. The scenario that hid H2/H3 is
now the suite's strictest test.

## Redesign — full-scale UI/UX ✅ (2026-09-11, pipeline `material_logi_ui_ux_redesign_multi_agent_pipeline.md`)
Phases 0–5 executed with handoffs in `docs/redesign/handovers/01–07`, decision register,
summary, and QA evidence in `docs/redesign/`. Direction A (Site Ledger) locked 8.15–6.95.
Delivered: token foundation, text tabs + live Confirm badge, import progress copy, BOM
row-list with keyboardable cells, grouped Confirm, diary Dashboard, labelled search, TBD
row-list PO, "Open in WhatsApp" honesty copy, 150/120ms motion with reduced-motion kill.
Two correctness fixes from evidence: PO banner erased by tab effect (fixed + persistence
test), "Send via WhatsApp" implied sending (fixed). 34 → 43 tests (redesignUi 5,
approvePending 3, touchTargets +1). Before/after shots (8+8+2) via re-runnable
`docs/redesign/artifacts/shoot*.mjs`. Invariants all PASS (07); kill-list grep zero.
G4 physical-device run remains human-open. Primary color moved #0284c7 → #0369a1 on
computed contrast evidence (4.10 fail → 5.93 pass).

## Parser — canonical-name headers ✅ (2026-09-14)
`xlsxReader.js` accepts Master BOM item columns named "Item / Canonical Name" (leading-word
match, no ID-column confusion) and prefers the Master title row over the dashboard summary
for the project title (keeps quotation refs like Q260163). Synthetic workbook test in
`parser.test.js`; xlsx↔md deep-equality still holds.

## Task L — Line numbering + reorder ✅ (2026-09-14, before M per ticket)`BomItem.displayOrder` (cosmetic-only; absent from MERGE_FIELDS so merge/itemMatcher can't
see it) + `Project.client` (manual, optional, Dashboard edit, never inferred). Seed assigns
import order; approvals append at max+1; `bomRepo.reorderBomItems` persists full orderings
in one transaction; legacy rows backfilled once by a Dexie v2 upgrade (genuine v1 DB test).
`BomScreen` shows `#` badges, drag-to-reorder (desktop) + ▲▼ buttons (touch), Export BOM
button placed top-of-screen. Acceptance: move-3-to-1 persists across reload; re-import
leaves order + locks untouched with zero conflicts. `tests/bomMigration` (1),
`tests/bomReorder` (5 incl. UI buttons). One self-caught slip: deleted shared `clamp`
helper while adding the date formatter — restored (zero usages, but no silent deletions).

## Task M — Export BOM PDF ✅ (2026-09-14)
New `src/logic/bomExportDocument.js` only — `poDocument.js`/`poGate.js` untouched. Header
block (title, project + location, client or graceful blank, quotation date from latest
import note, Agent 6/7 source default, current generation date), 52 rows in displayOrder,
category roll-up (line counts cover all rows, subtotals priced-only), grand total.
Missing price → TBD row, excluded from both subtotal and grand total. `tests/bomExportPdf`
(3 tests on the real fixture: header/blank-client, independent-arithmetic subtotals +
50507 grand, TBD exclusion 50507−336=50171 with byte assertions). Client UI covered in
`redesignUi` (+1). Caught by its own test: my hand arithmetic wrote 50371 — the suite
does its job.

## Fast Supplier Ordering ✅ (2026-09-15, ticket FAST_ORDER_FEATURE_SPEC.md)
Presets + one-tap WhatsApp beside the PO flow (`SYSTEM_SPEC.md` Annex E). New: `presets`
table (Dexie v3), `ItemSupplierPreset` repo, `BomItem.assignedSupplierId`, `quickOrder.js`
(eligibility/message/phone/link pure functions), preset resolution in seed/approve/reimport,
BomScreen picker + Unassigned-first grouping + preview modal. PO gate, merge engine, and
`poDocument.js` untouched. Decisions as specified: partial orders allowed, global presets,
R1 first-segment + `60` default with shape gate, R2 inline pickers, R3 transient note.
5 new test files (incl. real-fixture phone sweep); 83/83 green.
Stability note: one transient timeout flake in `redesignUi` client-save under full-suite
parallel load — struck twice total (Task N era + CSV gate run), green on immediate re-run
both times, same signature. Sole flake on record; tolerance already at 5s.
Found in the wreckage: stored `BomItem` was silently dropping `unit`/`pack` (every seeded
row read back unit-less) — restored + merged (D15); `byDisplayOrder` deduplicated to
`utils/helpers.js` so message numbering matches the screen.

## Task N — xlsx title on inverted sheet order ✅ (2026-09-15, was OPEN investigation)
Reproduced on the real file (`Artseven_BOM_Q260163_Kediaman_Puan_Hashima_v2.xlsx`):
title parsed as "V2 COST SHEET" (last dash-chunk of the Master title) with null location —
the 2026-09-14 master-preference fix regressed this by preferring a title row it couldn't
parse. Sheet selection was already content-based (both fixtures are dashboard-first, so
order never mattered); the bug was pure title parsing. Fixed in `normalize.js`: the project
name is the chunk immediately AFTER the BOM marker (never the last chunk), trailing
parenthetical refs stripped (`X (S71354)` → `X`; refs differ per export and are not the
name). `normalizeTitle` strips parens too, so re-quotes of one site match. The earlier
synthetic test expecting a ref-bearing title was updated to the bare name (documented
reversal — refs aren't stable identifiers). Result: `KEDIAMAN PUAN HASHIMA`, 11/4/7/7;
Surau deep-equality still holds.
Regression: real file staged as fixture + swapped-order synthetic + `tests/projectMatcher.test.js`.
Location note: `Project.location` was never populated by any import (pre-existing gap, not
this regression) — still unpopulated by design; flagged as follow-up, not smuggled in here.

## Supplier CSV import/export ✅ (2026-09-15, pipeline CSV_IMPORT_AGENT_PIPELINE_PROMPT.md)
Four agents in order (1+3 parallel-safe, then 2, then 4): `csvReader` (header-name matching,
quote handling, `;`-split tags, spreadsheet-numbered rejections) → `csvExport` (fixed column
order, inverse join, header-only empty) + `getAllSuppliersForExport` (businessName-ordered
stable read) → `supplierCsvImport` (existing linkKey reuse, skip-by-default, flag-gated
non-blank overwrite, dryRun for pre-commit counts) → `SuppliersScreen` Export/Import buttons
+ preview-then-confirm + verbatim summary. One orchestrator addition: dryRun (the confirm
step needs exact counts without writing — no client-side re-deriving). One test-authored
correction: overwrite matching needs name AND address (the dedupe key), caught by its own test.
`supplierLinking.js` imported, never modified. Gate: 100/100 + build green + manual real-data
round-trip (14 fixture suppliers → export → re-import → 0 created, 14 skipped).

## Visual polish pass ✅ (2026-09-16, parallel agent, landed uncommitted)
Page-header eyebrows, stat-grid Dashboard, labelled file-picker button, hover/active
button states, banner-ized status cards, responsive tab-bar + stat rules — all verified
presentational-only (headers, classes, CSS; zero logic/data changes across `App.jsx`,
`index.css`, Confirm/Dashboard/Projects screens). One test casualty from split heading
text (`Confirm (2 open)` → `Confirm` + count span), repaired to the new contract.
100/100 green after repair.

## Slice 8 — redesign follow-ups ✅ (Tickets 1–6, evidence-led)
Evidence refreshed first (10 shots on current main; D18 file-picker confirmed fixed;
shoot.mjs needed exact-text repair as picker labels now carry item names). T1: NULL contacts
render "Contact not listed". T2: severity value set is {LOW, MEDIUM, HIGH, INFO} mixed-case —
lookup normalized; LOW gray / MEDIUM amber / HIGH red / INFO default, all contrast-computed.
T3: locked gets its own cool blue (the real collision was LOW-vs-locked sharing default white).
T4: 1024px breakpoint re-flows row-lists to grid (markup untouched). T5: display-only category
grouping with Suppliers/Category/All toggle — default stays Suppliers (deviation from the
ticket's flat-default: fast-ordering shipped grouped-first and the 1-minute flow depends on
it; one line to flip if overruled). Reorder/merge/storage untouched; flat toggle reproduces
displayOrder exactly (tested incl. storage re-read). 100 → 104 tests. Honest limit logged:
jsdom can't resolve `var()` colors, so tint contracts assert classes + literal computed pairs.

## Slice 9 — redesign follow-ups ✅ (Tickets 7–8, evidence-led)
T7: Tab bar at 320–390px — Suppliers/PO tabs unreachable on device. Fixed: tab bar switches
to `overflow-x: auto` with horizontal scroll at ≤640px; buttons use `flex: 0 0 auto` so they
don't compress below content width; labels switch to short forms (Dash/Cfm/Supp) below the
breakpoint; hidden scrollbar on WebKit. BOMScreen duplicate-key warning fixed (index-suffixed
unassigned group keys). All 6 tabs in DOM and tappable at 320px (CSS contract asserted).
T8: "Unassigned (53)" vs header "BOM (52)" — async load timing bug in test. Rewrote
`bomCountConsistency.test.jsx` to capture header count AFTER async data loads (wait for rows
before reading heading). Three tests: flat-view count, supplier-group sum, category-group sum.
Also cleaned up BomScreen debug console.logs, deleted 3 debug test files (debugHeader 1–3),
fixed `redesignUi.test.jsx` PO-tab selector to use `getByRole` instead of `getByText` with
nested-span selector. 108/108 green.

## Environment fixes (pre-existing, not pipeline scope)
- `npm install` fails with arborist `edgesOut` on this machine (vitest peer graph) → use
  `npm install --legacy-peer-deps`. Generated `package-lock.json` is committed.
- `vite build` failed: `minify: 'terser'` with terser not installed (pre-existing) → `'esbuild'`.
- `fake-indexeddb` placed in `devDependencies` (test-only).

## Explicitly NOT built (per spec)
Agent 6/7 BOM producers, multi-user backend. (PO PDF + WhatsApp landed in Task F.)

## Deployment (Vercel, 2026-09-11)
- Live: **https://material-logi.vercel.app** (production, Ready; also
  `material-logi-nart7s-projects.vercel.app`). Project `material-logi` under the
  personal Vercel scope, auto-detected as Vite (`vite build` → `dist`).
- `.npmrc` (`legacy-peer-deps=true`) added so Vercel's `npm install` avoids the
  vitest peer-graph arborist bug; `.vercel/` linkage gitignored (local only).
- Open items: Deployment Protection (Vercel Authentication) is ON — the URL serves
  an auth wall until disabled in Project Settings or opened via bypass token.
  No GitHub auto-deploy wired (project was created from local files); connect the
  repo in Project Settings → Git for push-to-deploy.
- Redeploy 2026-09-11 (md rework): 27/27 green, build green, pushed + redeployed.
- Redeploy 2026-09-11 (H1/H2/H3/I/J): 34/34 green, build green, pushed (05af8cd) + redeployed production Ready.
- Redeploy 2026-09-12 (redesign): 43/43 green, build green, pushed + redeployed production Ready (aliases repointed).
- Redeploy 2026-09-14 (canonical-name xlsx): 44/44 green, pushed + redeployed production Ready.
- Redeploy 2026-09-14 (L/M): 53/53 green, build green, pushed (2944760) + redeployed production Ready.
- Redeploy 2026-09-15 (fast ordering): 83/83 green, build green, pushed (ed8ba9d) + redeployed production Ready (first attempt hit a transient Vercel fetch error; retry clean).
- Redeploy 2026-09-15 (Task N): 85/85 green, build green, pushed + redeployed production Ready.
- Redeploy 2026-09-15 (supplier CSV): 100/100 green, build green, pushed + redeployed production Ready.
- Infra note 2026-09-15: full-suite default run once OOM-killed workers mid-run (environment,
   not code — 66 counted, 3 fallout failures). Re-ran with `npx vitest run --maxWorkers=2`:
   24 files, 85/85 green. Use constrained workers on small machines.
- Redeploy 2026-09-17 (Slice 9): 108/108 green, build green, pushed to A7SForce/Material-Logi + redeployed production Ready.
- Redeploy 2026-09-17 (supplier seed): 113/113 green, build green, pushed (ed8a42f) + redeployed production Ready.

## Extension docs & Phase 2 planning ✅ (imported 2026-09-21)
Three planning documents + one Lane 0 verification report imported from outside the repo
and placed in `docs/extension/`. These are Phase 1 (Work Map) → Phase 2 (Architecture) of the
v3 extension, covering the bot, sync, stock, payment voucher, check-in drafter, and build lanes.
They contain no code and do not touch invariants.

| File | Purpose |
|---|---|
| `docs/extension/Work_Map_and_System_Plan_v2.md` | Phase 1 (Deep Brainstorming). Everyday-work map, 4-bucket sort, constraints, core insights, v3 backlog, bot draft, open items. |
| `docs/extension/Architecture_v1_Logistics_Helper_v3_Extension.md` | Phase 2 (System Architecture). 13-part plan: components, data additions, sync design, bot design, format mappings, build lanes 0→Q+6a, decisions D1–D10, security, Payment Voucher Appendix A map, agent guardrail prompts. |
| `docs/extension/Logistics_Helper_v3_Open_Items_Resolved_2026-09-21_v2.md` | Status tracker. Weekly Report template (RESOLVED from real files), baseline correction, balance-reminder style revised (start with in-app badge), 6-item status table + next actions for Naqib. |
| `docs/extension/Lane0_Verification_Report_2026-09-21.md` | **Lane 0 DONE (no code).** Verified answers to the 5 architecture questions, taken from live code: change-log schema (7 fields, timestamp+projectId present, no BomItem FK — §Q1), browser-only-IndexedDB storage (§Q2), current import/post-import UI state (§Q3), missing-item → `removed_item_pending` (§Q4, RESOLVED), per-lane file+invariant matrix (§Q5). Resolves 2 rows of the Open Items §6 table (change log + blocked locked attempts: confirmed NOT permanently logged). |

### Lane 0 resolved facts (for quick reference)
1. **ChangeLogEntry = 7 fields.** `{id, projectId, timestamp (ISO), actor, field ("Item :: fieldName"), oldValue, newValue}`. Every entry carries `projectId` + `timestamp`. No BomItem FK — item identity is the `field` string prefix. Code: [changeLogRepo.js](file:///d:/Desktop/Material_logi/src/data/changeLogRepo.js#L8-L23), [schema.js](file:///d:/Desktop/Material_logi/src/data/schema.js#L21-L22).
2. **Storage = Dexie / IndexedDB only.** Clear browser data → everything lost. No server, no cloud, no sync. Safety net today: BOM PDF export + PO PDF export + Supplier CSV export. Code: [db.js](file:///d:/Desktop/Material_logi/src/data/db.js#L1-L11).
3. **Locked-field blocked attempts = NOT permanently logged.** They live only in runtime `MergeResult.skippedLocked[]` (lines 102–104 of mergeEngine.js). Evidence vanishes after the import finishes. Lane 1A may optionally persist them if desired. Code: [mergeEngine.js](file:///d:/Desktop/Material_logi/src/logic/mergeEngine.js#L99-L105).
4. **Missing items on re-import = `removed_item_pending` (RESOLVED, per §3.4 of Open Items).** BomItem stays, Confirm row blocks PO, Approve = delete, Dismiss = keep. Idempotency guard = no duplicate pendings. Code: [mergeEngine.js](file:///d:/Desktop/Material_logi/src/logic/mergeEngine.js#L147-L168).
5. **`isManual` protection = decision needed, two implementation paths documented** in Lane 0 §Q4 + §Q5 matrix. Option A = `reimportProject.js` wrapper (merge untouched). Option B = 1-line guard in `mergeEngine.js` missing-items loop (explicit lane-approval required per Architecture invariant 2).

### Lane order (post-Lane-0, hybrid as chosen)
Lane 0 ✅ → Lane 1A (Trust pass / scorecard) + Lane 1B (Manual add-item / `isManual`) → Lane 2 (Sync+backup) → Lane 3 (Stock record pilot). Lanes 4–5 + 6a provisional; Lane 6a (minimal Telegram bot) approved for parallel start (D4, does not touch v3). Lane Q (QA) after every lane.

## Lane 1B — Manual add-item + Option A quarantine ✅ (2026-09-21, 8 new tests, 121/121 green, build green)
**Scope** (per Work Map §7.3 + Architecture Part 8 Lane 1B):
- Phone-first single-screen Add item: item + spec + qty + unit (required); one-tap reason tag
  (site / missing / correction); optional category / notes; auto-timestamp addedAt.
- Confirmed immediately — never queued as new_item_pending. `displayOrder = max+1` so
  new rows land at bottom of BOM.
- **Provenance fields on BomItem (Dexie `db.version(4)` upgrade, nullable, non-indexed):**
  `isManual` (bool, `true` = hand-added, never null after a write), `source` ("manual"/"import"),
  `reasonTag` (site feeds the later drafter's late-request count), `addedAt` (ISO).
  Schemaless fields for existing rows (null); `defaultBomItem` gating to prevent wrong-shape
  (e.g. `isManual: partial.isManual === true ? true : null`).
- **Option A protection (mergeEngine untouched per Architecture invariant 2):**
  `reimportProject.js` shims `deps.listBomItems` with a filter that hides `isManual === true`
  rows from the merge engine's `missing-items loop` (Lane 0 §Q4 says the loop iterates rows
  received via `deps.listBomItems(projectId)` → filter there is the **entire** protection).
  Returns `manualQuarantined` as instrumentation. No changes to `mergeEngine.js`, `poGate.js`,
  `supplierLinking.js`, or `poDocument.js` — invariant #2 holds.
- **Changelog prove-it:** every manual add writes a ChangeLogEntry: `actor=supervisor`,
  `field = "ItemName :: manual_add (reasonTag)"`, `oldValue=null`,
  `newValue = "added qty N unit — spec"`. Timestamps + projectId already on every entry
  (Lane 0 §Q1 verified).
- **UI flow:** BOM tab header gains a "+ Add item" button (between Export and Suppliers view).
  Opens `AddItemScreen` as an in-project sub-screen in App.jsx (`subScreen='addItem'` stack
  state — preserves project/tab context, tab bar stays rendered with BOM highlighted,
  Back + Cancel both return to BOM and trigger a reload.

**Files touched:**
- [schema.js](file:///d:/Desktop/Material_logi/src/data/schema.js) — MANUAL_REASON_TAGS, JSDoc for new fields; `defaultBomItem()` gated write of all 4 new fields.
- [db.js](file:///d:/Desktop/Material_logi/src/data/db.js#L34-L38) — Dexie `db.version(4)` upgrade (stores unchanged; Dexie allows non-indexed fields transparently).
- [bomRepo.js](file:///d:/Desktop/Material_logi/src/data/bomRepo.js#L86-L165) — `addManualItem` (validation → create → set display order → changelog append). `default` export updated.
- [reimportProject.js](file:///d:/Desktop/Material_logi/src/logic/reimportProject.js#L9-L58) — Option A filter shim over listBomItems; returns `manualQuarantined`; merge engine 0 lines touched.
- [AddItemScreen.jsx](file:///d:/Desktop/Material_logi/src/screens/AddItemScreen.jsx) — new (phone-first single screen, 48px buttons, submit disabled until ready, per-field copy, reason radio-tap trio).
- [App.jsx](file:///d:/Desktop/Material_logi/src/App.jsx#L8-L163) — imports AddItemScreen, new `subScreen` stack state, renders AddItem sub-screen above tab bar, passes `onAddItem` prop to BomScreen.
- [BomScreen.jsx](file:///d:/Desktop/Material_logi/src/screens/BomScreen.jsx#L77-L416) — signature + button (`+ Add item`). One ARIA disambiguation fix: Flat-view "All" button now carries `aria-label="All items flat view"` to keep TestingLibrary / BomScreen callers unique (resolves the `bomCountConsistency.test.jsx` collision caused by the new +Add button).
- [manualAddItem.test.js](file:///d:/Desktop/Material_logi/tests/manualAddItem.test.js) — 8 NEW tests covering provenance field writes, validation (4 empty-field throws), invalid reasonTag fallback + addedAt not overridable, displayOrder increments, `manual-only → 0 removed_pending`, `mixed project → manual protected AND absent-imported → still removed_pending`, reimport idempotency (no duplicate removed_pending after 2nd run with empty import), and merge semantics intact (price updates still apply on imported rows while manual rows remain untouched).
- [bomCountConsistency.test.jsx](file:///d:/Desktop/Material_logi/tests/bomCountConsistency.test.jsx#L53-L112) — fix only: all 3 renders now pass `onAddItem={() => {}}` stub; flat-view selector uses the unique `All items flat view` aria-label. No test semantics changed.

**QA:**
```
npx vitest run →  32 files, 121 tests PASS  (was 113)
npx vite build →  455 modules, 4.13s green  (was 454)
```

## Lane 6a — Minimal Telegram Daily Report bot ✅ (2026-09-21, separate repo `d:\Desktop\lh_bot_6a`, 11/11 tests pass)
**Scope** (Architecture Part 8 Lane 6a): private Telegram chat with Naqib, one end-of-day
10-topic check-in, drafts the Daily Report in the EXACT character-for-character Malay-headings
format, sends draft back to chat for manual edit + copy-post. Never auto-posts.

**Design decisions / invariants held:**
- **Parallel-approved, no v3 touch:** lives in `d:\Desktop\lh_bot_6a\`, separate repo.
- **Bot token from env only:** `TELEGRAM_BOT_TOKEN` from `.env` (`.env.example` template provided; never in code, never in JSON). `TELEGRAM_ALLOWED_USER_ID` gate → 0 = allow any private chat (dev-only), else numeric = only that user.
- **No bank details ever:** storage `assertSafe` walks primitives before writing JSON; 12+ consecutive-digit user strings are refused (except storage-controlled fields: `id`, `createdAt`, `updatedAt`, `addedAt`, `date`, `sourceCheckins`). Also checked inline in the answer handler before accept.
- **Never guess, never auto-post:** blank answers → `-` placeholder in format; obstacles only render the `defaultIfEmpty = Tiada` when explicitly configured AND the answer is empty; real answers always win. Draft is echoed into chat with "semak, edit, copy-paste hantar sendiri" preamble.
- **Data-driven topics:** edit `data/topics.json` (10 daily, 2 Mon/Fri refresh) — no rebuild.
- **One gentle reminder:** per-day, per-chat state in `reminders.json`; after 21:30 local + not yet drafted + not mid-check-in, a single `/eod` nudge fires.

**Bot commands:** `/start`, `/eod`, `/projects`, `/batal`, `/skip` (optional-only), `/remindme`, `/done` (project list close).

**Repo map:**
```
d:\Desktop\lh_bot_6a\
├── README.md                  run guide, scope, commands, deploy notes
├── package.json               node ≥20, start/test scripts, dotenv + node-telegram-bot-api
├── .env.example               TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID, DATA_DIR
├── .gitignore                 node_modules / .env / data/*.json (except example)
├── data/
│   ├── topics.json            10 daily topics + Mon/Fri project refresh config
│   └── projects.example.json  example starter list (11-test fixture)
├── src/
│   ├── storage.js             4-bucket JSON storage with 12-digit bank-details guard
│   ├── dailyReport.js         pure fn → character-for-character Daily Report build
│   └── bot.js                 command handler, state machine, callable test interface, wire()
└── tests/
    └── all.test.js            11 tests using makeTestBot() callable interface
```

**Tests (11/11 pass via `npm test` = `node --test tests/`):**
1. `formatDate` — dd/m/yyyy no leading zeros
2. Daily Report empty-all headings LITERAL match + `Tiada` default applied only when configured
3. Real answers pass through untouched, no "Generated by" / [insert] placeholders
4. Malay headings are never translated (strict line identity check)
5. Obstacles defaultIfEmpty semantics: no-default → no Tiada, with-default → Tiada, real-answer wins
6. Storage refuses user strings with 12+ consecutive digits; RM 210 / epoch-milli ids / dates all pass
7. E2E full 10-answer check-in → draft rendered with every answer
8. Bank-digit answer sent mid-check-in → refused, check-in stays on the same topic
9. `/skip` on a non-optional topic → "wajib / tak boleh" reply, not skipped
10. Project list refresh via `/projects` → 2 lines → `/done` → 2 rows saved + echoed
11. `topics.json` has all 10 required ids + Mon/Fri refresh blocks

## Run
`npm install --legacy-peer-deps` · `npm run dev` · `npx vitest run` · `npx vite build`
**Lane 6a run:** `cd d:\Desktop\lh_bot_6a ; npm install ; cp .env.example .env` (fill the token), then `npm start`. Run tests: `npm test`.

## Supplier library seed ✅ (2026-09-17, CSV import)
130 unique suppliers parsed from `suppliers_2026-09-15.csv` (133 rows, 3 duplicates removed).
Categories mapped to `tags[]`, WhatsApp → `contact`, Location → `address`. Seed file
`src/data/seedSuppliers.json` checked into repo. `seedInitialSuppliers()` in `db.js` loads
the directory on first app open (no-op if already populated). SuppliersScreen browse + CSV
export/import unchanged — the seed is the starting directory, not a replacement for runtime
management. `tests/supplierSeed.test.js` (5 tests): loads all, idempotent, required fields,
phone presence, tags mapping. 113/113 green, build green.
