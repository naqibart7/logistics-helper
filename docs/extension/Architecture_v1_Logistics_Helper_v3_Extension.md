# Architecture v1: Extending Logistics Helper v3 (Draft)

**Owner:** Naqib
**Date:** 21 Sep 2026
**Phase:** 2 of 4, System Architecture (no code in this file)
**Reads with:** `SYSTEM_SPEC.md` (source of truth for v3) and `Work_Map_and_System_Plan_v2.md` (requirements)
**Audience:** Naqib first (Part 1), then Antigravity agents (Parts 2 to 13)

> Privacy: no bank details, client names or passwords belong in this file or in build prompts. At runtime, drafts may use project and supplier names (approved 21 Sep), but never bank details.

**Status:** Naqib asked to move to architecture. Pilot v1 is still unconfirmed, the change log contents are unverified, and the starter key-items list is missing. Lane 0 (Part 8) settles the first two. Everything below that depends on an unverified fact is marked **(verify)**.

---

# Part 1. Plain-language overview

## The idea in one picture

Think of a small workshop office with four helpers:

| Helper | What it is | Analogy |
|---|---|---|
| **v3 app** | Your order desk on phone and laptop. Works offline. | The desk where orders are written |
| **Sync + backup** | Keeps phone and laptop identical and safe | A notebook that follows you everywhere |
| **Daily check-in bot** | Asks a few tap-to-answer questions on Telegram | An assistant who asks "how was today?" |
| **Report drafters** | Turn your answers into your three daily posts and the weekly report | A writer who prepares drafts for you to edit |

```
  Phone v3  <---- sync ---->  Cloud copy  <---- sync ---->  Laptop v3
                                 |
                 (facts: orders, trips, late items)
                                 |
                                 v
        Telegram bot  --->  Drafters (daily x3, weekly)  --->  You review, edit, post
```

## The rules that keep it simple

- **v3 stays first.** It works with no signal. The cloud is a copy, not the boss.
- **Nothing is sent without you.** Drafts only. You post to WhatsApp, Telegram and Monday.com.
- **Nothing is silently changed.** Originals stay, changes get dates.
- **Under 2 minutes a day** of your effort.
- **Bank details never leave v3.** Not in the bot, not in PDFs, not in AI prompts.

## What changes for you

| Today | After |
|---|---|
| Typing three daily posts and a daily report | Answer a few taps, get drafts, edit, post |
| Checking stock by walking around | Predicted stock, check only doubtful items |
| Retyping payment requests (3-5 min each) | Tap copy on pre-filled fields |
| Data on one device | Phone and laptop always match, with backup |
| Typing late items into chats | One-tap add-item with reason and date |

---

# Part 2. Design principles and invariants (for agents)

1. **Local-first.** v3 works offline. The cloud copy is secondary.
2. **Additive only.** Add new tables, modules and screens. Do **not** modify `mergeEngine.js`, `poGate.js`, `supplierLinking.js`, or `poDocument.js` unless a lane says so and Lane 0 confirms the need.
3. **Follow the v3 pattern:** data layer (`src/data/*Repo.js`), logic (`src/logic/*`), thin UI (`src/screens/*`). No business logic in components.
4. **Schema changes need a Dexie version bump with a tested migration** (as with the displayOrder and presets changes).
5. **No silent overwrites, no silent deletions.** Every change is logged with a timestamp.
6. **Human in the loop.** Generated PO, WhatsApp, Telegram and Monday.com text are drafts. Never auto-send.
7. **Small daily effort.** Any new daily step must fit inside the 2-minute budget.
8. **Visible trust.** Sync status, import numbers and "verified" badges are shown, not hidden.
9. **Sensitive data is minimal.** Bank details live only in v3, encrypted (Part 10).
10. **Every lane ends with tests, a green build, and a short entry in the build record.** Use real fixtures where possible.
11. **Fewer features.** Quick order presets are hidden during the pilot. Do not add features not listed here.

---

# Part 3. Components

