# Artseven BOM Multi-Agent System v3.2 Ultimate: The Antigravity Pipeline

## The Philosophy

LLMs are terrible at doing six things at once. They are great at doing one thing.  
In v2, we asked a single agent to read, normalize, calculate, reconcile, search, and format. It worked, but it was fragile. When it broke, you couldn't tell if the math was wrong, the normalization failed, or the logic drifted.

In v3, we treat the LLM as a CPU core in a pipeline. We break the job into discrete agents. Each agent gets a clean state, does one job, and passes a structured payload to the next.

**The Golden Rule of this Pipeline:**  
> An agent only sees the context it needs to do its specific job. We protect the context window. We enforce strict interfaces. We make it debuggable.

**Hard-won accuracy principles (apply to every project):**  
- **Every material is a granular, discrete, orderable line.** No rolled-up “lots”, no “1 set consumables”, no “assorted hardware”. If a purchaser cannot issue a PO line for it with a clear qty, unit, and pack size, it is not finished.  
- Product lines and colour/SKU codes are different materials until proven identical.  
- **Paint with multiple colour codes must be separated into distinct line items** (one line per colour/SKU). Never aggregate different colours into a single quantity.  
- A supplier price list is a pricing/spec cross-check, **not** a site inventory.  
- Custom / CNC / fabricated pieces and the raw sheets they are cut from are always two separate lines.  
- Site photos, amendments, and verified measurements override drawing assumptions when they conflict.  
- Final purchase quantities must be expressed in the packs the supplier actually sells (1 L / 5 L / 18 L / 20 L, standard sheets, 10 m rolls, 2440 mm lengths, whole boxes).  
- Running out of material mid-job costs more than a modest over-order. Prefer the higher *reasonable* quantity.  
- The output must be complete enough that a purchasing coordinator can place the order and the site never needs a re-order for missing consumables, tape, brushes, plugs, conduit, or access equipment.  
- **Painter’s / masking tape must always be quantified whenever any painting is in scope** (including specific named finishes such as Canvas Blue White or any other colour/SKU). Never omit tape.  
- **Supplier data is never generated from memory.** Phone numbers, addresses, and business names must come from live tool results. A NULL contact is infinitely better than a hallucinated one.

---

## State Schemas (Strict Interfaces)

Every agent reads and writes only these fields. Inventing or dropping fields is a failure.

### `raw_extracted_state.json`
```json
{
  "project_meta": {
    "name": "",
    "location": "",              // e.g. "Kelana Jaya, Selangor" or "Betong, Sarawak"
    "drawing_refs": [],
    "revision_dates": [],
    "geometry_source_of_truth": ""
  },
  "items": [{
    "id": "",
    "source_file": "", "page_or_sheet": "", "revision_date": "",
    "raw_text": "", "qty": null, "unit": "", "notes": "",
    "flags": []                  // REVISION_CONFLICT | NOT_SPECIFIED | SITE_OBSERVATION
  }],
  "site_observations": [],
  "colour_codes_found": [],
  "identifiers_found": []        // K-codes, LED A/B, etc.
}
```

### `normalized_state.json`
```json
{
  "colour_code_registry": [{
    "colour_code": "",           // exact code / name as found (e.g. "Canvas Blue White", "Jotun 1234")
    "material_family": "",       // Paint, Coating, etc.
    "source_refs": [],           // which raw items / pages mentioned it
    "status": "",                // ACTIVE | NOT_REQUIRED | TBC
    "linked_item_ids": []        // IDs of normalized items that use this colour
  }],
  "items": [{
    "id": "",
    "canonical_name": "",
    "original_names": [],
    "material_family": "",
    "thickness_or_size": "",
    "product_line": "",
    "colour_code": "",
    "base_unit": "",
    "pack_size": null,
    "pack_unit": "",
    "is_custom_fab": false,
    "is_orderable_line": true,   // must be true before leaving Agent 2
    "flags": []                  // SPEC_MISMATCH | POSSIBLE_MATCH | CUSTOM_FAB
  }]
}
```

### `calculated_quantities.json`
```json
{
  "items": [{
    "id": "",
    "canonical_name": "",
    "net_qty": 0,
    "wastage_geometry": 0,
    "wastage_pct": 0,
    "wastage_applied": 0,
    "purchase_qty": 0,
    "purchase_pack": "",
    "method": "",                // area | nesting | ratio | run_length | count
    "calc_notes": "",
    "assumption_text": null,
    "confidence_hint": ""
  }]
}
```

