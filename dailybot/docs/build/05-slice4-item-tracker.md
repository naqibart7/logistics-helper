# Handoff: Agent 4 — Slice 4 step 1 (Item Tracker + Delivery Activity)

**Status: DONE + two-day state-machine proof 2026-09-29.**

## What I built
- `bot/items.py` (new): per-project item repo — `load_items`, `save_items`,
  `format_item_list`, `apply_item_changes`, `icon_for`. Schema matches
  Architecture §6.1 (`project`, `completionPct`, `items[{name,status}]`).
- `bot/main.py`: 5pm `item_progress` handler wired live. Multi-step flow per
  active project:
  1. Show current items (`format_item_list`).
  2. Accept changes: `PVC -> done_payment`, `add H. Steel in_progress`,
     `remove PVC`, `no change`/`-`/`tiada`.
  3. Ask overall completion %; save with `save_items`.
  4. Loop to next project; when done, start Delivery Activity.
- Delivery Activity: two questions (any deliveries done today? anything ready
  to deliver with target date?), saved into `daily/{date}.json`
  `deliveryActivity.doneToday` + `readyToDeliver`.
- `load_active_projects()` in `main.py` reads `projects.json`; falls back to
  one hardcoded project (`pj-rufaidah`) per the architecture's "start with
  ONE hardcoded project" instruction for Slice 4.

## How I proved it (two fake days, no Telegram)
- Day 1: empty project → add PVC + H. Steel `in_progress` → completion 50%.
- Delivery Activity saved: `doneToday: ['Surau | PVC | 20']`,
  `readyToDeliver: [{project:'Surau', item:'H. Steel', targetDate:'12/10'}]`.
- Day 2: load from disk (status and completion carried over) → move PVC to
  `done_payment`, H. Steel to `ready_on_site` → completion 75%.
- Final persistent state verified: `PVC 💰`, `H. Steel ✅`, 75%.
- State machine transitions: `🔁 → 💰` and `🔁 → ✅` proven.

## Deliberately not touched
- Project refresh logic (Mon/Fri updates to `projects.json`) — Slice 4 proper
  or Slice 6.
- Multi-project ordering/generalization beyond the hardcoded fallback.
- Groq/docx weekly compile (Slice 5), full integration suite (Slice 6),
  Oracle VM deploy (Slice 7).
- `lh_bot_6a`, `teleport`, v3 web app.

## Open questions for the next agent
1. Should `projects.json` be seeded with real active projects now, or stay
   hardcoded through Slice 6?
2. Delivery Activity entries are free-text strings for now — Slice 6 may want
   to parse `projek | item | kuantiti/tarikh` into structured objects.
3. Item Progress currently allows any status string; Slice 6 may add validation
   against the four allowed states (`in_progress`, `done_payment`,
   `ready_on_site`, `delivered`).