## C1. v3 core (existing, keep)
Parser (md, xlsx, CSV), Dexie/IndexedDB data layer, merge engine with locked fields, change log, Confirm screen, PO gate, PO and BOM PDFs, WhatsApp links, supplier directory with CSV import/export.

## C2. Sync and backup (new)
Automatic two-way copy between phone, laptop and a cloud store. Offline edits queue and sync later. Visible status. Automatic backup with a tested restore.

## C3. New v3 modules

| ID | Module | Purpose |
|---|---|---|
| M1 | Import scorecard | Trust pass tooling (Lane 1A) |
| M2 | Manual add-item | Add missing or late items (Lane 1B) |
| M3 | Stock record | Starting count, arrivals, predicted balance (Lane 3) |
| M4 | Key items + minimums | Warnings and doubtful flags (Lane 3) |
| M5 | Supplier verification | Verified flag, rating, encrypted bank details (Lane 4) |
| M6 | Payment voucher drafter | Pre-fill and per-field copy (Lane 4) |
| M7 | Ready tick + trip list + checklist PDF | Dispatch check and Monday.com checklist (Lane 5) |
| M8 | Daily facts export | Small summary for the bot and drafters (Lane 6) |

## C4. Daily check-in bot (new, outside v3)
A Telegram bot in a private chat with Naqib. Asks topic check-ins by buttons plus short text.

## C5. Report drafters (new, outside v3)
Fill the three daily formats and the weekly report from check-in answers and v3 facts, using an AI model. Drafts only.

## C6. Data exchange
See Decision D2. Default: v3 publishes a small **daily facts snapshot**, and the bot keeps its own check-in log.

---

# Part 4. Data additions

Plain names, not final field names. Agents map these onto the existing schema style.