### `reconciled_state.json`
```json
{
  "items": [{
    "id": "",
    "canonical_name": "",
    "sources_compared": [],
    "chosen_qty": 0,
    "purchase_pack": "",
    "reason": "",
    "confidence": "",
    "price_list_status": "",
    "list_ref": "",
    "unit_price": null,
    "availability": null,
    "long_lead": false,
    "tbc_confirmation": null,
    "supplier_category": ""      // Paint & Coatings | Boards & Timber | Electrical & Lighting | etc.
  }],
  "human_checkpoint_required": false
}
```

### `verified_state.json`
Same structure as reconciled, with TBC items resolved or left with explicit `tbc_confirmation`.

### `sourced_suppliers.json` (Agent 7)
```json
{
  "project_location": "",
  "search_radius_logic": "",
  "categories": [{
    "category": "",              // Paint & Coatings | Boards & Timber | Electrical & Lighting | Hardware & Fasteners | Flooring & Finishes | Scaffolding & Access | Custom / CNC | Other
    "local_available": true,
    "flag": null,                // null | REGIONAL_SOURCING_REQUIRED
    "suppliers": [{
      "business_name": "",
      "whatsapp_or_mobile": null, // MUST be explicitly found or NULL
      "address": "",
      "specialty": "",
      "logistics_note": "",      // "Local - Self-collect" | "Regional - Requires transport from <hub>"
      "source_url": "",          // exact URL for audit
      "is_local": true
    }]
  }]
}
```

---

## The Pipeline Architecture

### Agent 1: Intake (The Reader)

**Why it exists:** LLMs hallucinate when they try to read and calculate at the same time. This agent only extracts.

- **Input:** Drawings (+ amendments), existing BOM, Cost/Price Sheet, Site photos/notes, Material Summary, Scope of Works.
- **Output:** `raw_extracted_state.json`
- **Rules:**
  1. Read *everything*. Do not skip a file because it looks redundant.
  2. Latest dated drawing is geometry source of truth.
  3. Older revision with larger quantity → flag `REVISION_CONFLICT`. Do not average.
  4. Extract colour codes, product ranges, and identifiers *verbatim*.
  5. Capture site-vs-drawing notes as separate facts — do not resolve them.
  6. Extract and record **project location** (town, district, state) from any available source. This anchors Agent 7.
  7. **No math. No normalization. No guessing.** Missing data stays `NOT_SPECIFIED`.
- **Tools:** File reading only.

---

### Agent 2: Normalization (The Translator)

**Why it exists:** You cannot reconcile what you cannot name. Vague groups cannot be ordered.

- **Input:** `raw_extracted_state.json`
- **Output:** `normalized_state.json`
- **Rules:**
  1. Canonical name: `[Material Type] + [Thickness/Size] + [Grade/Spec] + [Finish/Colour Code]`.
  2. Type, thickness, grade, *or product line* differ → different materials → `SPEC_MISMATCH`.
  3. **Build the Colour-Code Registry first.**  
     - Take every entry from `colour_codes_found` (and any additional codes discovered in item text).  
     - Create one registry record per unique colour code / named finish (e.g. “Canvas Blue White”).  
     - Status defaults to `ACTIVE`. Mark `NOT_REQUIRED` only if the source explicitly says the colour is not used. Mark `TBC` if the code is incomplete or ambiguous.  
     - Every registry entry that is `ACTIVE` **must** produce at least one corresponding item line. No silent drops.
  4. **Paint / coatings with multiple colour codes or SKUs must be split into separate items** (one canonical item per colour code). Never keep multi-colour paint as a single aggregated line. Link each item to its registry entry via `linked_item_ids`.
  5. Convert to natural base units (sheets, m², m, L, pcs, kg).
  6. Map to real supplier pack sizes early. Record both net and purchase-pack quantities.
  7. Stock sheets and custom-fabricated finished pieces stay separate lines until a fabricator quote exists.
  8. Uncertain matches → `POSSIBLE_MATCH`, keep both. Never guess silently.
  9. Preserve original colour codes and identifiers as metadata; the registry is the single source of truth for which colours exist.
  10. **Granular orderable line rule:** Every item must be a discrete, purchasable line. Reject or split any entry that is a vague aggregate (“consumables lot”, “assorted screws”, “1 set tools”). Expand aggregates into individual orderable items with clear qty and pack size. Set `is_orderable_line = true` only when a purchaser can issue a PO line for it.
