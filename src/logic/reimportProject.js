/**
 * reimportProject.js — Agent 3: orchestrator for imports into an EXISTING project.
 *
 * Runs the merge diff first, then links supplier entries from the new file via
 * the same shared rule as the seed path (supplierLinking.js). Without this step,
 * a re-import that matches an existing project would update BOM rows but never
 * bring in suppliers — leaving the Suppliers tab empty with no explanation.
 *
 * Lane 1B, Option A (mergeEngine.js untouched — per Architecture invariant 2):
 *   isManual=true rows are QUARANTINED around the merge call.
 *   - Before merge: rows with isManual===true are removed from listBomItems' result
 *     (transparently swapped via a shim deps so merge never sees them).
 *   - After merge: they are still present in the DB (we only filtered the read),
 *     so the missing-items loop inside mergeEngine cannot reach them → no
 *     removed_item_pending rows are ever created for manual items.
 *   This works because mergeEngine's missing-items loop iterates over the stored
 *   rows it RECEIVED via listBomItems(deps). Filtering them at the deps layer is
 *   the whole of Option A's protection. mergeEngine itself is zero-change.
 */
import { mergeParsedImport } from './mergeEngine.js';
import { linkSupplierEntry, applyPresetsToUnassigned } from './supplierLinking.js';

/**
 * @returns {Promise<MergeResult & { supplierCount: number, presetsApplied: number, manualQuarantined: number }>}
 */
export const reimportProject = async (projectId, parsedImport, deps) => {
  const { listBomItems, ...restDeps } = deps;

  // Lane 1B Option A — isManual quarantine shim.
  // We wrap listBomItems to hide isManual=true rows from mergeEngine's
  // missing-items loop. The real rows stay in the DB untouched.
  // manualCount is captured for return-value instrumentation.
  let manualQuarantined = 0;
  const listBomItemsFiltered = async (pid) => {
    const rows = await listBomItems(pid);
    const kept = rows.filter((r) => {
      const manual = r.isManual === true;
      if (manual) manualQuarantined += 1;
      return !manual;
    });
    return kept;
  };

  const mergeDeps = { listBomItems: listBomItemsFiltered, ...restDeps };
  const merge = await mergeParsedImport(projectId, parsedImport, mergeDeps);

  const supplierRows = [];
  for (const entry of parsedImport.supplierEntries || []) {
    supplierRows.push(await linkSupplierEntry(projectId, entry, deps));
  }
  // Presets for rows still unassigned (manual links never touched).
  const presetsApplied = await applyPresetsToUnassigned(projectId, deps);
  return {
    ...merge,
    supplierCount: supplierRows.length,
    presetsApplied: presetsApplied.length,
    manualQuarantined,
  };
};

export default { reimportProject };
