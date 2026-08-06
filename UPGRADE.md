# UPGRADE.md — Site Logistics Helper v2

Product: **Artseven Special Force Logistic**
Generated: 2026-08-04

This document summarises what was implemented in the "Unlimited-OCR + highest-ROI
improvements" upgrade, how to run the OCR backend, the env vars required, and
the known limitations.

---

## 1. What was implemented

### 1.1 Unlimited-OCR backend (`server/`)
- Express + multer + cors + dotenv OCR service.
- `POST /ocr` accepts a multipart PDF **or** an array of page images.
- If `UNLIMITED_OCR_URL` is set it proxies the upload to the GPU endpoint
  (vLLM / transformers) and returns `method: "unlimited-ocr"`.
- Otherwise it falls back to server-side pdfjs text extraction and returns
  `method: "fallback"`, so the frontend never breaks.
- `GET /health` reports which method is active.
- Fixed a Node/pdfjs bug: pdfjs rejects `Buffer`, we now pass `Uint8Array.from(...)`.
- `server/.env.example` documents the required env vars.
- `server/schema.sql` contains the full Supabase table DDL.

### 1.2 Frontend OCR path
- `src/utils/ocrClient.js` → `extractTextSmart(file, { onStatus })`:
  1. runs fast pdfjs layout extraction,
  2. measures text density; if it looks like a real text PDF returns `pdfjs`,
  3. otherwise posts the file to `/api/ocr` (proxied to the backend) using
     `VITE_OCR_API_URL` or the Vite proxy path `/api/ocr`.
- `App.jsx` `handleFileUpload` now uses `extractTextSmart`, shows the progress
  states **"Detecting PDF type…" → "Running Unlimited-OCR (this may take 10-40s)…"
  → "Parsing structure…"**, keeps the tabular path for text PDFs and routes
  scanned PDFs through `smartParse`.

### 1.3 Parser hardening (OCR noise)
- `src/utils/advancedParser.js` gains an OCR pre-clean step (`preCleanText`):
  collapse multiple spaces / blank runs, fix common OCR confusions (RM spacing,
  `0→O`, `1→l`, stray bullets) and re-join lines OCR split mid-item.
- The Job Cost section detector is now tolerant (`softHas`) to extra whitespace
  and missing exact keywords (dropping separators + common char confusions).
- Every material line now carries a `confidence` (0–1).
- **Confidence filter (strict import):** rows scoring `< 0.6` are no longer
  imported into the BOM. `smartParse` and `smartParseTabular` partition candidates
  via `splitByConfidence()`; the confident rows go to `materials` and the rest are
  returned separately as `lowConfidence` (count exposed as `metadata.lowConfidence`).
  This enforces the original "strict" rules (item must carry qty + price/amount,
  no summary/junk lines) so OCR noise no longer pollutes the project.
- Materials vs **SUPPORTING MATERIAL** separation is preserved (category is kept
  per extracted group and used to group the Import Preview tables).

### 1.4 Supabase
- New hooks in `src/hooks/useSupabaseTable.js`:
  - `useSupabaseProjects()`, `useSupabaseSuppliers()`, `useSupabaseSession()`.
- Identical API to the old hooks, so `App.jsx` changed minimally.
- They sync to Supabase when signed in + online, always mirror to localStorage,
  and gracefully fall back when offline / unauthenticated / tables missing.
- No breaking change to the paste-text → parse → save → WhatsApp flow.

### 1.5 Product improvements
- **Catalog integration:** new `CatalogPicker` modal ("Add from Catalog") with a
  searchable grid, friendly category filters (Electrical / Hardware / Paint /
  Lighting / Wood), and ± quantity steppers that inject items into the project BOM.
- **WhatsApp deep-link:** the `wa.me` link in Suggested Suppliers now mirrors the
  edited message text.
- **Quotes tracker:** new `QuotesTracker` section inside the project detail modal,
  storing `{ supplierId, status, price, notes, requestedAt }` with a
  Requested → Received → Accepted/Rejected pipeline.