- **Tools:** File reading. Web search only for standard conversion factors or official pack sizes.

---

### Agent 3: Calculation (The Engineer)

**Why it exists:** All numeric work is done in code and shown. No mental math.

- **Input:** `normalized_state.json` + geometry (and any site-verified dimensions).
- **Output:** `calculated_quantities.json`
- **Rules:**
  1. Use the code interpreter for every calculation.
  2. Wastage — compute geometry-based and fixed % (default 10–15 %, higher for irregular/CNC); take the **higher**.
  3. Sheets — compute Area Method *and* Nesting Method; prefer nesting when dimensions allow.
  4. Keep finished-component qty and raw-sheet qty as separate variables.
  5. **Paint: Calculate each colour/SKU independently using the Colour-Code Registry.**  
     - For every `ACTIVE` registry entry, ensure a calculated quantity exists.  
     - area × coats ÷ coverage (m²/L) → litres → nearest practical pack (1 L / 5 L / 18 L / 20 L).  
     - Never sum different colour codes into one quantity.  
     - Explicitly process named finishes such as “Canvas Blue White” (and every other colour) as their own lines.
  6. Cable / conduit: geometry runs + 10–15 % contingency → whole rolls / lengths.
  7. Supporting materials quantified from ratios or counts — **never “1 lot”**. Each becomes its own orderable line:
     - Screws / fasteners (by length and type)
     - Joint tape, compound, adhesive, sealant (by pack)
     - Wall plugs (by size)
     - Sandpaper (by grit)
     - **Masking / painter’s tape (by width)** — mandatory if any ACTIVE paint colour exists in the registry
     - Paint tools (rollers, brushes, trays, poles — each discrete)
  8. **Painter’s / masking tape is mandatory whenever any painting is in scope** (including Canvas Blue White or any other colour present in the registry). Quantify from protection perimeter or standard ratio; never leave as zero or “1 lot”.
  9. Scaffolding / access: derive from working height and bay configuration; list discrete components (each frame, brace, catwalk, pin is its own line or clear countable set).
  10. `NOT_SPECIFIED` dimensions → provisional qty + explicit `assumption_text` + confirmation required. Never invent a dimension.
  11. **Granular orderable line rule:** Output of this agent must consist only of lines a purchaser can order. If a calculation produces an aggregate, split it before writing the state.

#### Calculation Templates
```text
# Sheet nesting
purchase_sheets = ceil( (net_area * (1 + max(geometry_waste, 0.10–0.15))) / sheet_area )

# Paint pack selection (ONE COLOUR / SKU AT A TIME — driven by Colour-Code Registry)
# Never aggregate different colour codes.
# Loop over every ACTIVE entry in colour_code_registry
litres_with_waste = (area_m2_for_this_colour * coats / coverage_m2_per_L) * (1 + wastage_pct)
→ choose smallest combination of 1L / 5L / 18L / 20L that covers it
# Repeat independently for every colour code (e.g. Canvas Blue White, other top coats, undercoats)

# Linear run
purchase = ceil(total_m * 1.10–1.15 / pack_length) * pack_length

# Ratio consumables (each becomes its own line)
screws_1_5in_boxes = ceil(board_area_m2 * screws_per_m2 / pcs_per_box)
masking_2in_rolls  = ceil(protection_perimeter_m / tape_roll_m)   # MANDATORY if any ACTIVE paint colour exists

# Scaffolding
bays = ceil(wall_length / bay_width)
→ separate lines: main_frames, ladder_frames, braces, catwalks, pins
```

- **Tools:** Code interpreter / Calculator — mandatory.

---

### Agent 4: Reconciliation (The Judge)

**Why it exists:** Independent calculations are compared under asymmetric risk logic.

- **Input:** `calculated_quantities.json` + `normalized_state.json` + original BOM / Cost Sheet / Site data.
- **Output:** `reconciled_state.json`
- **Rules:**
  1. When sources disagree, take the highest *reasonable* quantity.
  2. **3× Error Test:** If one source is >3× the next-highest defensible source → `POSSIBLE_ERROR_VERIFY` and use the next-highest.
  3. Confidence: High (2+ sources within ~10 % or site-verified) | Medium (1 source + geometry) | Low (estimate only).
  4. Never reduce a higher reasonable quantity without a written, checkable reason.
  5. Cross-check every buyable item against the supplier price list; record status, list_ref, unit_price.
  6. Assign each item a `supplier_category` (Paint & Coatings, Boards & Timber, Electrical & Lighting, Hardware & Fasteners, Flooring & Finishes, Scaffolding & Access, Custom / CNC, Other).
  7. Site-vs-drawing conflicts produce explicit BOM impact lines.
  8. Custom / CNC / non-stock → `long_lead = true`.
  9. Any remaining Low-confidence or TBC → `human_checkpoint_required = true`.
  10. **Granular orderable line rule:** Reject any remaining aggregate lines. Every row in the reconciled state must be independently orderable.
