# Work Map & System Plan (v2, Draft)

**Owner:** Naqib
**Date:** 21 Sep 2026
**Phase:** 1 of 4, Deep Brainstorming (Brainstorming -> Architecture -> Building -> Coding)
**Status:** Interview largely complete. Nothing is confirmed for building yet. No architecture or code until Naqib explicitly confirms.
**Replaces:** `Work_Map_and_Pilot_v1.md`

> Privacy: this file contains no bank details, supplier accounts, client names or passwords. Keep it that way.

---

## 1. Goal

Map everyday work, then sort each task into one of four buckets:

| Bucket | Meaning |
|---|---|
| **Eliminate** | Stop doing it |
| **Systemise** | Make it follow one repeatable rule |
| **Optimise** | Do it faster or cheaper |
| **Automate** | Let a tool or agent do it |

---

## 2. The big picture

One chain runs the week: **Supplier -> Production -> Logistics -> Site.** Naqib sits in the middle, and production waits on him for materials, paint, supplier items, drawings and decisions.

**Time ranking (most to least):** 1) Materials, stock and ordering, 2) Production follow-up and checks, 3) Logistics and delivery, 4) Updates, meetings and reports.

| Item | Answer |
|---|---|
| Projects running at once | 4-7 |
| Item types handled | 150-500 |
| Suppliers dealt with regularly | 20-50 |
| Orders placed per day | 9-15 |
| Orders needing a payment request | Almost all |
| Payment request effort | 3-5 minutes each (up to roughly 27-75 min a day, an upper estimate) |
| Deliveries per week | 8-15 |
| Late or extra items per project | 4-10 (answer "option 2", assumed) |
| "Item not enough on site" | Almost every project |
| Production follow-up | Under 1 hour a day |
| Reports and updates | 3-5 hours a week |
| RORO points managed | 1-2 |

**Gaps spotted in the weekly report (7-12 Sep):** no paint stock record, no organised RORO schedule, progress updates only when asked, no quantity check before Lalamove leaves.

---

## 3. Work map by area

### 3.1 Materials loop (biggest drain)

| Step | Today | Pain |
|---|---|---|
| 1. Trigger | Client order confirmed | None |
| 2. Build the list | Mixed sources: AI export, typed, Excel from accounts | Late items nobody mentioned; client and design changes; edits overwrite the original |
| 3. Check stock | Walk the store, ask workers, check notes | Stock not tracked; kept in several spots in the workshop |
| 4. Order suppliers | WhatsApp (mostly) and phone, several suppliers per item | Retyping; comparing replies by scrolling chats or a sheet |
| 5. Payment request | Monday.com request per order; account team approves and pays | Wait time is out of his hands; many suppliers need payment first |
| 6. Track arrival | Memory, notes, chats, Monday.com, own system, colleagues | Five or six places |
| 7. Site asks for extras | WhatsApp group, private chat, Telegram, or found out late | Loops back to step 2; no record of who asked when |

**Trouble materials:** electrical and wiring, hardware and small items.

### 3.2 Production follow-up
- Stages (draft): cutting -> painting -> wrapping -> Electrical Box -> final check -> delivery.
- Sources: workers on WhatsApp, supervisor, floor walk, Monday.com, Telegram photo updates (**most trusted**).
- Production waits on Naqib for: materials or paint, supplier items, drawings or spec clarification, site or client decisions.
- Delay causes: rework, missing materials, unclear instructions, workers or machine time.
- Painting redo causes: surface prep or technique, colour mismatch or wrong paint code, client changing colour or spec.

### 3.3 Quality checks
- At three points: before wrapping, before Lalamove leaves, on site after arrival.
- Checked against the drawing, the order or delivery list, and a checklist.
- Results recorded in Telegram photos and WhatsApp (not searchable or countable).

### 3.4 Logistics
- Lalamove booked by Naqib or a colleague or the account team. Packing is ad hoc (combine when convenient, whatever is ready, or by urgency).
- Deliveries recorded in Telegram.
- Costly leaks: booking before an item is ready, driver delays or wrong location, tolls, late RORO swaps.
- **Only "ready" matters** before booking (not "paid"). Naqib confirms readiness himself.

### 3.5 RORO
- Assumed to be bins or containers (**to verify**). Managed on site and in-house, 1-2 points.
- Naqib calls the vendor. Swaps happen every two weeks, when full, or vary by site. Vendor needs 1-3 days' notice.
- Wants: a reminder before a swap is due, a vendor contact list, a simple schedule view.

