# Logistics Helper v3 — Open Items (Revised)
**Date:** 21 September 2026
**Owner:** Naqib
**Status:** Draft — not locked
**Sources:** `SYSTEM_SPEC.md`, `BUILD_PROGRESS.md`, `Work_Map_and_System_Plan_v2.md`, Weekly Report files, Architecture v1

> This version corrects over-statements in the first draft. Only verified facts are treated as resolved. Everything else stays explicitly draft or needs your decision.

---

## 1. Starter Key-Items List — DRAFT (needs your real data)

**Verdict accepted:** The previous list was generic. Minimums and locations were invented. Paint stock and electrical-box parts were missing even though you are already building a paint inventory.

### Rule for key items
Key = production stops if missing, **or** always needed at site.

### What you must do
1. Mark each of the 12 items below as **Keep / Drop / Change**.
2. Add any real items that actually run out (especially paint SKUs and electrical-box parts).
3. During the first real stock count, replace every minimum with the actual number you decide is safe.
4. Locations stay blank until the count.

| # | Proposed item | Your decision (Keep / Drop / Change) | Real minimum (fill later) | Location (fill later) | Reason (production stops / site always needs) |
|---|---------------|--------------------------------------|---------------------------|-----------------------|-----------------------------------------------|
| 1 | Gypsum board 12 mm | | | | |
| 2 | Cement board 9–12 mm | | | | |
| 3 | Painter's / masking tape | | | | |
| 4 | Drywall / partition screws | | | | |
| 5 | Wall plugs (common sizes) | | | | |
| 6 | Joint compound + joint tape | | | | |
| 7 | Contact / PU adhesive | | | | |
| 8 | PVC conduit 20 mm & 25 mm | | | | |
| 9 | 1.5 mm cable (R/B/G or sets) | | | | |
| 10 | Sandpaper (grit sequence) | | | | |
| 11 | Drop sheets / plastic | | | | |
| 12 | Scaffolding frames + braces | | | | |
| 13 | **(add your real paint stock items here)** | | | | |
| 14 | **(add electrical-box parts if critical)** | | | | |

### Stock design clarification (open)
The earlier note said "stock must stay independent of project lists."
Predicted balance and "need minus have" only work if key items can be linked to project demand.
**Clear rule still needed from you:**
- Option A: Key items are pure workshop stock; project BOMs stay separate.
- Option B: Key items can be linked to project demand for "need minus have" calculations.

---

## 2. Weekly Report Template — RESOLVED (from your real files)

Exact structure taken from `Weekly Report.md` and the PDF. The bot must match this character-for-character.

```text
LAPORAN KERJA MINGGUAN (INDIVIDU)

NAMA: MUHAMMAD NAQIB IKHWAN
MINGGU / BULAN: MINGGU X - BULAN [MONTH]
TARIKH LAPORAN: DD - DD MONTH YYYY

RINGKASAN KERJA MINGGU INI
• …

ISU / MASALAH YANG DIHADAPI
• …   (or "Tiada isu besar atau halangan kritikal dilaporkan sepanjang minggu."
       ONLY if no issue was logged that week)

CADANGAN / KEPERLUAN SOKONGAN
• …

PENCAPAIAN
Pencapaian dalam kerja:
• …
Pencapaian Peribadi:
• …   ← bot leaves blank; you fill

REFLEKSI
Apa yang saya belajar / sedar minggu ini?
• …   ← bot leaves blank; you fill
Apa saya nak perbaiki minggu depan?
• …   ← bot leaves blank; you fill

LAPORAN AKTIVITI
| HARI / TARIKH | AKTIVITI / TUGASAN | WAKTU BALIK |
|---------------|--------------------|-------------|
| ISNIN …       | • …                | X.XX ptg    |
```

### Bot design notes (must implement)
- **Waktu balik** per day: one tap in the end-of-day check-in.
- Weekly reflection + personal achievements: always left blank for you. Bot never invents them.
- "Tiada isu besar…" line: only written if no issue was logged that week.
- Delivery format: Markdown table will not render cleanly on WhatsApp. Bot should also offer a plain-text version (or a simple numbered list) that pastes cleanly.

