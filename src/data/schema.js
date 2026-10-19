/**
 * schema.js — Agent 2: table definitions (config, not code).
 *
 * Project           { id, name, location, createdAt }
 *   + client: string | null (Task L/M prereq — manually entered, optional,
 *     never inferred from imports; blank means unset)
 * BomItem           { id, projectId, item, spec, category, netQty, wastagePct,
 *                     purchaseQty, unitCost, estTotal, basis, confidence, notes,
 *                     lockedFields: string[] }
 *   + displayOrder: number | null (Task L — cosmetic presentation order only;
 *     never read by merge/itemMatcher; null = legacy row, sorts last)
 *   + assignedSupplierId: string | null (Fast Ordering — item → GlobalSupplier FK;
 *     set manually or via ItemSupplierPreset; never locked, never merged)
 *   + isManual: bool | null (Lane 1B — true = hand-added; Option A reimport wrapper
 *     quarantines these rows so merge never queues them as removed_item_pending.
 *     Cosmetic marker only — merge/itemMatcher still exclude from MERGE_FIELDS.)
 *   + source: "manual" | "import" | null (Lane 1B — provenance tag, never merged.)
 *   + reasonTag: "site" | "missing" | "correction" | null (Lane 1B — one-tap reason.
 *     "site" feeds the weekly late-request count in the bot drafter.)
 *   + addedAt: string (ISO) | null (Lane 1B — automatic timestamp at manual-add time.
 *     Never inferred/overwritten on re-import.)
 * ItemSupplierPreset { id (= itemKey), itemKey, globalSupplierId, updatedAt }
 *   (Fast Ordering — supervisor-set memory, global across projects)
 * ShortageConfirmItem { id, projectId, severity, issue, missingInfo,
 *                       confirmationRequired, owner, resolved: bool,
 *                       kind: "agent_question" | "new_item_pending" | "removed_item_pending" }
 * GlobalSupplier    { id, businessName, contact, address, specialty, sourceUrl, tags }
 *   Supplier Hub (H2/H4) — additive only; `contact` stays the source of truth
 *   until `phones[]` is filled:
 *   + phones: [{ number, kind: 'mobile'|'landline'|'unknown', label }] | null
 *       kind is computed on the national form (src/logic/supplierPhones.js) and
 *       stored so the hub can show a WhatsApp button only for mobiles.
 *   + contactPerson, email: string | null
 *   + area: string | null (town; the seed's CSV had no town field, so `address`
 *     absorbed it — this is the additive home for the town)
 *   + status: 'active' | 'archived' (archive instead of delete when linked)
 *   + mergedInto: string | null (H4 — id of the surviving record; getSupplier
 *     follows the pointer, so an archived loser can never be matched again by
 *     supplierLinking's name+address key)
 * ProjectSupplierLink { projectId, globalSupplierId, assignedToItemId? }
 * ChangeLogEntry    { id, projectId, timestamp, actor: "agent" | "supervisor",
 *                     field, oldValue, newValue }
 * ImportRun         { id, fileType: "md" | "xlsx" | "csv", fileName, projectId,
 *                     lineCount, sourceLineCount, errors: [], warnings: [],
 *                     passed: bool, timestamp }
 *   (Lane 1A — passive trust scorecard. Records every import's verify pass.
 *     errors/warnings are mismatch objects {field, line, ref, expected, shown}.
 *     Never blocks an import; never read by merge/seed logic.)
 */

export const MANUAL_REASON_TAGS = ['site', 'missing', 'correction'];

export const DB_NAME = 'logistics-helper-v3';

export const STORES = {
  projects: 'id, name, location, createdAt',
  bomItems: 'id, projectId, category',
  shortageItems: 'id, projectId, resolved, kind',
  stockItems: 'id, itemKey, description, unit, startingCount, minThreshold, lastVerifiedAt',
  stockMovements: 'id, itemKey, type, quantity, linkedProjectId, linkedSupplierId, actor, note, timestamp',
  globalSuppliers: 'id, businessName',
  supplierLinks: '[projectId+globalSupplierId], projectId, globalSupplierId',
  changeLog: 'id, projectId, timestamp',
  presets: 'id, itemKey',
  importRuns: 'id, projectId, timestamp',
};

export const SHORTAGE_KINDS = ['agent_question', 'new_item_pending', 'removed_item_pending'];

export const CHANGELOG_ACTORS = ['agent', 'supervisor'];

/** H2 — a supplier is archived (never hard-deleted) when it is in use. */
export const SUPPLIER_STATUSES = ['active', 'archived'];

/** H2 — the phone kinds the classifier can produce. */
export const PHONE_KINDS = ['mobile', 'landline', 'unknown'];