| Table or field | Key fields | Notes |
|---|---|---|
| **BomItem** (extend) | `source` (import or manual), `reasonTag` (site, missing, correction), `addedAt`, `isManual` | `isManual` must protect items from "removed, pending" on re-import |
| **ImportRun** (new) | file type, project, line count, source line count, qty/unit/price mismatch list, pass or fail, timestamp | Feeds the trust scorecard |
| **StockItem** (new) | item key, location (rack or zone), starting count, current predicted balance, key item flag, minimum, workers-often-take flag, last verified at | One per tracked item |
| **StockMovement** (new) | item, type (arrival, usage, count adjustment), quantity, source, timestamp | Balance = starting count + movements |
| **OrderLine status** (extend or new) | ordered qty, received qty, ready flag, readyAt | Received supports partial deliveries |
| **Trip** (new) | date, lines included, delivered flag | Copied to Telegram |
| **Supplier** (extend) | verified flag, verifiedBy, verifiedAt, lead time, rating (good, ok, poor), payment terms (full payment, or deposit plus balance), encrypted bank details | Tags for "what they sell" already exist. Custom and subcontract suppliers use deposit plus balance. |
| **PaymentDraft** (new) | order or PO link, supplier, project name, order number(s), payment category (normal or urgent), payment type (full, deposit, balance), deposit paid and balance due, amount, remark, supplier document numbers (PO or quotation no., invoice or receipt no., document date), pay-before date, status | Never stores the attached invoice file. Bank details are read from the verified supplier record at copy time, not stored in the draft. |
| **Project** (extend) | active flag, ready-to-deliver date, production % (Naqib's estimate), order or job number(s) (confirmed 21 Sep) | Feeds the formats and the payment voucher |
| **SyncMeta** (new) | device id, last synced at, pending changes count | Drives the visible status |
| **CheckIn** (bot side) | topic, project or "shared", answers, timestamp | Lives with the bot (D2) |
| **Draft** (bot side) | type (production, delivery, daily, weekly), text, sources, created at | Reviewed by Naqib |

**Usage rule for stock (to confirm):** deduct bulk items when production starts, and staged items as production progresses.

---

# Part 5. Sync and backup design

## Requirements
- Automatic and always on. Works offline. One user, two devices.
- Visible **"synced" status** at all times.
- Automatic backup, with a **tested restore**.
- Conflicts are rare (one person), but the rule must be safe.

## Options

| Option | Fit | Trade-off |
|---|---|---|
| **A. Dexie Cloud** | Natural fit, since v3 already uses Dexie. Managed two-way sync, login and access control, no sync backend to build. | Vendor dependency. **Verify** current pricing, limits, data location, and how a server-side bot can read or write the data. |
| B. Firebase Firestore | Built-in offline mode | Needs a rewrite of the data layer. High risk for a trust-first project. |
| C. Supabase + custom sync | Full control | You would have to build and debug the sync yourself. Highest bug risk. |
| D. Manual file backup | Simple | Rejected as sync. Fine as an extra safety net. |

**Recommendation:** run a small proof (Lane 2 spike) on Option A with real data before committing.

## Conflict rule (proposed)
Latest edit wins, per field, with the timestamp shown in the change log. Deletions are soft (marked, not erased) so nothing vanishes silently.

## Must-pass sync tests
- Edit on phone offline, edit on laptop offline, reconnect both: no lost data, no duplicates.
- Clear browser data, then restore from the cloud: everything returns.
- Lose the device, then sign in on a new one: everything returns.
- Status shows "pending" while offline and "synced" after.
- Bank details stay encrypted in the cloud copy.

---

# Part 6. Daily check-in bot design

## Setup
- **Private chat between Naqib and the bot** (he starts it once). A bot cannot read Telegram "Saved Messages", so a private bot chat is the simplest route. **(verify)**
- **Not** added to the shared production and delivery group (probably not allowed, and the writing there is too varied to parse).
- Language: English for the bot's own prompts. Draft outputs **match each format as it is today** (Part 7).
- Hosting: needs a small always-available service or scheduled function (Decision D3).

## Schedule (max two pings a day, under 2 minutes total)

| Time | Topics |
|---|---|
| Lunchtime | Materials and stock: ran out of anything? new late or extra items? |
| End of day | Deliveries done and ready to deliver, delays or rework, RORO getting full, issues |
| Rotating (2-3 times a week) | Production progress %, site progress, client or supplier issues |
| Monday morning and Friday afternoon | Project list refresh: any new or finished projects? |
| Friday afternoon | Weekly draft ready |
| Skipped check-in | One gentle reminder later, no repeats |

## Answer style
Tap buttons plus an optional short text. Each event is tagged to a project (from a list typed once in Telegram) or **"shared."**

**Production %:** Naqib estimates it. The bot pre-fills yesterday's value per active project, and he adjusts by tap or by typing.

**RORO:** one tap "getting full?" leads to a reminder "call the vendor today (1-3 days' notice)."

## Ready-to-add questions
Naqib has extra questions to add later. The bot's topic list must be **data-driven** (a list the agent can edit) so adding a question needs no rebuild.

## Failure handling
If the bot service is down, Naqib's normal process continues. Missed check-ins are never back-filled with guesses.

---

# Part 7. Formats to data mapping

The three daily formats are fixed. The bot fills them from check-ins and v3 facts. Skeletons below use placeholders.

## 7.1 Production Activity

```
⚫️ PRODUCTION ACTIVITY
Date : [dd/m/yy]
__
PREPARING MATERIAL

1. [Project] - [%]
```
| Field | Source |
|---|---|
| Date | Today |
| Project list | Active projects from the bot's project list |
| % | Naqib's estimate (bot pre-fills last value) |

## 7.2 Delivery Activity

```
⚫️ DELIVERY ACTIVITY
Date : [dd/m/yy]
__
✅ DONE DELIVERY TODAY
__
⚠️ READY TO DELIVER / Date

1) [Project] - [dd/m]
```
| Field | Source |
|---|---|
| Done delivery today | Trips marked delivered today (v3 Trip), or the end-of-day check-in |
| Ready to deliver + date | Ready ticks (v3) plus a target date per project **(decision D5: who enters the date)** |

## 7.3 Daily Report

```
🔴 DAILY REPORT - NAQIB ([dd/m/yyyy])

Apa yang buat harini?
Weekly Meeting
Project briefing: -
Discussion: -
Deal Supplier: -
Production: -
Logistic: -
Lalamove: -
Item on site: -

Apa point saya dapat harini?

Apa halangan / isu harini?
```
| Field | Source |
|---|---|
| Weekly Meeting, briefing, discussion | Naqib's short text (meeting days only) |
| Deal Supplier | Orders placed today in v3 (supplier, item, project) |
| Production | Production check-in (checking items) |
| Logistic | Logistics check-in (managing items, inventory records, preparing material) |
| Lalamove | Trips booked today (v3) |
| Item on site | Site check-in and site-tagged manual items |
| Point learned | One optional line from Naqib |
| Obstacles or issues | Ran-out, delays, rework from check-ins. Default "Tiada" if none. |

Language: headings stay exactly as they are. Naqib's free text may mix Malay and English, and the drafter keeps his wording.

## 7.4 Weekly report
- **Fixed format** set by the boss or team. **Agents need a copy of the current weekly template (not yet shared into the architecture; decision D6).**
- Built mainly by compiling the week's daily reports (Monday to Friday). Saturday's half day is added **by hand.**
- Adds v3 facts: stock counts, late-request count (site-tagged items), orders.
- No photos. Placeholders like "[add ...]" where data is missing. Each statement shows its source.
- Draft ready **Friday afternoon.** Naqib always reviews and edits.

---

# Part 8. Build lanes (for Antigravity agents)

One lane per agent. Run **Lane Q (QA)** after every lane. Naqib approves each lane before the next starts.

## Order (hybrid, chosen by Naqib)
Lane 0, then **1A + 1B**, then **2**, then **3**. Lanes 4, 5, 6 are provisional (see D4).

## Lane 0. Verify (no code)
**Goal:** replace assumptions with facts.
- What exactly does the change log save per change (old value, new value, date, who or what)?
- Is v3 data browser-only today? What happens on clear-browser or device loss?
- Does v3 already show line count and totals after import?
- How does the merge engine treat an item that is not in the new import? (Confirms the `isManual` need.)
- List the files each lane will touch and any invariant at risk.
**Done when:** a one-page report Naqib can read.

## Lane 1A. Trust pass tooling (import scorecard)
- Compare imported data with the source: line count, quantity, unit, item name, price, total.
- Record each mismatch as: *file type, line, expected, shown.*
- Cover three file types: markdown BOM, xlsx BOM, supplier CSV (names and contacts, addresses, duplicates, tags).
- Show key numbers passively on screen. **No extra confirm step.**
- **Acceptance:** one clean real import per file type scores zero errors under the pass rule; deliberately broken fixtures fail loudly; import speed unchanged.

## Lane 1B. Manual add-item
- Phone-first, single screen. Must fill: name and spec, quantity and unit. One tap: reason tag. Automatic timestamp.
- Confirmed immediately. `isManual` protects it from "removed, pending" on re-import. Site-tagged items feed the late-request count.
- **Acceptance:** add on phone, re-import, item survives; change logged with reason and time; no duplicate pending entries.

## Lane 2. Sync and backup
0. **Compare options (no code, decided 21 Sep):** the agent compares Options A to C (and any better one) on offline behaviour, effort to add to v3, cost, data location, encryption support, how a server-side bot can read or write the data, and bug risk. Naqib picks.
1. **Spike:** prove sync with real data on both devices using the chosen option.
2. Integrate, add the visible status, and soft deletes.
3. Add automatic backup and a tested restore.
- **Acceptance:** every test in Part 5 passes. No regression in existing tests.

## Lane 3. Stock record (pilot)
- Starting count screen with location per item. Arrivals: tap "received" or type a partial quantity.
- Predicted balance using the usage rule. Key items with minimums and low-stock warnings (key items only).
- Doubtful flags: workers-often-take, below minimum, system-decided. Weekly quick check screen for doubtful items.
- Two-week accuracy log: predicted vs real.
- **Acceptance:** balance math is tested; partial deliveries work; the weekly check lists only doubtful items; works offline and syncs.

## Lane 4. Supplier records + payment voucher drafter
- Verified flag, rating, lead time, encrypted bank details (masked by default, reveal on tap).
- Extend CSV import with the new fields, **excluding bank details from any export.**
- Payment drafter pre-fills the Monday.com "Payment Voucher" fields mapped in Appendix A, with **one card per field and a large copy button.** Only verified suppliers pre-fill. Dates are shown for manual picking, not copied. The invoice upload stays manual. Amount supports full, deposit or balance.
- **Acceptance:** unverified suppliers cannot pre-fill; bank details never appear in PDFs, exports or logs; copied values match on-screen values.

## Lane 5. Ready tick, trip list, checklist PDF
- Ready tick per line. Trip list built from ticked lines, one-tap copy to Telegram.
- Checklist PDF: **to order, received, still missing.** No prices.
- **Acceptance:** "still missing" equals ordered minus received; PDF matches on-screen data.

## Lane 6. Bot and drafters
- Bot skeleton, data-driven topic list, schedule, project list, reminders.
- Daily drafts (Production, Delivery, Daily Report) and the weekly draft.
- Daily facts snapshot from v3 (M8).
- **Parallel start: approved (D4).** The minimal bot (Lane 6a) does not touch v3 and starts alongside the v3 lanes.

### Lane 6a. Minimal bot (daily report draft only)
- Private Telegram chat with the bot. Project list typed once, refreshed on Monday morning and Friday afternoon.
- **One end-of-day check-in** (buttons plus a short text) that fills the **Daily Report** format only: Weekly Meeting, Project briefing, Discussion, Deal Supplier, Production, Logistic, Lalamove, Item on site, point learned, obstacles (default "Tiada").
- With no v3 facts yet, Deal Supplier and Lalamove come from Naqib's answers.
- One gentle reminder if skipped. Topic list is data-driven so extra questions can be added without a rebuild.
- Draft is sent back to Naqib in the chat. He edits and posts it by hand. **Nothing auto-posts.**
- Production Activity and Delivery Activity drafts, rotating topics and the weekly draft come later.
- **Acceptance:** the draft matches the Daily Report format character for character; missing answers show placeholders, never guesses; the whole check-in takes under 2 minutes; no bank details anywhere; bot token stored outside the code.
- **Acceptance:** drafts match the three formats exactly; missing data shows placeholders, never guesses; nothing auto-posts; the weekly draft cites its sources.

## Lane Q. QA (after every lane)
Full test suite green, build green, real-fixture checks, regression on locked fields and PO gate, and a short build-record entry.

---

# Part 9. Testing and acceptance
- Real fixtures for every import type. Same-run md and xlsx pair for deep equality (existing pattern).
- Offline and two-device tests for sync.
- Encryption tests: bank details unreadable in the cloud copy and absent from every export and PDF.
- Draft tests: given fixed check-ins, the draft text matches the format character for character.
- Any flaky test is recorded, not ignored.

---

# Part 10. Security and privacy
- **Bank details:** encrypt before storing. Mask in the UI by default. Never in PDFs, CSV exports, logs, the bot, or AI prompts. **(verify)** how keys are held and how restore works with encryption.
- **Login:** protected sign-in for sync. Only Naqib has access.
- **AI drafting:** project and supplier names may reach an AI provider. Check the company's rules and the provider's data policy first (D8). Send only what a draft needs.
- **Telegram:** the bot token is a secret, stored outside the code.
- **Backups:** encrypted.

---

# Part 11. Decisions needed

| # | Decision | Recommended default |
|---|---|---|
| D1 | Sync technology | **Decided (21 Sep):** the agent compares options first (Lane 2, step 0), Naqib picks, then a spike follows. Dexie Cloud (Option A) stays the leading candidate. |
| D2 | How bot and v3 exchange data | Shared cloud store if Dexie Cloud allows server access, otherwise v3 publishes a one-way daily snapshot |
| D3 | Where the bot runs | A small managed scheduled service, the simplest option agents can support |
| D4 | Start the minimal bot in parallel with v3 lanes? | **Decided (21 Sep): yes.** Lane 6a starts in parallel. It saves time sooner and does not touch v3. |
| D5 | Who enters the "ready to deliver" date | Naqib, via a one-tap date on the project |
| D6 | Weekly report template | Share a copy (names hidden) so agents match it exactly |
| D7 | Monday.com Payment Voucher field list | **Done (21 Sep):** screenshots received and mapped in Appendix A |
| D8 | May project and supplier names go to an AI service? | **Decided (21 Sep): yes.** Bank details and anything a draft does not need still never go. Check the provider's data policy. |
| D9 | Stock usage rule | Confirm: bulk at production start, staged by progress |
| D10 | Pilot v1 confirmation and pilot project | Confirm after Lane 0 |

---

# Part 12. Open items and do-not-assume

**Open items**
- [ ] Lane 0 report (change log, browser-only storage, merge behaviour)
- [ ] Starter key items (about 10, with reason)
- [ ] Extra check-in questions
- [ ] Weekly report template
- [ ] Confirm how balance-due reminders should work per order, since terms vary
- [ ] Ask the Monday.com admin whether URL pre-fill can be enabled (plan-dependent)
- [ ] Rough baseline from the last project
- [ ] RORO meaning and swap dates

**Agents must not assume**
- That v3 data is already cloud-safe.
- That the bot can read the shared Telegram group.
- That Monday.com can be connected. It cannot. Updates stay manual.
- That anything may be auto-sent.
- That the weekly report is free-form. It is fixed.
- That "confirmed" means Pilot v1. It is not confirmed.

---

# Appendix A. Payment Voucher form map (from screenshots, 21 Sep)

The form has **14 fields: 13 required, 1 optional.** v3 holds the value for **12 of 14.** You type the quotation number and its date once in v3, and the invoice or receipt fields reuse them. The **file upload** and the optional **pay-before date** stay manual, and date pickers still need a manual pick.

| # | Form field | Required | Type and form rule | v3 source | Pre-fill |
|---|---|---|---|---|---|
| 1 | Payment category | Yes | Dropdown: Normal (2-3 working days) or Urgent (24 hours) | One-tap choice, suggested from the pay-before date | Suggest |
| 2 | Pay to | Yes | Text, bank account holder name, **all capitals** | Verified supplier record, auto-uppercase | Yes |
| 3 | Bank name | Yes | Text (form lists MAYBANK, CIMB, BIMB, RHB) | Verified supplier record | Yes |
| 4 | Account bank no. | Yes | Text, must be accurate | Verified supplier record (encrypted, copy only) | Yes |
| 5 | Amount (RM) | Yes | Number | Order total, or the deposit or balance portion | Yes |
| 6 | Payment details / remark | Yes | Long text: item, deposit or balance | Items summary plus payment type | Yes |
| 7 | Order number | Yes | Long text, e.g. 0005. Use "-" if not related. Several numbers: one per line. | The project's order or job number (confirmed), "-" if none | Yes |
| 8 | Project name | Yes | Long text, capitals in the example. "-" if not related. | Project name, uppercase | Yes |
| 9 | P.O / Quotation no. | Yes | Text, from supplier, third party or workers | Typed once in v3 from the supplier's quotation | Once |
| 10 | Invoice / receipt no. | Yes | Text | Reuses the quotation number when only a quotation exists (confirmed 21 Sep) | Yes |
| 11 | Date invoice / receipt | Yes | Date (dd/mm/yyyy). If none, use today. | Reuses the quotation date (confirmed 21 Sep), shown large for manual picking | Yes (pick by hand) |
| 12 | Attach invoice / receipt | Yes | File upload: invoice, receipt or screenshot as proof | Naqib uploads | Manual |
| 13 | Date pay before | No | Date, only if there is a deadline | From supplier terms or need-by date | Optional |
| 14 | Requester name | Yes | Text | Fixed: Naqib | Yes |

## What this means for the design

- **Confirmed (21 Sep): Naqib files the request after the supplier's quotation.** What goes in the invoice or receipt fields at that point is still to confirm. v3 cannot invent these, so they are typed or attached each time.
- **Bank details are three separate fields** typed every time today. Pre-filling them from a verified supplier record is the biggest saving and the biggest safety gain.
- **Payment type depends on the item.** Ready items (hardware, electrical, gypsum, paint) are paid in full. Custom items and subcontract work (for example PVC with cutting services, sub-paint) are paid as deposit then balance. v3 suggests the payment type from the supplier's payment terms and tracks the balance due, so a delivery is not held because the balance was forgotten. **Deposit percentage and balance due date both vary (confirmed 21 Sep):** store an optional default deposit % per supplier, editable per order, and a per-order "balance due" date or note that triggers a reminder.
- **Dates are not reliably pasteable** into date pickers. Show them large and pick by hand.
- **Phone use means many app switches.** One card per field with a big copy button. Laptop side by side is faster.
- **Estimated effort:** from 3-5 minutes to roughly 1.5-2.5 minutes per request. This is a guess to be measured in real use.
- **URL pre-fill:** Monday.com now offers URL-parameter pre-fill, but only on Pro and Enterprise plans, and the form owner must switch it on per question. Ask the admin. **Never put bank details in a URL** (browser history and logs). Use copy buttons for bank fields even if URL pre-fill is enabled for the rest.

---

# Part 13. Starter prompts for agents

## Guardrail prompt (paste at the start of every lane)
> You are working on Logistics Helper v3. Read `SYSTEM_SPEC.md` and `Architecture_v1_Logistics_Helper_v3_Extension.md` first. Work on **one lane only**. Do not modify `mergeEngine.js`, `poGate.js`, `supplierLinking.js` or `poDocument.js` unless the lane says so. Add features, never rewrite. Never delete data silently. Never include bank details in exports, PDFs, logs or prompts. Never auto-send messages. If any fact is marked (verify), verify it and report before building. End with passing tests, a green build, and a short entry in the build record.

## Lane 0 prompt
> Do not write or change any code. Inspect v3 and answer: (1) What exactly is saved in the change log per change? (2) Is data stored only in the browser? What happens if the browser data is cleared? (3) Does v3 show line count and total after an import? (4) How does the merge engine treat items missing from a new import? (5) For each lane in Part 8, list the files it will touch and any invariant at risk. Reply as a one-page report in plain language.

---

## Lane 2, step 0 prompt (no code)
> Do not write or change any code. Compare sync options for v3 (Dexie Cloud, Firebase Firestore, Supabase with custom sync, and any better option you find). Use these criteria: works offline, effort to add to v3, cost for one user on two devices, where data is stored, support for encrypting bank details, how a server-side Telegram bot could read or write the data, and bug risk. Check current pricing and limits from official sources. Recommend one option in plain language and say what could go wrong.

## Lane 6a prompt (minimal bot)
> Build only Lane 6a from Part 8: a private Telegram bot that runs one end-of-day check-in and drafts the Daily Report in the exact format in Part 7.3. Buttons plus short text, English prompts, Malay headings unchanged. Topic list must be data-driven. Project list typed once and refreshed Monday morning and Friday afternoon. One reminder if skipped. Never auto-post, never guess missing answers, never handle bank details. Store the bot token outside the code. Before coding, state which hosting option you propose (D3) and why, and wait for approval. End with tests and a short build-record entry.

---

# Glossary
- **Lane:** one focused job for one agent.
- **Local-first:** the app works on the device first, and the cloud is a copy.
- **Sync:** keeping phone and laptop identical.
- **Spike:** a small proof to test an idea before committing.
- **Soft delete:** mark as deleted instead of erasing.
- **Gate:** a check that blocks the next step until something is true.
- **Snapshot:** a small summary of today's facts sent out of v3.