- **Tools:** None. Pure reasoning.

---

### Human Checkpoint (Gate)

After Agent 4 (and after Agent 5 if searches ran):

1. Surface every Low-confidence and TBC item in a one-page summary.
2. Human may accept, override quantity, or supply the missing dimension / SKU decision.
3. Only after this gate do Agents 6 and 7 run (or Agent 6 runs with TBC lines still visible if no human is available).

---

### Agent 5: Verification (The Detective)

**Why it exists:** Only Low-confidence and unresolved items are searched. Rate-limited.

- **Input:** `reconciled_state.json` filtered to Low-confidence / unresolved.
- **Output:** `verified_state.json`
- **Rules:**
  1. Max **2** search attempts per item.
  2. Stop at the first manufacturer datasheet, official colour card, or supplier catalogue page that resolves the issue.
  3. If 2 searches fail → keep estimate, flag `TBC`, write exact human confirmation needed.
  4. Never invent a dimension. Labelled assumptions only.
  5. Prefer primary sources.
- **Tools:** Web search only, strictly rate-limited.

---

### Agent 7: Sourcing (The Scout)

**Why it exists:** LLMs do not have real-time, hyper-local business data in their weights. Asking an LLM to list hardware stores in a specific town will produce hallucinated phone numbers with high confidence. This agent treats the LLM purely as a reasoning engine to parse search results, while relying entirely on the Web Search tool to find real businesses, verify their existence, and extract contact details. It turns a material list into an actionable, localized procurement network.

- **Input:** `verified_state.json` + `project_location` (from Agent 1).
- **Output:** `sourced_suppliers.json`
- **Rules:**
  1. **Location Anchor:** Extract the exact project location. Define search radius: prioritize the local town first. If a category cannot be fulfilled locally, expand to the nearest major commercial hub, then the next hub if needed.
  2. **Category Mapping:** Group materials from `verified_state.json` into logical supplier categories:
     - Paint & Coatings
     - Boards & Timber
     - Electrical & Lighting
     - Hardware & Fasteners
     - Flooring & Finishes
     - Scaffolding & Access
     - Custom / CNC
     - Other
  3. **Tool-Use Mandate:** You **must** use the Web Search tool for every supplier. Do not rely on pre-trained weights for business names, addresses, or phone numbers.
  4. **Search Strategy:** Construct precise local queries.  
     Examples: `"hardware store Betong Sarawak"`, `"Jotun paint dealer Sri Aman"`, `"electrical supplier Kuching"`, `"scaffolding rental Selangor"`.  
     Prefer Facebook business pages, local directories, official dealer locators, and Google Business results.
  5. **Data Extraction:** For each verified supplier extract:
     - Business Name
     - WhatsApp / Mobile Number (**Must be explicitly found in the search results. If not found, output `NULL`**)
     - Physical Address
     - Specialty / Category (what they actually sell)
     - Logistics Note (`"Local – Self-collect"` or `"Regional – Requires transport from <hub>"`)
     - Source URL (exact link where the data was found, for auditability)
  6. **The “No-Hallucination” Rule:** If a WhatsApp or phone number is not explicitly visible in the search results, output `NULL`. Do not invent a number. Do not use a generic placeholder such as “Call store for info”.
  7. **Fallback Logic:** If a material category has zero local suppliers within the primary radius, flag `REGIONAL_SOURCING_REQUIRED` and list 2–3 verified suppliers from the nearest major hub.
  8. Rate limit: max **3 searches per supplier category** to prevent context drift.
- **Tools:** Web search only (strictly rate-limited).

---

### Agent 6: Export (The Publisher)

**Why it exists:** Output must be immediately usable by a purchasing coordinator who will place the order and never need a re-order.