/** Fresh defaults for a new BomItem row (lockedFields always an array). */
export const defaultBomItem = (partial = {}) => ({
  id: partial.id,
  projectId: partial.projectId ?? null,
  item: partial.item ?? null,
  spec: partial.spec ?? null,
  category: partial.category ?? null,
  unit: partial.unit ?? null,
  pack: partial.pack ?? null,
  netQty: partial.netQty ?? null,
  wastagePct: partial.wastagePct ?? null,
  purchaseQty: partial.purchaseQty ?? null,
  unitCost: partial.unitCost ?? null,
  estTotal: partial.estTotal ?? null,
  basis: partial.basis ?? null,
  confidence: partial.confidence ?? null,
  notes: partial.notes ?? null,
  lockedFields: Array.isArray(partial.lockedFields) ? [...partial.lockedFields] : [],
  displayOrder: typeof partial.displayOrder === 'number' ? partial.displayOrder : null,
  assignedSupplierId: partial.assignedSupplierId ?? null,
  // Lane 1B: provenance + protection. Never merged, never overwritten on re-import.
  // isManual=true is the signal for the Option A reimport wrapper to quarantine.
  isManual: partial.isManual === true ? true : null,
  source: partial.source === 'manual' || partial.source === 'import' ? partial.source : null,
  reasonTag: MANUAL_REASON_TAGS.includes(partial.reasonTag) ? partial.reasonTag : null,
  addedAt: typeof partial.addedAt === 'string' ? partial.addedAt : null,
  // Lane 3 (Stock Module): checklist + reconciliation fields.
  // fromStock: user ticked "prepared from workshop stock" → auto writes a stock "used" movement.
  fromStock: partial.fromStock === true ? true : false,
  // stockMovementId: links fromStock=true to the stock ledger "used" movement, so unticking reverses it.
  stockMovementId: typeof partial.stockMovementId === 'string' ? partial.stockMovementId : null,
  // doubtful: visual-only flag on this BOM row (supervisor marked the imported value suspect).
  // It does NOT change quick-order eligibility (Annex E rule restored: Annex E is driven by
  // Confirm refs only). This flag is unrelated to the stock "doubtful" state used by the
  // weekly quick-check — they share the word but are different fields.
  doubtful: partial.doubtful === true ? true : false,
  // receivedQty: actual physical quantity received against this line (PO → Stock "received" auto-touchpoint).
  receivedQty: typeof partial.receivedQty === 'number' && !Number.isNaN(partial.receivedQty) ? partial.receivedQty : null,
  // BOM checklist (BOM_CHECKLIST_MODE_SPEC): preparation tracking, separate from fromStock.
  // prepared: supervisor ticked "this item is prepared" — delivery readiness only.
  // preparedNote: free-text note on preparation state. Both are invisible to mergeEngine
  // (not in MERGE_FIELDS), exactly like displayOrder. Ticking writes a ChangeLogEntry.
  prepared: partial.prepared === true ? true : false,
  preparedNote: typeof partial.preparedNote === 'string' ? partial.preparedNote : null,
});

/** Fresh defaults for a new ShortageConfirmItem row. */
export const defaultShortageItem = (partial = {}) => ({
  id: partial.id,
  projectId: partial.projectId ?? null,
  severity: partial.severity ?? null,
  issue: partial.issue ?? null,
  missingInfo: partial.missingInfo ?? null,
  confirmationRequired: partial.confirmationRequired ?? null,
  owner: partial.owner ?? null,
  resolved: partial.resolved ?? false,
  kind: SHORTAGE_KINDS.includes(partial.kind) ? partial.kind : 'agent_question',
  // Optional payload refs for merge-engine pending items (which BOM row they point at).
  refItem: partial.refItem ?? null,
  refSpec: partial.refSpec ?? null,
  // Full row snapshot for approvals (new_item_pending carries the incoming row,
  // removed_item_pending carries the stored row). Schemaless extra — not indexed.
  snapshot: partial.snapshot ?? null,
});

export const IMPORT_FILE_TYPES = ['md', 'xlsx', 'csv'];

/** Fresh defaults for a new ImportRun row (Lane 1A scorecard). */
export const defaultImportRun = (partial = {}) => ({
  id: partial.id,
  fileType: IMPORT_FILE_TYPES.includes(partial.fileType) ? partial.fileType : null,
  fileName: typeof partial.fileName === 'string' && partial.fileName ? partial.fileName : null,
  projectId: partial.projectId ?? null,
  lineCount: typeof partial.lineCount === 'number' ? partial.lineCount : 0,
  sourceLineCount: typeof partial.sourceLineCount === 'number' ? partial.sourceLineCount : 0,
  errors: Array.isArray(partial.errors) ? partial.errors : [],
  warnings: Array.isArray(partial.warnings) ? partial.warnings : [],
  passed: partial.passed === true,
  timestamp: partial.timestamp ?? null,
});

export default STORES;
