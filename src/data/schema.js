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
 * ProjectSupplierLink { projectId, globalSupplierId, assignedToItemId? }
 * ChangeLogEntry    { id, projectId, timestamp, actor: "agent" | "supervisor",
 *                     field, oldValue, newValue }
 */

export const MANUAL_REASON_TAGS = ['site', 'missing', 'correction'];

export const DB_NAME = 'logistics-helper-v3';

export const STORES = {
  projects: 'id, name, createdAt',
  bomItems: 'id, projectId, category',
  shortageItems: 'id, projectId, resolved, kind',
  globalSuppliers: 'id, businessName',
  supplierLinks: '[projectId+globalSupplierId], projectId, globalSupplierId',
  changeLog: 'id, projectId, timestamp',
  presets: 'id, itemKey',
};

export const SHORTAGE_KINDS = ['agent_question', 'new_item_pending', 'removed_item_pending'];

export const CHANGELOG_ACTORS = ['agent', 'supervisor'];

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

export default STORES;