- **Purchase Order PDF:** `exportPOToPDF(project, supplier, materials)` in
  `pdfExport.js` + a "Generate PO" button in the project modal (uses the accepted
  quote's supplier, else the first supplier).
- **Excluded low-confidence review list** in `ImportPreview`: discarded rows show
  in a collapsible "N low-confidence line(s) excluded" panel with name, qty × price,
  confidence % and an **Add** button to manually re-include a specific line.

### 1.7 Data recovery & sync status
- **JSON backup Export/Import** (Projects tab): downloads `{ projects, suppliers,
  itemCatalog }` to `logistics-backup-YYYY-MM-DD.json`; import supports Merge or
  Replace. Needed because browser `localStorage` is per-origin, so the deployed
  `https://logistics-helper.vercel.app` cannot see data saved on `localhost`.
- **Cloud pull now merges** instead of replacing: rows in the Supabase table are
  merged with local rows by `id` (local-only rows are kept and pushed up), so no
  data is ever silently dropped on restore.
- **Sync indicator + manual Restore**: when signed in, the Projects tab shows
  "Cloud sync active · Last synced HH:MM" (or "Offline — showing local data only")
  and a **Restore** button that re-pulls from the cloud and merges.

### 1.8 Example hosted OCR endpoint (`ocr-server/`)
- `ocr-server/main.py` is a FastAPI reference implementing the exact
  `UNLIMITED_OCR_URL` contract: `POST /v1/ocr`, multipart `file` field →
  `{ text, pages }`. The model call is stubbed (`extract_text_with_your_model`)
  with vLLM OpenAI-compatible examples in comments. Run with uvicorn on the GPU box.

### 1.9 Click-first hierarchical catalog picker
- **Hierarchy (`src/data/catalogHierarchy.js`):** the exact 13 main categories
  with all sub-categories (`CATEGORY_TREE`). `buildCatalogHierarchy()` derives the
  3-level tree **from the existing flat catalog**, so every item + price is
  preserved and user-added items still appear. Matching is keyword-first (sub-name)
  then legacy `category`; unmapped items fall back so nothing is lost (verified
  213/213 items mapped). `QUICK_KITS` define reusable kits resolved against the
  live catalog; `flattenHierarchy()` keeps a flat list for autocomplete/search.
- **`CatalogPicker` rewritten** to a tap-only flow: main category cards with icons
  → sub-category chips → dense item cards. Item cards show unit price, a
  `− [qty] +` stepper, and quantity presets (5/10/20/50). Selections accumulate in
  a cart with a live running total (item count + est. cost) in a sticky bottom bar,
  committed with one "Add N items" tap. Quick Kits appear above the browser and
  add multiple items in one tap. Search (instant) groups results by main category,
  and empty sub-categories offer a lightweight custom-item quick-add so there are
  no dead ends.
- Material rows added still carry the standard shape (`category`, `item`,
  `quantity`, `unit`, `pricePerUnit`, `price`) so the PDF/Excel import and
  EditableBOMTable flows are unchanged. Catalog modal widened to `max-w-5xl`.

### 1.6 Vercel deployment (serverless)
- `vercel.json` deploys the Vite app (framework `vite`, build `npm run build`,
  output `dist`) to Vercel.
- `api/ocr.js` is a serverless OCR fallback that mirrors the Express pdfjs path
  (busboy multipart parsing + pdfjs text extraction), so the frontend OCR path
  (`/api/ocr`) works in production without a running GPU server. When the Vercel
  env var `UNLIMITED_OCR_URL` is set, the function forwards the PDF to that GPU
  endpoint and returns its text (`method: "unlimited-ocr"`); otherwise it falls
  back to pdfjs extraction (`method: "fallback"`).
- Deployed from the `logistics-v2` branch with `vercel --prod --name logistics-helper`.
  Production alias: `https://logistics-helper.vercel.app`.
- Deployment protection (Vercel Authentication) must be disabled in the dashboard
  (project **Settings → Security → Deployment Protection**, and/or the team-level
  **Authenticated Deployments** toggle) before the site is publicly reachable.

---

## 2. How to run

### Frontend
```bash
npm install
npm run build      # production build
npm run dev        # dev server on http://localhost:5173
```
The Vite dev server proxies `/api/*` to the OCR backend on `:3001`
(see `vite.config.js`).

### OCR backend
```bash
cd server
npm install
cp .env.example .env   # then set UNLIMITED_OCR_URL
npm run dev            # node index.js on http://localhost:3001
```
Test after boot:
```bash
curl http://localhost:3001/health
# {"ok":true,"method":"fallback"}            (when no GPU endpoint)
# {"ok":true,"method":"unlimited-ocr"}       (when UNLIMITED_OCR_URL is set)
```

### Supabase
1. Run `server/schema.sql` in the Supabase SQL editor.
2. Set your URL + anon key in `src/utils/supabase.js` (already populated).
3. RLS policies are included for signed-in users; anonymous users just use
   localStorage until they sign in.

---

## 3. Environment variables

| Var | Where | Purpose |
|-----|-------|---------|
| `UNLIMITED_OCR_URL` | `server/.env` **or** Vercel project env var | GPU OCR proxy URL (e.g. `http://localhost:8000/v1/ocr`). Set on Vercel to make `/api/ocr` use Unlimited-OCR. If unset → pdfjs fallback. |
| `PORT` | `server/.env` | Backend port (default `3001`). |
| `VITE_OCR_API_URL` | root `.env.local` | Optional; overrides the OCR endpoint. Defaults to the Vite proxy `/api/ocr`. |

---

## 4. Known limitations

- **Unlimited-OCR requires a GPU server.** This repo only ships the *client + proxy*.
  Without `UNLIMITED_OCR_URL`, scanned PDFs fall back to pdfjs text extraction,
  which returns little or no text for image-only scans — so scanned jobs may
  produce no materials and show the "no items found" state (a clear, safe fallback,
  not a crash).
- **Supabase tables must exist.** Until `server/schema.sql` is run, cloud sync is a
  no-op and the app silently uses localStorage (by design).
- **Parser confidence is heuristic.** `confidence` is derived from how much of a
  line (item + qty + unit price + total) was recovered plus a fuzzy catalog match.
  It does not measure model-level OCR certainty. Rows below the import threshold are
  excluded and surfaced for manual review rather than silently imported.
- **Catalog categories** are bucketed into a friendly subset (Electrical / Hardware
  / Paint / Lighting / Wood / Other); fine-grained source categories still show the
  original value in the raw catalog (Items tab).
- **Real-time Supabase subscriptions** are stubbed (see the note at the bottom of
  `useSupabaseTable.js`) — polling/push is done on change instead of live mirrors.
- The existing paste-text → parse → save → WhatsApp flow is unchanged and verified;
  a fresh checklist PDF/layout sample was used to confirm fallback OCR + parse.