# Site Materials Readiness System

**Goal:** Guarantee the right materials are physically on site before the installer needs them.

This is a complete rebuild of the construction logistics helper, focused on the one outcome that matters: materials readiness. Not a nicer UI for the old app—a fundamentally different system where everything serves the goal of getting materials to the right place on time.

## Principles

1. **One database is the source of truth** — Supabase Postgres from day one. Local storage exists only as an offline cache.
2. **Every material line has a date and lead time** — `need_by_date` and `lead_time_days` are required. No optional fields.
3. **Suggestions from real history** — Co-occurrence counting over past projects, not hand-authored rules.
4. **Catalog-backed item entry** — Autocomplete against canonical catalog with explicit "create new" path.
5. **Offline-first checklist** — Works with zero signal. Writes locally, syncs when online.
6. **Ship in order** — Each phase is a working slice. Don't build Phase 5 before Phase 3 works.
7. **Delete, don't accumulate** — No dead code, no unused features.

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite |
| Styling | Tailwind CSS v4 |
| State | TanStack Query (React Query) |
| Database | Supabase (PostgreSQL) |
| Offline | Vite PWA + Dexie.js (IndexedDB) |
| OCR/Parsing | pdfjs + single Vercel serverless function |
| Hosting | Vercel |
| Fuzzy Matching | fuse.js |

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to SQL Editor and run the entire contents of `supabase-schema.sql`
3. Copy your project URL and anon key

### 3. Configure environment

Create a `.env` file (or copy `.env.example`):

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run development server

```bash
npm run dev
```

### 5. Build for production

```bash
npm run build
```

The build includes PWA assets automatically.

## Build Phases

**Phase 0** ✅ — Clean slate, schema, base scaffolding

**Phase 1** 🚧 — Projects & Suppliers CRUD with catalog-backed autocomplete

**Phase 2** — Quote parsing → BOM (pdfjs extraction, single OCR path)

**Phase 3** — Materials Readiness Engine (need-by dates, lead times, readiness dashboard)

**Phase 4** — Historical data migration (fuzzy dedup, catalog cleanup)

**Phase 5** — Suggestion Engine (co-occurrence, confidence display, feedback)

**Phase 6** — Offline Checklist rebuild (IndexedDB queue, background sync, DO photos)

**Phase 7** — Quotes Tracker + PO PDF export

## Out of Scope (Explicitly Not Building)

- Monday.com integration/sync
- Catalog Picker / Quick Kits (replaced by suggestion engine)
- Multi-user roles/permissions
- DO invoice OCR/auto-matching (photo attachment only)
- Hand-authored "kit" or "bundle" rules

## Project Structure

```
src/
├── lib/           # Core utilities (Supabase client, IndexedDB, query client)
├── components/    # Reusable UI components
├── pages/         # Route-level components
├── App.jsx        # Main app with routing
└── main.jsx       # Entry point

public/            # Static assets (PWA icons)
supabase-schema.sql  # Database schema (run in Supabase SQL Editor)
```

## License

Private — single user system
