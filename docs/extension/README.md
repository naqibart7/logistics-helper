# v3 Extension — Document Index (2026-09-21)

This folder contains Phase 1 → Phase 2 planning for the Logistics Helper v3 extension
(bot, sync, stock, payment voucher, check-in drafters, build lanes).

Core v3 code lives in `src/` and is governed by `SYSTEM_SPEC.md` (root).
These docs are **informative → become normative per lane when Naqib confirms.

## Read order (by audience)

### For Naqib (quick scan)
1. **[`Logistics_Helper_v3_Open_Items_Resolved_2026-09-21_v2.md` — short status tracker. §1 key-items decision table, §2 weekly report template RESOLVED, §4 baseline, §5 balance-reminder style, §6 what's resolved/open, **Next actions (5 items).
2. **[`Work_Map_and_System_Plan_v2.md`](#L12-L1)** — interviews → 4-bucket sort. Big picture numbers (4-7 projects, 9-15 orders/day, 3-5h/week reports, etc.). Everyday-work map × 7 areas, constraints, core insights (§5), v3 backlog §7.

### For an agent starting a Lane (use the architecture first)
1. `../SYSTEM_SPEC.md` → Annex C (lane table) → Annex B (deltas) → Annex E (fast ordering).
2. **[`Architecture_v1_Logistics_Helper_v3_Extension.md`](#L1-L13)** — 13-part plan: invariants (Part 2), components (Part3), data additions (Part4), sync options A-D (Part5), bot design (Part6), format mappings (Part7, 3 daily +weekly), **build lanes 0→Q→6a (Part8), testing/security (Parts9-10), decisions D1-D10 (Part11), open items (Part12), **Payment Voucher Appendix A (14 fields ↔ v3)**, guardrail prompts (Part13).
3. **[`Lane0_Verification_Report_2026-09-21.md`](#L1-L5)** — Lane0 DONE. Q1 change-log 7 fields (timestamp +projectId ✅). Q2 storage = Dexie/IndexedDB only. Q3 current UI after-import state. Q4 missing-item →removed_item_pending exact. Q5 per-lane file×invariant matrix. `isManual` two implementation options documented.

## Document cross-reference map

| Topic | Source |
|---|---|
| Everyday-work map, 4-bucket sort, constraints, 5 core insights | Work_Map §2-5 |
| v3 backlog §7 (Trust pass / manual add-item / sync / stock / payment / RORO / Monday | Work_Map §7 |
| Bot schedule / pings / check-in style / answers | Work_Map §8 + Architecture Part6 |
| Weekly report drafter sources / fixed format / Friday draft | Work_Map §9 + Open Items §2 (template) + Architecture Part7.4 |
| Three daily formats (Production / Delivery / Daily Report) — character-for-character | Architecture Part7.1-7.3 |
| Invariants / design principles (11 total) | Architecture Part2 |
| Sync: Dexie Cloud vs Firebase vs Supabase | Architecture Part5 + Lane0 §Q5 Lane2 |
| Change log exact fields from live code | Lane0 §Q1 → changeLogRepo.js lines 8-23 |
| Locked-field blocked attempts (NOT permanently logged) | Lane0 §Q1, item 3 |
| Storage = browser-local / what happens on clear-browser | Lane0 §Q2 |
| Merge engine: missing-item → removed_item_pending (RESOLVED) | Lane0 §Q4 → mergeEngine.js lines147-168 + Open Items §3.4 |
| isManual protection: Option A (wrapper) vs B (merge guard) | Lane0 §Q4 end + §Q5 Lane1B |
| Per-lane files touched + invariants at risk matrix | Lane0 §Q5 |
| Key items decision table (Keep/Drop/Change —14 rows, DRAFT) | Open Items §1 |
| Stock design rule: pure workshop vs demand-linked (Option A/B open) | Open Items §1 Stock design clarification |
| Baseline correction: paper tally NOW (not after go-live) | Open Items §4 |
| Balance reminder style: in-app badge first (Option B start) | Open Items §5 |
| Status table (8 rows, 2 RESOLVED, 6 Draft/Open) | Open Items §6 |
| Next actions for Naqib (5 items) | Open Items end |
| Decisions needed (D1-D10, D1/D4/D7/D8 decided 21Sep) | Architecture Part11 |
| Monday.com Payment Voucher: 14 fields → v3 source map | Architecture Appendix A |
| Agent guardrail prompt + Lane0 + Lane2-step0 + Lane6a prompts | Architecture Part13 |
| Sync option compare prompt (no code) | Architecture Part13 Lane2 step0 prompt |
| Build order: Lane0→1A+1B→2→3; Lanes4/5 provisional; 6a parallel approved | BUILD_PROGRESS Extension→Lane order + Annex C |

## Status summary (imported 2026-09-21)

✅ = done / done & verified from live code · 📝 = draft · ⚠️ = needs Naqib decision · ❓= open

| Item | Status |
|---|---|
| Lane0 Verify report | ✅ DONE (Lane0_Verification_Report_2026-09-21.md) |
| Change log schema +timestamp+projectId | ✅ RESOLVED (Lane0 Q1) |
| Merge: missing items =removed_item_pending | ✅ RESOLVED (Lane0 Q4 + Open Items §3.4) |
| Weekly Report template (character-for-character) | ✅ RESOLVED (Open Items §2) |
| Starter key-items list | 📝 DRAFT (Open Items §1, Naqib to fill Keep/Drop/Change) |
| Stock workshop-vs-demand linking rule | ❓ Open (Open Items §1) |
| Baseline numbers | ❓ Open → START PAPER TALLY NOW (Open Items §4) |
| Balance reminder: start with in-app badge (B) | ✏️ Revised recommendation (Open Items §5, Telegram = later) |
| isManual protection mechanism | ⚠️ Decision needed: A vs B (Lane0 Q4 + Q5) |
| Sync tech recommendation (D1) | ⚠️ Step 0 = options compare; Dexie Cloud A = leading (Architecture Part5 + Part11) |
| Minimal Telegram bot parallel start (D4) | ✅ Decided YES 21Sep; Lane6a (does not touch v3) |
| Project/supplier names to AI service (D8) | ✅ Decided YES 21Sep; bank details never |
| Payment voucher field map screenshots (D7) | ✅ Appendix A done; 12 of 14 pre-filled |
| Monday.com task updates | 🚫 ELIMINATE candidate (not required per boss/account team) |
| RORO meaning + dates | ❓ Open (Work_Map §3.5, §12 item11) |
| Pilot v1 confirmation + pilot project | ❓ After Lane0 (D10 Architecture Part11) |