No extra check-in questions supplied yet → topic list stays limited to the architecture defaults.

---

## 3. Lane 0 — Partial answers only (spec vs code gap)

### 3.1 Change log contents (verified from SYSTEM_SPEC only)
```js
ChangeLogEntry {
  actor: "agent" | "supervisor",
  field,
  oldValue,
  newValue
}
```
**Critical gaps still open (must re-check against live code):**
- No timestamp is listed in the schema.
- No item id / project id is listed.
- Attempted changes to locked fields are **not** written to the log; they only appear in the runtime `MergeResult`. Conflict evidence therefore disappears after the import finishes.

**Action required:** Re-run Lane 0 against the actual code (`src/data/changeLogRepo.js` + schema) and answer:
1. Does every entry have a timestamp?
2. Does it store item id and project id?
3. Are blocked attempts on locked fields recorded anywhere permanent?

Until those answers exist, the "prove it" story is incomplete.

### 3.2 Storage
Confirmed: Dexie / IndexedDB only. Clearing browser data loses everything. Sync + backup (Lane 2) is the only recovery path.

### 3.3 Tables that exist today (from BUILD_PROGRESS)
Beyond the original schema the code now also has:
- `presets` table (ItemSupplierPreset)
- `BomItem.displayOrder`
- `BomItem.assignedSupplierId`
- `Project.client`

Any Lane 0 report must list these.

### 3.4 Merge engine treatment of missing items — RESOLVED
Missing items become `removed_item_pending`. They block PO until Approve or Dismiss. They are not auto-deleted.

### 3.5 isManual / Lane 1B conflict
Lane 1B needs manual items protected from "removed, pending".
Architecture says `mergeEngine.js` stays read-only unless Lane 0 explicitly allows a change.

**Decision still needed:**
- Either the orchestrator (`reimportProject.js` or a thin wrapper) handles the protection,
- or Lane 1B is given explicit permission for one small, tested change to the merge path.

---

## 4. Baseline — CORRECTED

Previous draft wrongly said "none exists because v3 has not gone live."

**Correct understanding:**
The baseline is your **current manual process** (the "before").

Start a paper tally **now**:
- Ran-out moments per week
- Minutes spent on stock checks
- Minutes spent writing daily + weekly reports
- Number of payment requests
- Site complaints about "not enough"

After the first live v3 week we compare against this paper tally. Waiting until after v3 starts measures the wrong thing.

---

## 5. Balance Reminder Style — REVISED

| Option | Recommendation |
|--------|----------------|
| **B. In-app badge** | **Start here.** Always visible, no dependency on bot or sync. |
| **A. Telegram ping** | Later. Needs the bot to see v3 due dates → requires sync + daily facts snapshot. |
| **C. Monday.com task** | **Drop.** You already decided task-status updates are not required. Adds chore. |

**Additional design note:**
Some balances are due "on completion" with no fixed date. Reminders must also be able to trigger on events (delivery ready, production complete), not only calendar dates.

---

## 6. What is actually resolved vs still open

| Item | Status |
|------|--------|
| Weekly report template structure | **Resolved** (from your real files) |
| Merge engine treatment of missing items | **Resolved** |
| Change log exact fields + timestamp | **Open** — re-check code |
| Starter key-items list | **Draft** — needs your real items & decisions |
| Baseline numbers | **Open** — start paper tally now |
| Balance reminder preference | **Revised recommendation** (start with B) |
| isManual protection mechanism | **Open** — decision needed |
| Stock vs project-list linking rule | **Open** |

---

## Next actions for you

1. Fill the key-items decision table (Keep / Drop / Change + real items).
2. Start the paper baseline tally this week.
3. Decide: in-app badge only for now, or badge + later Telegram.
4. Confirm how isManual protection should be implemented (orchestrator vs small merge change).
5. When convenient, allow a code-level Lane 0 pass so the change-log timestamp / item-id questions can be closed.

---

**End of revised document**
Generated 21 September 2026 — v2