- **Input:** `verified_state.json` + `sourced_suppliers.json` (post human checkpoint if used).
- **Output:** Excel Workbook + supporting tables.
- **Rules:**
  1. Pass the full QA & Completeness Checklist. Refuse to publish if Completeness score < 100 %.
  2. Generate at minimum:
     - **A. Master / Reconciliation BOM** — System, Item, Spec, Unit, Net Qty, Wastage, Purchase Qty, Basis, Confidence, Notes. Colour-code Confidence. Highlight TBC. Every row is a granular, discrete, orderable line.
     - **B. Supplier Purchasing List** — grouped by category, Order Qty, Unit Price, Est. Total, List Ref, **Suggested Supplier** (mapped from Sheet F), Action. Subtotal priced items. Separate TBA / external / custom-fab.
     - **C. Shortage & Confirmation List** — Severity, what fails on site, exact confirmation that closes it.
     - **D. Calc Detail / Basis** — every non-trivial derivation.
     - **E. Drawing-vs-Site & Assumptions tables** when present.
     - **F. Local Supplier Directory** — grouped by Category. Columns: Category | Business Name | WhatsApp / Contact | Address | Specialty | Logistics Note | Source URL. Highlight local suppliers green, regional suppliers yellow.
     - **G. BOM Change Log** — date, agent, what changed, why.
     - **H. Order-Ready Dashboard** (first sheet the coordinator sees).
  3. Every paint qty → concrete packs. Every linear → standard lengths. Every cable/LED → whole rolls. Every fastener → boxes or clear piece counts.
  4. Labour / transport / pure site-services appear only as notes or separate labour lines.
  5. Outstanding pre-PO actions listed in one place (max 5–7 bullets on the dashboard).
  6. **Suggested Supplier** column in the Purchasing List must be fully populated for all buyable items by mapping each line to a business from the Local Supplier Directory.
  7. **Granular orderable line rule (final gate):** Before publish, scan every material row. If any row is still an aggregate (“1 lot”, “assorted”, “set of consumables”), split or reject. The Purchasing List must contain only lines a coordinator can PO directly.

#### Order-Ready Dashboard (required first view)
- Project name, location & drawing revision
- Total priced value
- Confidence split: High / Medium / Low counts
- Number of TBC items still open
- Critical shortages (top 3–5)
- Pre-PO actions (exact confirmations needed)
- Long-lead items count
- Local vs Regional supplier coverage summary
- “Ready to order: YES / NO — human review outstanding”

#### Substitution table (when SKU missing)
| Preferred | Closest in list | Delta | Action |
|---|---|---|---|
| (missing SKU) | (nearest match) | colour / finish / thickness difference | confirm with designer / order external |

- **Tools:** Excel generation, file writing. Prefer formulas for subtotals.

---

## Completeness Categories (Scored Never-Reorder Checklist)

Agent 3 and Agent 6 must score every category. Score 1 if quantified as **granular orderable lines** **or** explicitly marked “not required for this scope”. Score 0 if silent or left as an aggregate. **Publish only at 100 %.**

| # | Category | Typical items (each must be discrete lines) | Score |
|---|---|---|---|
| 1 | Boards / Sheets | Gypsum, cement board, MDF, plywood, PVC (by thickness), acrylic | 0/1 |
| 2 | Framing / Metal | Studs, furring, C-channel, corner bead, battens | 0/1 |
| 3 | Skirting / Trim / Wainscot | PVC or timber skirting, WCT profiles | 0/1 |
| 4 | Paint & Coatings | Top coats by exact SKU / colour code (each colour a separate line via Colour-Code Registry), undercoat/sealer, gloss for doors, named finishes (e.g. Canvas Blue White) | 0/1 |
| 5 | Paint Tools & Protection | Rollers, brushes, trays, poles, **painter’s / masking tape (mandatory if any ACTIVE paint colour in registry)**, drop sheets, sandpaper (by grit) | 0/1 |
| 6 | Adhesives & Sealants | Contact/PU adhesive, paintable silicone, joint compound, joint tape | 0/1 |
| 7 | Fasteners | Partition/drywall screws (by length), concrete screws, tapping screws, wall plugs (by size) | 0/1 |
| 8 | Electrical – Cable | 1.5 mm (or project size) Red/Black/Blue/Green or RGB sets; earth | 0/1 |
| 9 | Electrical – Devices | Switches, dimmers, sockets, switch boxes | 0/1 |
| 10 | Electrical – Containment | PVC conduit, elbows, tees, flexible hose | 0/1 |
| 11 | Lighting | LED strips, downlights / surface panels, feature lights | 0/1 |
| 12 | Scaffolding / Access | Frames, braces, catwalks, pins — or “not required” | 0/1 |
| 13 | Custom / CNC | Finished pieces + raw sheets they consume | 0/1 |
| 14 | Relocation / Existing Services | Material impact of moves quantified as discrete lines | 0/1 |

