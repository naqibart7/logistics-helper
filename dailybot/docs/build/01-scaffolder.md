# Handoff: Agent 1 — Scaffolder (Slice 0)

## What I built
- `dailybot/` root: `.gitignore`, `README.md`
- `data/topics.json` — copied **verbatim** from `lh_bot_6a/data/topics.json` (SHA-256 identical: `40C6D7E6…BD6F0`)
- `data/projects.json` — empty seed `{"projects": []}`
- `data/items/`, `data/daily/`, `data/reports/` — runtime dirs, `.gitkeep`'d, **gitignored** (Naqib's personal answers never enter git; they live on the Oracle VM)
- `docs/build/` — handoff home (this file is the first)
- `bot/` — placeholder `.gitkeep` only; no bot code (per Slice 0 rules)

## How I proved it works
- `Get-ChildItem dailybot -Recurse` →

```
.gitignore
bot\.gitkeep
data\daily\.gitkeep
data\items\.gitkeep
data\projects.json
data\reports\.gitkeep
data\topics.json
README.md
```
Matches Architecture Section 6 exactly (topics + projects at `data/` root; items/daily/reports as per-concern subdirs).
- `Get-FileHash` source vs copy → identical SHA-256 (carried over as-is, as required).

## What I deliberately didn't touch
- No Python code, no logic, no Telegram anything.
- `lh_bot_6a` and `teleport` repos untouched (read-only reference).
- No `requirements.txt` yet — Slice 1 installs only what Slice 1 needs.
- v3 web app: zero changes.

## Open questions for the next agent
1. **Chunk weekdays:** the architecture gives times, not days. Default taken: **Mon–Sat** for all four daily touchpoints (Teleport precedent: Mon–Sat crons; Naqib's Mon–Sat work week; Sunday = rest). Flag to Naqib if wrong.
2. **`~16:50` catch-up:** pinned to exactly **16:50**. `~10:00` / `~15:00` refreshes pinned to **10:00** / **15:00** (topics.json `hourBefore: 10` / `hourAfter: 15` supports these).
3. **`projects.json` shape:** seeded as `{"projects": []}` — Slice 3/4 agents must read+append via this key (data-first; change it now if a different shape is wanted, not later).
