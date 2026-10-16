# Handoff: Agent 5 — Slice 5 (weekly compile — Groq + .docx port)

**Status: DONE + live proof 2026-09-30 (real Groq call, real .docx).**

## What I built
- `bot/report/utils.py` — ported from Teleport: `BM_DAYS`, `BM_MONTHS`,
  `week_of_month`, `report_week_label`, `last_n_working_days`.
- `bot/report/compiler.py` — ported near-verbatim: identical `SYSTEM_PROMPT` +
  `_build_user_prompt` (6 BM sections → 7-key JSON contract), `REQUIRED_KEYS`,
  code-fence strip, key validation, JSON-mode-with-fallback LLM call. Only change:
  `HARIAN_PROJECT = "Harian"` inlined (no SQLite module).
- `bot/report/formatter.py` — ported near-verbatim: same `.docx` layout (title,
  Nama/Jawatan table, 6 numbered headings, activity table with Waktu Balik blank).
  `OUTPUT_DIR` now `dailybot/data/reports/`, `HARIAN_PROJECT` inlined.
- `bot/weekly.py` — the ONE non-verbatim piece: adapter that reads `daily/*.json`
  and reshapes into `{date_iso: [{project, activity_type, detail}]}`. Each answered
  chunk topic → one row (title via topics.json, project="Harian"); Delivery
  Activity `doneToday` → "Hantar ke Site" rows. Drops no-signal answers ("", "-",
  "Tiada", "x"). Orchestrates `compile_report` → `build_docx`.
- `bot/config.py` — LLM config (Groq preset `openai/gpt-oss-120b`, `llm_api_key()`
  lazy resolver, `MIN_DAYS_FOR_REPORT`); `load_dotenv()` runs at import.
- `bot/main.py` — `/weekly` command registered (typing action → compile → send `.docx`).
- `requirements.txt` — added `openai`, `python-docx`, `python-dotenv`.

## How I proved it (live Groq + .docx, no Telegram)
- 6 working days (24–30 Sep 2026, Sunday 27 excluded) of fake Slice-3/4 daily JSON.
- Adapter produced 6 days-with-data.
- `compile_report` → Groq returned **7/7 keys, all non-empty**.
- `build_docx` → real `.docx`; re-opened and verified: all 6 numbered headings
  (RINGKASAN/ISU/CADANGAN/PENCAPAIAN/REFLEKSI/LAPORAN AKTIVITI) + 7 content labels +
  activity table (1 header + 6 day rows).

## Deliberately not touched / open for the next agent
1. `.docx` filename collision: `Laporan_{date_range}.docx` overwrites on same-week
   re-runs — harmless, flagged.
2. `readyToDeliver` (Delivery Activity) is NOT yet rendered into the report — only
   `doneToday` is. Decide the mapping before Slice 6.
3. Item Progress (`items/*.json`) is NOT in the weekly report — the compiler's input
   is `daily/*.json` only (per Architecture §7). Confirm whether completion-%/item
   status should surface in the report.
4. `/weekly` has no `< MIN_DAYS_FOR_REPORT` confirmation gate yet (Teleport had one);
   `MIN_DAYS_FOR_REPORT=3` is carried in config but unused so far.
5. `data/reports/*.docx` (gitignored) contains a real proof artifact left on disk.