---

## System-Level Directives (The OS Layer)

1. **State is explicit** — Agents share only the schema-defined JSON files.
2. **Fail fast, don’t block** — Unresolved items become `TBC` with exact confirmation text and continue.
3. **Auditability** — Before any tool use, output one sentence explaining why the tool is needed.
4. **Priority Order** — Accuracy > Completeness > Procurement Practicality > Cost Minimization. When in doubt, order more.
5. **Pack-size realism** — Purchase quantities must match how the supplier sells the item.
6. **Custom vs stock separation** — Finished fabricated pieces and raw sheets remain two lines.
7. **Site overrides drawing when verified** — Verified site fact that contradicts a drawing produces an explicit BOM impact line.
8. **Never-reorder completeness** — Purchasing list includes every consumable, tool, tape, plug, conduit fitting, and access component required to finish without a second order.
9. **Long-lead flag** — Any custom CNC, special colour, or non-stock item is automatically `long_lead = true`.
10. **Human checkpoint** — Low-confidence / TBC items are surfaced before final export whenever a human is available.
11. **Grounded Sourcing** — Supplier data is never generated from memory. It is always obtained via live web search. A `NULL` phone number is infinitely better than a hallucinated one. Every contact must have a Source URL for audit.
12. **Logistical Awareness** — The pipeline distinguishes “Local” (self-collect by site runner) from “Regional” (requires delivery/transport planning). This directly impacts the site logistics plan.
13. **Colour-Code Registry is authoritative** — Agent 2 builds the registry from all discovered colour codes. Every ACTIVE entry must produce a distinct item line; Agent 3 calculates each independently. No colour may be silently dropped or aggregated.
14. **Painter’s tape mandatory** — Whenever any ACTIVE paint colour exists in the registry (including named finishes such as Canvas Blue White), a quantified painter’s / masking tape line is required.
15. **Granular orderable lines** — Every material in the final output is a discrete, independently orderable PO line. Aggregates (“1 lot”, “assorted”, “set”) are forbidden in the published Purchasing List.

---

## Agent 6 QA Checklist (must pass every item)

- [ ] Every Low-confidence item has explicit TBC / confirmation text  
- [ ] Every paint qty mapped to 1 L / 5 L / 18 L / 20 L (or stated external)  
- [ ] **Colour-Code Registry is complete** — every discovered colour appears with status ACTIVE / NOT_REQUIRED / TBC  
- [ ] **Paint quantities are separated by colour code / SKU** (no multi-colour aggregation); each ACTIVE registry entry has its own line  
- [ ] Named finishes such as Canvas Blue White (and every other colour) appear as their own lines with independent quantities  
- [ ] Sheet materials show finished-piece **and** raw-sheet quantities where relevant  
- [ ] Wastage method recorded; higher value used  
- [ ] Price-list match status recorded for every buyable item  
- [ ] Missing dimensions remain NOT_SPECIFIED — no invented numbers  
- [ ] Scaffolding derived from working height (or explicitly “not required”)  
- [ ] Cable / conduit from geometry + contingency, whole rolls  
- [ ] Supporting consumables quantified from ratios or counts **as discrete lines**  
- [ ] **Painter’s / masking tape included and quantified whenever any ACTIVE paint colour exists in the registry**  
- [ ] Custom CNC / long-lead items flagged  
- [ ] Site-vs-drawing conflicts produce impact lines  
- [ ] Labour / transport / overhead excluded from material totals  
- [ ] Procurement list has unit prices and subtotal  
- [ ] Outstanding pre-PO actions listed (≤ 7 bullets on dashboard)  
- [ ] Confidence colour-coding applied  
- [ ] Calc Detail shows arithmetic for non-trivial items  
- [ ] Completeness Categories scored at 100 %  
- [ ] Order-Ready Dashboard present as first sheet  
- [ ] BOM Change Log present  
- [ ] Substitution table present for any missing SKU  
- [ ] **Local Supplier Directory contains only verified, tool-sourced businesses (zero hallucinated numbers)**  
- [ ] **Every WhatsApp / phone number has a corresponding Source URL for auditability**  
- [ ] **Regional fallback suppliers are listed for categories with no local presence**  
- [ ] **Suggested Supplier column in the Purchasing List is fully populated for all buyable items**  
- [ ] **Every material row is a granular, discrete, orderable line — no aggregates remain**  