### 3.6 Reports and updates
- Weekly report: typed from memory, compiled from daily notes, and AI-assisted. **Format is fixed by his boss or team. The whole team reads it.**
- Audiences (9): boss, team group, account team, site team, client groups, Monday.com, installers, suppliers, drivers. Same status retyped for each.
- Daily notes live in WhatsApp to self, Telegram and his head.
- Naqib works a half day on Saturdays.

### 3.7 Monday.com
- Used for payment requests, project task tracking and material lists.
- **Required by boss or account team:** material lists and payment requests only. **Task status is not required.**
- Connecting his own tools is **not allowed**. Whether a board can be exported to Excel is unknown.

---

## 4. Constraints and facts to design around

- Site and installers **will not change habits**, use every channel, and have no fixed site lead per project.
- Site **did accept** a one-time list review at project start.
- Logging effort: **under 2 minutes a day.** No chat exports. No pasting every message.
- Shared Telegram group (one for everything, varied writing style): a bot is **probably not allowed**. A bot in his **personal Telegram notes** is fine.
- Naqib is the only user, on **phone and laptop**, and often works **offline**. Online storage is acceptable.
- Every project is different, so whole-project templates won't work.
- Workers take items informally and some goods go straight to site, so stock will drift.
- Past shortages were **never recorded**, so there is no history to learn from.
- Approval and payment timing is controlled by the account team.

---

## 5. Core insights

1. **Shortage blame comes from a process gap, not a personal gap.** Lists are overwritten, late requests arrive incomplete through many channels, and there was no record of shortages.
2. **The boss judges by complaints and recollection,** not by drawing or quotation. Naqib's stated goal: **fewer complaints from site.**
3. **Two levers:** prevent (one-time site review, stock record, better list) and prove (dated change log).
4. **Trust in v3 is the blocker, not missing features.** Past import bugs and wrong numbers hurt confidence.
5. **Big time sinks that repeat:** payment requests, supplier WhatsApp orders, status updates to nine audiences.

---

## 6. The system as three parts (plus non-tool fixes)

| Part | Role |
|---|---|
| **A. v3 (order desk)** | Import lists, manual add-item, stock record, supplier records, payment request drafting, checklist PDF, ready tick and trip list |
| **B. Daily check-in bot** | Telegram personal notes; captures late items, ran-out moments, deliveries, delays, RORO, rotating topics |
| **C. Weekly report drafter** | Reads check-ins plus a small v3 summary, fills the fixed format, leaves honest placeholders |

**Non-tool fixes:**
- One-time list review with the site contact at project start (electrical and hardware first).
- Stop or cut Monday.com task-status updates (**eliminate candidate**).
- RORO: repeating calendar reminders plus vendor contact saved in phone. Calendar reminders can be set later (dates not yet given).

---

## 7. v3 improvement backlog

**Existing v3 (from build notes):** parser (md, xlsx, CSV), local data (IndexedDB), merge engine with locked fields, change log (agent vs supervisor), Confirm screen, PO gate, PO and BOM PDFs, WhatsApp order links, supplier directory with CSV import and export, quick order presets. Currently **"just testing"**. It has no site intake, stock record, arrival or payment tracking, logistics, reporting, or Monday.com link.

### 7.1 Build order (hybrid, chosen by Naqib)
1. **Trust pass + manual add-item**
2. **Sync and backup**
3. **Stock record**

Provisional (not decided): payment request drafting saves the most time and could move earlier, but it needs verified supplier records first. Decide in the architecture phase.

### 7.2 Trust pass
**Two comparisons:** (a) v3 vs the source file tests v3. (b) Source file vs reality tests the upstream source. The trust pass judges only (a). Upstream errors (outdated prices, AI misreads) are a separate problem.

**Pass rule (agreed):**
- Quantities and units: zero errors on every line.
- Item names: minor spelling differences are fine if spec, unit and quantity are right.
- Prices and totals: must match the source file exactly. Old source prices are flagged as upstream, not a v3 failure.

**Scorecard (agreed: one clean import per file type):**

| Import | Checks | Pass |
|---|---|---|
| Markdown BOM (AI agent) | Units, item names, quantities, prices, totals | Zero errors |
| Excel (xlsx) BOM | Same | Zero errors |
| Supplier CSV | Names and contacts, addresses, no duplicates, tags (what they sell) | Zero errors |

- **First check:** compare quotation line count vs imported line count (coverage). Naqib is unsure how much the quotation covers.
- **On failure:** send the agent a mismatch list. Suggested shape: *file type, line, expected, shown.*
- **No import summary step** (Naqib wants imports fast). Idea to test: show key numbers on screen passively after import, with no extra tap.
- **Today's test (21 Sep):** full workflow, on **phone only**, quotation partly available.
  - Use one device for the whole test.
  - Treat v3 output as a draft. Keep the normal process as the source of truth for real orders.
  - Read every generated PO and WhatsApp message before sending.
  - Mark lines the quotation doesn't cover as "unverified."
  - Don't clear browser data. Export the BOM PDF at day end as a safety copy.
  - Stop and note it if anything loses data or shows a wrong number.
  - Tally late items on paper for a baseline.

### 7.3 Manual add-item (draft spec)
- **Phone-first**, one screen.
- **Use cases:** missing item, late or extra item from site, correction of an imported item (correction already exists by tapping quantity or price; the new part is adding).
- **Must fill:** item name and spec, quantity and unit.
- **One tap:** reason tag (site, missing, correction). **Automatic:** date and time stamp.
- **Not included for now:** who asked, needed-by date.
- **Status:** confirmed immediately. Marked "manual" so re-import does not flag it as removed (from build notes, missing items become "removed, pending").
- **Ordering:** Naqib messages the supplier himself.
- **Items tagged "site" feed the weekly late-request count automatically.**

### 7.4 Sync and backup (requirements)
- **Automatic and always on** (manual sync rejected). **Automatic backup matters.**
- **Visible "synced" status, always shown.**
- Must work **offline**, then sync when back online. Single user, two devices.
- Suggested conflict rule: latest edit wins (to confirm in architecture).
- Unverified: whether v3 data is currently browser-only and could be wiped by clearing the browser or losing the device.
- Naqib wants "no problems or bugs later." Realistic goal: reduce risk with tests, a simple conflict rule and visible status. Zero bugs can't be promised.
- This is the **largest change** in the backlog and cuts against "fewer features."

### 7.5 Stock record (pilot, draft, not confirmed)
- **Scope (my recommendation, not confirmed):** one project's BOM lines (about 50), all four categories, starting with a project about to order.
- **Start:** one-time count of the pilot items, setting each item's **rack or zone** in the same pass.
- **Arrivals:** tap "received" on the order line, or type a partial quantity.
- **Usage:** deducted when production starts and as it progresses (interpretation of "1 and 3"; **confirm**).
- **Stock shown as a predicted balance;** Naqib confirms only doubtful items. His acceptance: "maybe, depends on accuracy."
- **Doubtful items:** items workers often take unrecorded, predicted stock below minimum, or system-decided.
- **Low-stock warnings for key items only,** each with a minimum.
- **Weekly quick check** of doubtful items (aim 1-2 minutes). Who could delegate the count: undecided.
- **Accuracy test:** two weeks of prediction vs real counts.
- **Success measures (all four):** fewer "ran out" moments, minutes per stock check, prediction accuracy, fewer "not enough" complaints. Baseline from last project still to be noted.
- Pilot starts **after the foundation is solid** (imports match reality, sync loses no data, backup and restore tested).
- **Known risk:** drift when workers take extras, waste, or goods go straight to site.

### 7.6 Key items list
- **Key = production stops if missing, or always needed at site.** About 20-30 items.
- No shortage history exists, so Naqib will supply a **starter list of about 10** (with reason: production stops, or needed at site). The daily "ran out?" question then teaches the system.

### 7.7 Payment request drafting (draft)
- v3 pre-fills **supplier, project code, items and total.** Quotation or invoice is attached by hand.
- Monday.com's form has **separate fields,** so per-field copy buttons are recommended (Naqib was unsure).
- **Only verified suppliers pre-fill.** Verification by the account team and Naqib. **Who and when: not decided.**
- Still to see: a screenshot of the payment request form (private details hidden).

### 7.8 Supplier records
- 20-50 suppliers. Each record holds: contact or WhatsApp number, what they sell, **verified** bank details, lead time and reliability.
- Reliability = a simple rating Naqib sets (good, ok, poor). Automatic reliability later, if arrival dates exist.
- Fill by: CSV import, typing key suppliers, and building gradually as he orders. Verify **all at once** (big one-time job for the account team).
- **Bank details stored fully in v3.** Requirements for architecture: protected login, encrypted storage, never in exports, PDFs, chats or md files.

### 7.9 Delivery readiness and trip list
- A **"ready" tick per line** before booking Lalamove (only ready matters). This doubles as the missing quantity check before dispatch.
- The ticked lines form a **trip list,** copied to Telegram (where delivery records already live).

### 7.10 Monday.com link
- No automatic connection. v3 produces a **checklist PDF: items to order, items received, items still missing** (no prices). Naqib updates Monday.com by hand.
- **Timing:** payment requests per order, everything else as a daily batch.
- Two copies of the material list will exist, so the checklist must be fast and accurate to copy.
- If Monday.com allows Excel export, a later import into v3 is possible (unknown).