---

## How to Use This Pipeline for Any Project

1. Feed Agents the raw inputs (drawings, existing BOM, price list, site notes, photos). Ensure project location is present or extractable.  
2. Run Agents 1 → 4.  
3. Human Checkpoint (review Low / TBC items).  
4. Agent 5 only for remaining Low items (max 2 searches each).  
5. Agent 7 (Sourcing) — live web search for local/regional suppliers by category.  
6. Agent 6 produces the Excel (including Local Supplier Directory and Suggested Supplier mapping). Publish only if Completeness score = 100 % and QA checklist passes — including the granular-orderable-line gate and Colour-Code Registry completeness.  
7. Coordinator orders from the Purchasing List, contacts the Suggested Suppliers (Local first), and uses the Source URLs to verify contacts if needed.

**Success Criterion**  
A purchasing coordinator takes the Agent 6 output and places the order.  
They never have to call the site to ask why the BOM was wrong, they never run out of material or consumables mid-job, they never dial a hallucinated phone number, they never receive a vague “1 lot” line they cannot PO, every colour is a separate orderable line, painter’s tape is never missing when painting exists, and every remaining uncertainty is written down with the exact confirmation that would close it.  
The pipeline is the single source of truth for any fit-out or construction materials package.

---

## Colour-Code Registry (Normalization Contract)

The Colour-Code Registry is a first-class output of Agent 2 and a required input for Agent 3.

**Purpose**  
Guarantee that every colour code or named finish discovered by Agent 1 becomes a visible, calculable, orderable line item (or is explicitly marked NOT_REQUIRED / TBC). No colour may disappear between extraction and calculation.

**Registry Schema (inside `normalized_state.json`)**
```json
"colour_code_registry": [{
  "colour_code": "",           // exact string as found (e.g. "Canvas Blue White")
  "material_family": "",       // Paint | Coating | etc.
  "source_refs": [],           // raw item IDs or page references
  "status": "",                // ACTIVE | NOT_REQUIRED | TBC
  "linked_item_ids": []        // IDs of the normalized item(s) created for this colour
}]
```

**Agent 2 obligations**
1. Build the registry from `colour_codes_found` + any additional codes in item text.
2. One unique entry per distinct colour / named finish.
3. Status = ACTIVE unless the source explicitly says the colour is not used.
4. Every ACTIVE entry must have at least one linked normalized item with `is_orderable_line = true`.
5. Multi-colour source lines must be split; each colour gets its own item and registry link.

**Agent 3 obligations**
1. Iterate the registry; calculate quantity for every ACTIVE colour independently.
2. If any ACTIVE paint colour exists, produce a quantified painter’s / masking tape line.
3. Never aggregate different colour codes.

**QA gate**  
Agent 6 rejects the package if any colour discovered by Agent 1 is missing from the registry or if an ACTIVE entry lacks a calculated quantity.

---

## Suggested System Upgrades (v3.3+ Roadmap)

1. **Colour-Code Registry + Multi-colour separation** (implemented)  
2. **Mandatory Painter’s Tape Gate** (implemented)  
3. **Granular orderable line enforcement** (implemented)  
4. **Pack-Size Intelligence Layer** — maintain a small versioned lookup of real supplier pack sizes so Agent 3 never hard-codes assumptions.  
5. **Geometry Confidence Score** — Agent 3 attaches High / Medium / Low based on whether dimensions came from latest drawing, site measurement, or assumption.  
6. **Pre-PO Action Auto-Summariser** — Agent 6 compiles the top 5–7 outstanding confirmations into a ready-to-copy WhatsApp format on the Dashboard.  
7. **Supplier Coverage Heatmap** — Agent 7 returns Local / Regional / Missing per category; Agent 6 surfaces any Missing category as critical.  
8. **Versioned State Snapshots** — after each agent write a timestamped copy of the state JSON for full audit and rollback.  
9. **Human Checkpoint UI Contract** — strict one-page summary schema so any reviewer can act in < 5 minutes.  
10. **Future Agent 8 – Price Reality Check** (optional) — query current list prices for highest-value lines after sourcing.