### 7.11 Hidden or parked
- **Hidden during the pilot:** quick order presets.
- **Parked:** price update on supplier quote, full capture of every site request, chat export, "installed vs list" in the weekly checkpoint, boss view beyond the weekly report.

---

## 8. Daily check-in bot (draft)

- **Where:** Naqib's personal Telegram notes. Nobody else sees it.
- **Pings:** at most **two a day.** Lunchtime (materials, stock) and end of day (deliveries, late items, ran out, delays, RORO "getting full?"). Each topic gets its own short check-in, like this interview.
- **Rotating topics** (a few times a week): production progress, site progress, client or supplier issues.
- **Answers:** buttons plus a short text. **English.**
- **Budget:** under 2 minutes a day, achieved by rotation.
- **Projects:** a list typed once in Telegram, refreshed by prompts on **Monday morning and Friday afternoon** and any time a project starts or ends. Each event is tagged to a project or "shared" (unsure whether events usually belong to one project).
- **Skipped check-in:** one gentle reminder later.
- **Output** follows his **daily report format and general update format** (to be shown).
- Naqib has **extra questions** to add (to be shown).
- **Not included:** meeting notes sent to the bot (he said no).

---

## 9. Weekly report drafter (draft)

- **Fixed format** from his boss or team. **Draft ready Friday afternoon.** Saturday's half day is added **by hand.**
- **Sources:** daily check-ins plus a small weekly summary from v3 (stock counts, late-request count, orders). v3 alone fills **under a quarter** of the report.
- Site progress, client or supplier issues and production progress come from the rotating check-ins. **Meeting outcomes stay as placeholders,** filled by hand. **Photos skipped.**
- Shows **where each statement came from** so he can verify. He **always reviews and edits** before sending.
- The report is also the **visibility channel to the boss and team,** since the app itself is personal.
- Wording of late-request counts needs care, since the whole team reads it.

**Weekly checkpoint:** quick stock count (doubtful items), late-request count, draft report.

---

## 10. Early sort (hypotheses, not decisions)

| Candidate | Bucket |
|---|---|
| Monday.com task-status updates | **Eliminate** (not required) |
| Payment request drafting | **Automate** (pre-fill, copy) |
| Supplier order WhatsApp retyping and reply comparison | Systemise, then automate |
| Stock check before ordering | Systemise (needs a record first) |
| Late-request handling | Systemise |
| Booking before ready | Systemise ("ready" tick) |
| Status updates to nine audiences | Automate (write once, publish many) |
| Weekly report | Automate (by-product of check-ins) |
| RORO swaps | Systemise (calendar plus check-in question) |
| Production follow-up | Leave alone for now |
| Quality checks | Keep the checks, improve the record |

---

## 11. Risks and honest caveats

- Sync plus offline on two devices is complex. Test heavily.
- Bank details in cloud storage are a security decision.
- Two copies of material lists (v3 and Monday.com) can drift.
- 9-15 payment requests a day is heavy manual work even with pre-fill.
- Check-in fatigue. Rotation and a cap of two pings help.
- Predicted stock drifts. Spot checks stay necessary.
- Scope creep versus "fewer features."
- **Unverified assumptions:** RORO meaning; change log contents; "option 2" read as 4-10 late items; usage rule interpretation; whether v3 can show import numbers passively; whether v3 data is browser-only.

---

## 12. Open items

- [ ] Show extra check-in questions and the daily and general update formats
- [ ] Type the starter list of about 10 key items (with reason)
- [ ] Ask the agent what the change log saves (old value, new value, date, who or what)
- [ ] Note a rough baseline from the last project (ran-out count, minutes per stock check, complaint count)
- [ ] Pick the pilot project
- [ ] Confirm Pilot v1 (not yet confirmed)
- [ ] Decide who verifies suppliers, and when
- [ ] Payment request form screenshot; check if Monday.com exports to Excel
- [ ] Confirm the usage rule (when stock is deducted)
- [ ] Decide who could do the weekly count
- [ ] Verify what RORO means; give swap dates for calendar reminders
- [ ] Record today's test results (mismatches, bugs, confusing steps)

---

## 13. Next steps

Stay in **Phase 1** until Naqib explicitly confirms the requirements. Then:
- **Phase 2, System Architecture:** how the three parts fit in an agent-based setup, sync design, security, build order.
- **Phase 3, System Building.**
- **Phase 4, Coding.**

## 14. Glossary

- **BOM:** the list of materials a project needs.
- **PO:** purchase order sent to a supplier.
- **Gate:** a check that blocks the next step until something is true.
- **Sync:** keeping phone and laptop copies identical.
- **RORO:** assumed to be bins or containers (to verify).
